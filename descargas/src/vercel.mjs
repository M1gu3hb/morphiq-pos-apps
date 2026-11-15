import { readFileSync } from 'node:fs';
import { montar } from './montar.mjs';

/**
 * La función de Vercel (Node). `construir.mjs` la empaca en `.vercel/output/functions/index.func/`
 * y deja a su lado `config.json`: el cliente, las imágenes y la última versión conocida.
 */

const config = JSON.parse(readFileSync(new URL('./config.json', import.meta.url), 'utf8'));
const responder = montar(config);

const FALLA = 'Algo falló. Vuelve a intentar en un momento.';

export default async function manejador(req, res) {
  let respuesta;
  try {
    const { pathname } = new URL(req.url ?? '/', 'http://local');
    respuesta = await responder({ metodo: req.method ?? 'GET', ruta: pathname, cabeceras: req.headers });
  } catch (error) {
    console.error('descargas: error inesperado', error);
    respuesta = { estado: 500, cabeceras: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }, cuerpo: FALLA };
  }
  res.statusCode = respuesta.estado;
  for (const [nombre, valor] of Object.entries(respuesta.cabeceras)) res.setHeader(nombre, valor);
  const cuerpo = Buffer.from(respuesta.cuerpo ?? '', 'utf8');
  res.setHeader('Content-Length', cuerpo.length);
  res.end(req.method === 'HEAD' ? undefined : cuerpo);
}
