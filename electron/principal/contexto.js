'use strict';
/** Lo que la app sabe de sí misma: el cliente (de `generado/cliente.json`) y dónde está cada cosa. */
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const CAMPOS_DEL_CLIENTE = ['id', 'nombre', 'nombreCorto', 'url', 'dominio', 'releases', 'version'];

/**
 * @typedef {{
 *   id: string, nombre: string, nombreCorto: string, appId: string, url: string, dominio: string,
 *   releases: { repo: string, canal: string }, version: string, firma: string,
 * }} Cliente
 */

/** Lee y revisa `generado/cliente.json`; si falta algo, dice qué y cómo arreglarlo. */
function cargarCliente(raiz = RAIZ) {
  const ruta = path.join(raiz, 'generado', 'cliente.json');
  let texto;
  try {
    texto = fs.readFileSync(ruta, 'utf8');
  } catch (error) {
    throw new Error(`Falta ${ruta} (${error.message}). Corre «npm run preparar» primero.`);
  }
  const cliente = JSON.parse(texto);
  const faltan = CAMPOS_DEL_CLIENTE.filter((campo) => cliente[campo] === undefined);
  if (faltan.length > 0) throw new Error(`generado/cliente.json no trae: ${faltan.join(', ')}.`);
  const url = new URL(cliente.url);
  if (url.protocol !== 'https:' || url.hostname !== cliente.dominio) {
    throw new Error('generado/cliente.json: la «url» debe ser https y del «dominio» permitido.');
  }
  return cliente;
}

/** Las rutas de la app; `empaquetada` cambia dónde viven el ayudante y su respaldo. */
function rutasDeLaApp({ empaquetada, recursos, raiz = RAIZ, salida }) {
  const carpetaAyudante = empaquetada ? path.join(recursos, 'ayudante') : path.join(raiz, 'ayudante');
  return {
    raiz,
    pantallas: path.join(raiz, 'generado', 'pantallas'),
    icono: path.join(raiz, 'generado', 'icono.png'),
    preload: path.join(raiz, 'precarga', 'preload.js'),
    ayudanteExe: empaquetada ? path.join(carpetaAyudante, 'ayudante.exe') : path.join(raiz, 'compilado', 'ayudante.exe'),
    ayudantePs1: path.join(carpetaAyudante, 'ayudante.ps1'),
    // Dentro del .asar no se puede escribir: la prueba de humo de la app empaquetada pasa `--salida=<carpeta>`.
    salida: salida ?? path.join(raiz, 'salida'),
  };
}

module.exports = { cargarCliente, rutasDeLaApp, RAIZ };
