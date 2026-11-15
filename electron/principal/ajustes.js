'use strict';
/** Ajustes del aparato: un JSON en `userData`, escritura atómica, mezcla superficial. */
const fs = require('node:fs');
const { leerJson, escribirJsonAtomico } = require('./archivo-json');
const { ErrorDeUso } = require('./impresion/errores');

/** Tope del archivo de ajustes: son preferencias, no una base de datos. */
const MAX_BYTES_AJUSTES = 256 * 1024;

const POR_OMISION = Object.freeze({
  version: 1,
  perfil: null,
  modoLigero: null,
  arrancarConElSistema: true,
  pantallaCompleta: true,
  aceleracionGpu: true,
  primerArranqueHecho: false,
});

function esObjeto(valor) {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor);
}

/** Mezcla superficial: lo del parche pisa lo guardado. `version` siempre queda en 1. */
function mezclarAjustes(actual, parche) {
  if (!esObjeto(parche)) throw new ErrorDeUso('Los ajustes a guardar deben ser un objeto.');
  return { ...actual, ...parche, version: 1 };
}

/**
 * @param {string} ruta archivo de ajustes
 * @returns {{ ajustes: object, avisos: string[] }}
 */
function leerAjustesSync(ruta) {
  const leido = leerJson(ruta);
  const avisos = [];
  if (leido.error) {
    avisos.push(leido.error);
    if (leido.valor === undefined) {
      // Se aparta el archivo dañado para no perderlo y para que la app arranque con lo de fábrica.
      try {
        fs.renameSync(ruta, `${ruta}.danado`);
      } catch (error) {
        avisos.push(`No se pudo apartar el archivo dañado: ${error.message}`);
      }
    }
  }
  const guardado = esObjeto(leido.valor) ? leido.valor : {};
  return { ajustes: { ...POR_OMISION, ...guardado, version: 1 }, avisos };
}

/** Un almacén en memoria respaldado por el archivo. */
function crearAlmacenDeAjustes(ruta) {
  const { ajustes, avisos } = leerAjustesSync(ruta);
  let actual = ajustes;
  return {
    avisos,
    leer: () => actual,
    guardar(parche) {
      const nuevo = mezclarAjustes(actual, parche);
      if (Buffer.byteLength(JSON.stringify(nuevo)) > MAX_BYTES_AJUSTES) {
        throw new ErrorDeUso('Los ajustes son demasiado grandes.');
      }
      escribirJsonAtomico(ruta, nuevo);
      actual = nuevo;
      return actual;
    },
  };
}

module.exports = { crearAlmacenDeAjustes, leerAjustesSync, mezclarAjustes, POR_OMISION, MAX_BYTES_AJUSTES };
