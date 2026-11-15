'use strict';
/**
 * `npm run construir` arma el instalador de Windows en `salida/`; con `--legado` arma la variante
 * Windows 7/8 (Electron 22, ia32, `-win7`, canal `win7`).
 */
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { preparar } = require('./preparar');
const { compilarAyudante } = require('./compilar-ayudante');

const RAIZ = path.join(__dirname, '..');
const BUILDER = path.join(RAIZ, 'node_modules', 'electron-builder', 'cli.js');

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
