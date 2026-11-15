'use strict';
/** Errores de impresión y su traducción a los códigos del contrato (mensajes cortos, en español). */

/** Un mal uso del puente (argumentos inválidos): la promesa se RECHAZA. */
class ErrorDeUso extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorDeUso';
    this.codigo = 'ARGUMENTOS';
  }
}

/** Un fallo de la impresora o de su conexión: viaja en el resultado (`ok: false`). */
class ErrorDeImpresion extends Error {
  /** @param {string} codigo uno de `CodigoDeError` @param {string} mensaje */
  constructor(codigo, mensaje) {
    super(mensaje);
    this.name = 'ErrorDeImpresion';
    this.codigo = codigo;
  }
}

const CODIGOS_DEL_CONTRATO = new Set([
  'ORIGEN',
  'SIN_PERFIL',
  'NO_SOPORTADO',
  'SIN_PERMISO',
  'DESCONECTADA',
  'SIN_PAPEL',
  'TAPA_ABIERTA',
  'TIEMPO',
  'CANCELADO',
  'DESCONOCIDO',
]);

/** Códigos de red de Node que significan «no hay nadie al otro lado». */
const FALLOS_DE_RED = new Set([
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNRESET',
  'EPIPE',
  'ECONNABORTED',
]);

/** El mensaje del tiempo agotado, con los segundos redondeados. */
function mensajeDeTiempo(esperaMs) {
  return `No respondió en ${Math.max(1, Math.round(esperaMs / 1000))} s`;
}

/**
 * Convierte cualquier cosa que se lance mientras se imprime en `{ codigo, mensaje }`.
 * @param {unknown} error
 * @returns {{ codigo: string, mensaje: string }}
 */
function traducirError(error) {
  if (error instanceof ErrorDeImpresion) return { codigo: codigoValido(error.codigo), mensaje: error.message };
  const codigoNode = error && typeof error === 'object' ? error.code : undefined;
  if (typeof codigoNode === 'string') {
    if (FALLOS_DE_RED.has(codigoNode)) return { codigo: 'DESCONECTADA', mensaje: 'Impresora desconectada' };
    if (codigoNode === 'ETIMEDOUT') return { codigo: 'TIEMPO', mensaje: 'La impresora no respondió' };
    if (codigoNode === 'EACCES' || codigoNode === 'EPERM') {
      return { codigo: 'SIN_PERMISO', mensaje: 'Windows no dejó usar la impresora' };
    }
    if (codigoNode === 'ENOENT') return { codigo: 'DESCONOCIDO', mensaje: 'Falta un archivo de la app para imprimir' };
  }
  const texto = error instanceof Error ? error.message : String(error);
  return { codigo: 'DESCONOCIDO', mensaje: `No se pudo imprimir: ${texto}` };
}

/** Cualquier código que el contrato no conozca se vuelve `DESCONOCIDO`. */
function codigoValido(codigo) {
  return CODIGOS_DEL_CONTRATO.has(codigo) ? codigo : 'DESCONOCIDO';
}

module.exports = { ErrorDeUso, ErrorDeImpresion, traducirError, mensajeDeTiempo, codigoValido, CODIGOS_DEL_CONTRATO };
