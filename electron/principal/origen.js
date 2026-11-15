'use strict';
/**
 * Quién puede hablar con el puente. Módulo puro (sin Electron) para poder probarlo con trampas.
 * La regla: origen `https://<dominio>` EXACTO (se compara `new URL(...).origin`, nunca
 * `startsWith`/`includes`) o un archivo dentro de la carpeta de pantallas internas.
 */
const path = require('node:path');
const { fileURLToPath } = require('node:url');

/** @param {unknown} texto @returns {URL | null} */
function analizar(texto) {
  if (typeof texto !== 'string' || texto === '') return null;
  try {
    return new URL(texto);
  } catch {
    // Una URL que no se puede leer no es de nadie: se rechaza, no es un error de la app.
    return null;
  }
}

/** ¿La URL es de la página de producción del cliente? (https, host exacto, puerto por omisión). */
function esOrigenDelCliente(url, dominio) {
  const u = analizar(url);
  if (!u || typeof dominio !== 'string' || dominio === '') return false;
  return u.protocol === 'https:' && u.origin === `https://${dominio.toLowerCase()}`;
}

/** ¿La URL es un archivo dentro de la carpeta de pantallas internas? */
function esPantallaInterna(url, carpetaPantallas) {
  const u = analizar(url);
  if (!u || u.protocol !== 'file:' || typeof carpetaPantallas !== 'string' || carpetaPantallas === '') return false;
  let archivo;
  try {
    archivo = fileURLToPath(u);
  } catch {
    // `file://servidor/...` fuera de Windows, o una ruta mal formada: no es una pantalla nuestra.
    return false;
  }
  const relativa = path.relative(path.resolve(carpetaPantallas), path.resolve(archivo));
  return relativa !== '' && !relativa.startsWith('..') && !path.isAbsolute(relativa);
}

/**
 * @param {unknown} url
 * @param {{ dominio: string, carpetaPantallas: string }} contexto
 */
function origenPermitido(url, contexto) {
  return esOrigenDelCliente(url, contexto.dominio) || esPantallaInterna(url, contexto.carpetaPantallas);
}

module.exports = { esOrigenDelCliente, esPantallaInterna, origenPermitido };
