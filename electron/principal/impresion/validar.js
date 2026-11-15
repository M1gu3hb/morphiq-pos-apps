'use strict';
/** Validación de lo que llega del puente: nada de la página se da por bueno. Lanza `ErrorDeUso`. */
const { ErrorDeUso } = require('./errores');

/** Tope de un documento (2 MB): un ticket con logo en imagen cabe de sobra. */
const MAX_BYTES_DOCUMENTO = 2 * 1024 * 1024;
const MAX_HTML = 2 * 1024 * 1024;
const CONEXIONES = ['spooler', 'driver', 'red', 'usb', 'bluetooth', 'serial'];
const MAX_COPIAS = 20;
const MAX_ESPERA_MS = 120_000;
const MIN_BLOQUE = 16;
const MAX_BLOQUE = 65_536;
const MAX_PAUSA_MS = 5000;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function entero(valor, nombre, { min, max, porOmision }) {
  if (valor === undefined || valor === null) return porOmision;
  if (!Number.isInteger(valor) || valor < min || valor > max) {
    throw new ErrorDeUso(`«${nombre}» debe ser un entero entre ${min} y ${max}.`);
  }
  return valor;
}

/** @returns {object} un `Destino` limpio (sólo las llaves del contrato) */
function validarDestino(destino) {
  if (!esObjeto(destino) || !CONEXIONES.includes(destino.conexion)) {
    throw new ErrorDeUso('El destino debe traer una «conexion» válida.');
  }
  const limpio = { conexion: destino.conexion };
  for (const llave of ['nombre', 'host', 'direccion', 'puertoSerie']) {
    if (destino[llave] !== undefined) {
      if (typeof destino[llave] !== 'string' || destino[llave].length > 256) throw new ErrorDeUso(`«${llave}» debe ser texto corto.`);
      limpio[llave] = destino[llave];
    }
  }
  for (const llave of ['puerto', 'baudios', 'vendorId', 'productId']) {
    if (destino[llave] !== undefined) limpio[llave] = entero(destino[llave], llave, { min: 0, max: 1_000_000, porOmision: undefined });
  }
  if (limpio.conexion === 'red') {
    if (!limpio.host || /[\s/\\]/.test(limpio.host)) throw new ErrorDeUso('Falta el «host» de la impresora de red.');
    if (limpio.puerto !== undefined && (limpio.puerto < 1 || limpio.puerto > 65_535)) throw new ErrorDeUso('El puerto de red no es válido.');
  }
  if ((limpio.conexion === 'spooler' || limpio.conexion === 'driver') && !limpio.nombre) {
    throw new ErrorDeUso('Falta el «nombre» de la impresora instalada.');
  }
  if (limpio.conexion === 'serial' && !/^COM[0-9]{1,3}$/i.test(limpio.puertoSerie ?? '')) {
    throw new ErrorDeUso('El puerto serie debe ser como «COM3».');
  }
  return limpio;
}

/** @returns {Buffer} los bytes de un documento crudo, ya decodificados */
function bytesDeDocumentoCrudo(documento) {
  if (typeof documento.base64 !== 'string' || !BASE64.test(documento.base64)) throw new ErrorDeUso('«base64» no es base64 válido.');
  const bytes = Buffer.from(documento.base64, 'base64');
  if (bytes.length > MAX_BYTES_DOCUMENTO) throw new ErrorDeUso('El documento es demasiado grande.');
  return bytes;
}

function validarDocumento(documento) {
  if (!esObjeto(documento)) throw new ErrorDeUso('Falta el documento.');
  if (documento.tipo === 'crudo') {
    bytesDeDocumentoCrudo(documento);
    return {
      tipo: 'crudo',
      base64: documento.base64,
      bloqueBytes: entero(documento.bloqueBytes, 'bloqueBytes', { min: MIN_BLOQUE, max: MAX_BLOQUE, porOmision: 4096 }),
      pausaMs: entero(documento.pausaMs, 'pausaMs', { min: 0, max: MAX_PAUSA_MS, porOmision: 0 }),
    };
  }
  if (documento.tipo === 'html') {
    if (typeof documento.html !== 'string' || documento.html.length === 0 || documento.html.length > MAX_HTML) {
      throw new ErrorDeUso('El «html» debe ser texto no vacío y de tamaño razonable.');
    }
    const ancho = documento.anchoMm;
    if (typeof ancho !== 'number' || !(ancho >= 20 && ancho <= 300)) throw new ErrorDeUso('«anchoMm» debe estar entre 20 y 300.');
    return { tipo: 'html', html: documento.html, anchoMm: ancho };
  }
  throw new ErrorDeUso('El «tipo» del documento debe ser «crudo» o «html».');
}

/** @returns {object} un `Trabajo` limpio */
function validarTrabajo(trabajo) {
  if (!esObjeto(trabajo)) throw new ErrorDeUso('El trabajo debe ser un objeto.');
  if (typeof trabajo.id !== 'string' || trabajo.id === '' || trabajo.id.length > 200) {
    throw new ErrorDeUso('El trabajo necesita un «id» de texto.');
  }
  const limpio = {
    id: trabajo.id,
    documento: validarDocumento(trabajo.documento),
    copias: entero(trabajo.copias, 'copias', { min: 1, max: MAX_COPIAS, porOmision: 1 }),
    esperaMs: entero(trabajo.esperaMs, 'esperaMs', { min: 500, max: MAX_ESPERA_MS, porOmision: 10_000 }),
  };
  if (trabajo.destino !== undefined) limpio.destino = validarDestino(trabajo.destino);
  if (trabajo.recordar !== undefined) {
    const { recordar } = trabajo;
    if (!esObjeto(recordar) || typeof recordar.titulo !== 'string' || recordar.titulo.length > 200) {
      throw new ErrorDeUso('«recordar» necesita un «titulo» de texto.');
    }
    const documento = validarDocumento(recordar.documento);
    if (documento.tipo !== 'crudo') throw new ErrorDeUso('«recordar» sólo guarda documentos crudos.');
    limpio.recordar = { titulo: recordar.titulo, documento };
  }
  return limpio;
}

module.exports = { validarTrabajo, validarDestino, validarDocumento, bytesDeDocumentoCrudo, MAX_BYTES_DOCUMENTO };
