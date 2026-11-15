#!/usr/bin/env node
/**
 * CONSTRUYE LA PÁGINA DE DESCARGAS DE UN CLIENTE, con la Build Output API de Vercel:
 *
 *   CLIENTE=don-poncho node construir.mjs
 *
 * Deja en `.vercel/output/`:
 *   static/marca/logo-<huella>.png    el logo de `clientes/<id>.json`, reducido (cachea un año)
 *   static/marca/icono-<huella>.png   el ícono, a 64 px
 *   functions/index.func/             la función (un solo archivo) y su `config.json`
 *   config.json                       las rutas: los estáticos y, lo demás, a la función
 *
 * En `config.json` de la función va también la versión vigente al construir: si GitHub no
 * responde y la función acaba de arrancar, la página ofrece ésa (nunca un error en blanco). Si al
 * construir no se puede leer ninguna versión, la construcción falla y Vercel deja la anterior.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import sharp from 'sharp';
import { datosDePagina, leerFicha } from './src/cliente.mjs';
import { crearFuente } from './src/releases.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ_REPO = join(AQUI, '..');
const SALIDA = join(AQUI, '.vercel', 'output');
const ESTATICOS = join(SALIDA, 'static');
const FUNCION = join(SALIDA, 'functions', 'index.func');

const LOGO_CSS_PX = 180;
const ICONO_PX = 64;
const UN_ANIO = 31536000;

function huella(datos) {
  return createHash('sha256').update(datos).digest('hex').slice(0, 12);
}

async function imagen(origen, nombre, redimensionar) {
  const datos = await sharp(origen)
    .resize(redimensionar)
    .png({ palette: true, quality: 90, effort: 10, compressionLevel: 9 })
    .toBuffer({ resolveWithObject: true });
  const archivo = `${nombre}-${huella(datos.data)}.png`;
  writeFileSync(join(ESTATICOS, 'marca', archivo), datos.data);
  return { ruta: `/marca/${archivo}`, ancho: datos.info.width, alto: datos.info.height, bytes: datos.data.length };
}

async function principal() {
  const id = process.env.CLIENTE;
  if (!id) throw new Error('Falta la variable CLIENTE (p. ej. CLIENTE=don-poncho).');
  const ficha = leerFicha(RAIZ_REPO, id);
  const cliente = datosDePagina(ficha);

  rmSync(SALIDA, { recursive: true, force: true });
  mkdirSync(join(ESTATICOS, 'marca'), { recursive: true });
  mkdirSync(FUNCION, { recursive: true });

  // Logo a 2x del tamaño en pantalla; paleta indexada: pesa una fracción del original.
  const logo = await imagen(join(RAIZ_REPO, 'clientes', ficha.logo), 'logo', {
    width: LOGO_CSS_PX * 2,
    withoutEnlargement: true,
  });
  const icono = await imagen(join(RAIZ_REPO, 'clientes', ficha.icono), 'icono', {
    width: ICONO_PX,
    height: ICONO_PX,
    fit: 'contain',
  });
  const escala = logo.ancho / LOGO_CSS_PX;
  const estaticos = {
    logo: { ruta: logo.ruta, ancho: LOGO_CSS_PX, alto: Math.round(logo.alto / escala) },
    icono: { ruta: icono.ruta },
  };

  const fuente = crearFuente({ repo: cliente.repo, canal: cliente.canal, prefijo: cliente.prefijo });
  const conocida = await fuente.obtener();
  if (!conocida?.windows && !conocida?.android) {
    throw new Error(`No se pudo leer ninguna versión de ${cliente.repo} (canal ${cliente.canal}).`);
  }

  await build({
    entryPoints: [join(AQUI, 'src', 'vercel.mjs')],
    outfile: join(FUNCION, 'index.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    legalComments: 'none',
    logLevel: 'warning',
  });
  const config = { cliente, estaticos, conocida, construidoEn: new Date().toISOString() };
  writeFileSync(join(FUNCION, 'config.json'), `${JSON.stringify(config, null, 2)}\n`);
  writeFileSync(
    join(FUNCION, '.vc-config.json'),
    `${JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', maxDuration: 15 }, null, 2)}\n`,
  );

  const rutas = {
    version: 3,
    routes: [
      {
        src: '^/marca/(.*)$',
        headers: {
          'Cache-Control': `public, max-age=${UN_ANIO}, immutable`,
          'X-Content-Type-Options': 'nosniff',
          'X-Robots-Tag': 'noindex, nofollow',
        },
        continue: true,
      },
      { handle: 'filesystem' },
      { src: '^/(.*)$', dest: '/index' },
    ],
  };
  writeFileSync(join(SALIDA, 'config.json'), `${JSON.stringify(rutas, null, 2)}\n`);

  const linea = (p) => {
    const a = conocida[p];
    return a ? `${p}: ${a.version} (${a.origen}) ${a.archivo}${a.sha256 ? '' : ' SIN HUELLA'}` : `${p}: sin versión`;
  };
  console.log(`Descargas de ${cliente.nombre} listas en .vercel/output`);
  console.log(`  logo ${logo.bytes} bytes, ícono ${icono.bytes} bytes`);
  console.log(`  ${linea('windows')}`);
  console.log(`  ${linea('android')}`);
}

principal().catch((error) => {
  console.error(`No se construyó: ${error.message}`);
  process.exit(1);
});
