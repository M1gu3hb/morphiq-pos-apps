#!/usr/bin/env node
/**
 * Sirve en local lo que dejó `construir.mjs`, como lo hace Vercel: `/marca/*` de `static/` y todo
 * lo demás a la función empacada (la misma que se despliega).
 *
 *   CLIENTE=don-poncho node construir.mjs && PUERTO=3210 node herramientas/servidor-local.mjs
 *
 * Para probar sin GitHub: DESCARGAS_GITHUB=http://127.0.0.1:<puerto> (ver src/montar.mjs).
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const SALIDA = join(AQUI, '..', '.vercel', 'output');
const PUERTO = Number(process.env.PUERTO ?? 3210);
const ESTATICO = /^\/marca\/([A-Za-z0-9._-]+\.png)$/;

const entrada = join(SALIDA, 'functions', 'index.func', 'index.mjs');
if (!existsSync(entrada)) {
  console.error('Falta construir: CLIENTE=<id> node construir.mjs');
  process.exit(1);
}
const { default: manejador } = await import(pathToFileURL(entrada).href);

createServer((req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://local');
  const estatico = ESTATICO.exec(pathname);
  const archivo = estatico && join(SALIDA, 'static', 'marca', estatico[1]);
  if (archivo && existsSync(archivo)) {
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : readFileSync(archivo));
    return;
  }
  req.headers['x-forwarded-proto'] ??= 'http';
  manejador(req, res);
}).listen(PUERTO, '127.0.0.1', () => {
  console.log(`Descargas en http://127.0.0.1:${PUERTO}`);
});
