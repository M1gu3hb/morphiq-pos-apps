'use strict';
/**
 * `npm run construir` arma el instalador de Windows en `salida/`; con `--legado` arma la variante
 * Windows 7/8 (Electron 22, ia32, `-win7`, canal `win7`).
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { preparar } = require('./preparar');
const { compilarAyudante } = require('./compilar-ayudante');

const RAIZ = path.join(__dirname, '..');
const BUILDER = path.join(RAIZ, 'node_modules', 'electron-builder', 'cli.js');

/** El `<canal>.yml` que quedó en `salida/` tiene que anunciar la versión de `version.json` (si no, nadie se actualiza). */
function comprobarCanal({ legado }) {
  const cliente = JSON.parse(fs.readFileSync(path.join(RAIZ, 'generado', 'cliente.json'), 'utf8'));
  const archivo = path.join(RAIZ, 'salida', `${legado ? 'win7' : 'latest'}.yml`);
  const texto = fs.readFileSync(archivo, 'utf8');
  const anunciada = /^version: (.+)$/m.exec(texto)?.[1];
  if (anunciada !== cliente.version) {
    throw new Error(`${path.basename(archivo)} anuncia la versión ${anunciada} y la app es la ${cliente.version}`);
  }
  console.log(`> ${path.basename(archivo)} anuncia la versión ${anunciada}`);
}

function construir({ legado }) {
  console.log(`> preparar cliente: ${preparar()}`);
  console.log(`> ayudante: ${compilarAyudante().ruta}`);
  const argumentos = [BUILDER, '--win', legado ? '--ia32' : '--x64', '--publish', 'never', '--config', 'electron-builder.config.js'];
  console.log(`> electron-builder ${legado ? '(legado: Electron 22 ia32)' : '(x64)'}`);
  execFileSync(process.execPath, argumentos, {
    cwd: RAIZ,
    stdio: 'inherit',
    env: { ...process.env, MORPHIQ_LEGADO: legado ? '1' : '0', CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
  });
  comprobarCanal({ legado });
}

if (require.main === module) {
  try {
    construir({ legado: process.argv.includes('--legado') });
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = { construir };
