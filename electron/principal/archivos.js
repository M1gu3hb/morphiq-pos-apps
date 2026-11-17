'use strict';
/**
 * `MorphiqApp.archivos` (1.0.2): la ÚNICA excepción a «el puente no toca archivos».
 *
 * Guarda el PDF de un corte de caja en `Documentos\POS Don Poncho\Cortes\AAAA-MM\` y abre esa carpeta
 * en el Explorador. Los cerrojos:
 *
 *  1. SÓLO PDF: el contenido (base64) tiene que empezar con la firma `%PDF-` y no pasar de `MAX_BYTES`.
 *  2. SÓLO esa carpeta: la página NUNCA da un nombre ni una ruta. Da el folio del corte y su fecha; la
 *     app valida cada uno con una expresión estricta y arma ella misma `Corte-<folio>-<fecha>.pdf`. Aun
 *     así, después de `path.resolve` se comprueba que el destino quede DENTRO de la carpeta de cortes.
 *  3. SÓLO el origen de producción: lo exige `aplicacion.js` por método (`reglas` de `registrarPuente`,
 *     con `esOrigenDelCliente`); este módulo no sabe quién llama.
 *
 * Ninguna función lanza: el motivo viaja en el resultado (`ok: false`, `codigo`, `mensaje`).
 */
const nodefs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const CARPETA_DE_LA_APP = 'POS Don Poncho';
const CARPETA_DE_CORTES = 'Cortes';
/** 20 MiB: un corte largo son varias páginas PNG; un PDF de más es otra cosa. */
const MAX_BYTES = 20 * 1024 * 1024;
const FIRMA_PDF = '%PDF-';
const LLAVES_DE_GUARDAR = Object.freeze(['folio', 'fecha', 'base64']);

/** Serie y número como los arma el POS («CC-2», «DPC-0102», «42»): letras y números, hasta tres tramos con guion. */
const FOLIO = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+){0,2}$/;
const FOLIO_MAX = 24;
const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
const ANIO_MIN = 2000;
const ANIO_MAX = 2100;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
/** Nombres que Windows reserva como dispositivos (con o sin extensión). */
const RESERVADOS = /^(?:CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])$/i;

const MSG_NO_SE_PUDO = 'No se pudo guardar el PDF en tu carpeta de Documentos. Si el archivo está abierto en otro programa, ciérralo y vuelve a intentarlo.';

const fallo = (codigo, mensaje) => ({ ok: false, codigo, mensaje });

/** ¿`destino` queda DENTRO de `base` (no es la carpeta misma, ni una hermana con el mismo prefijo)? */
function estaDentro(base, destino) {
  const relativa = path.relative(path.resolve(base), path.resolve(destino));
  return relativa !== '' && relativa !== '..' && !relativa.startsWith(`..${path.sep}`) && !path.isAbsolute(relativa);
}

/** Valida el folio con una expresión estricta; devuelve el motivo o `null` si sirve. */
function motivoDelFolio(folio) {
  if (typeof folio !== 'string' || folio.length === 0 || folio.length > FOLIO_MAX || !FOLIO.test(folio)) {
    return 'El folio del corte sólo puede llevar letras, números y guiones (por ejemplo «DPC-0102»).';
  }
  if (RESERVADOS.test(folio)) return 'Ese folio no se puede usar como nombre de archivo.';
  return null;
}

/** Valida la fecha AAAA-MM-DD contra el calendario; devuelve `{ anio, mes }` o el motivo. */
function leerFecha(fecha) {
  const malo = { motivo: 'La fecha del corte debe ser AAAA-MM-DD y existir en el calendario.' };
  const partes = typeof fecha === 'string' ? FECHA.exec(fecha) : null;
  if (!partes) return malo;
  const [anio, mes, dia] = [Number(partes[1]), Number(partes[2]), Number(partes[3])];
  const real = new Date(Date.UTC(anio, mes - 1, dia));
  const existe = real.getUTCFullYear() === anio && real.getUTCMonth() === mes - 1 && real.getUTCDate() === dia;
  if (!existe || anio < ANIO_MIN || anio > ANIO_MAX) return malo;
  return { anio: partes[1], mes: partes[2] };
}

/** El nombre del archivo lo arma la app: `Corte-<folio>-<AAAA-MM-DD>.pdf`. */
function nombreDelCorte(folio, fecha) {
  return `Corte-${folio}-${fecha}.pdf`;
}

/** Decodifica el base64 con tope. Devuelve `{ bytes }` o `{ error }` ya como resultado. */
function leerContenido(base64) {
  if (typeof base64 !== 'string') return { error: fallo('ARGUMENTOS', 'El PDF debe venir como texto base64.') };
  // El tope se revisa ANTES de decodificar: un texto enorme no se convierte en memoria.
  if (base64.length > Math.ceil(MAX_BYTES / 3) * 4) return { error: fallo('MUY_GRANDE', 'El PDF es demasiado grande para guardarlo.') };
  if (base64.length % 4 !== 0 || !BASE64.test(base64)) return { error: fallo('ARGUMENTOS', 'El PDF no viene en base64 válido.') };
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length > MAX_BYTES) return { error: fallo('MUY_GRANDE', 'El PDF es demasiado grande para guardarlo.') };
  if (bytes.subarray(0, FIRMA_PDF.length).toString('latin1') !== FIRMA_PDF) {
    return { error: fallo('NO_ES_PDF', 'Sólo se pueden guardar archivos PDF.') };
  }
  return { bytes };
}

/** Valida lo que manda la página y devuelve `{ folio, fecha, mes, bytes }` o `{ error }`. */
function validarGuardado(datos) {
  if (typeof datos !== 'object' || datos === null || Array.isArray(datos)) {
    return { error: fallo('ARGUMENTOS', 'Faltan los datos del corte (folio, fecha y PDF).') };
  }
  const sobrantes = Object.keys(datos).filter((llave) => !LLAVES_DE_GUARDAR.includes(llave));
  if (sobrantes.length > 0) return { error: fallo('ARGUMENTOS', 'Sólo se aceptan el folio, la fecha y el PDF; el nombre y la carpeta los pone la app.') };
  const motivoFolio = motivoDelFolio(datos.folio);
  if (motivoFolio) return { error: fallo('ARGUMENTOS', motivoFolio) };
  const fecha = leerFecha(datos.fecha);
  if (fecha.motivo) return { error: fallo('ARGUMENTOS', fecha.motivo) };
  const contenido = leerContenido(datos.base64);
  if (contenido.error) return contenido;
  return { folio: datos.folio, fecha: datos.fecha, mes: `${fecha.anio}-${fecha.mes}`, bytes: contenido.bytes };
}

/**
 * @param {{
 *   carpetaDocumentos: string,
 *   shell: { openPath: (ruta: string) => Promise<string> },
 *   registrar: (mensaje: string) => void,
 *   fs?: typeof import('node:fs').promises,
 *   armarNombre?: (folio: string, fecha: string) => string,
 * }} deps `armarNombre` existe para probar el cerrojo de la carpeta; en la app es siempre `nombreDelCorte`.
 */
function crearArchivos({ carpetaDocumentos, shell, registrar, fs = nodefs.promises, armarNombre = nombreDelCorte }) {
  const carpetaDeCortes = path.resolve(carpetaDocumentos, CARPETA_DE_LA_APP, CARPETA_DE_CORTES);
  // Un guardado a la vez: dos del mismo corte no se pisan al reemplazar el archivo.
  let cola = Promise.resolve();

  async function escribir({ folio, fecha, mes, bytes }) {
    const carpetaDelMes = path.resolve(carpetaDeCortes, mes);
    const destino = path.resolve(carpetaDelMes, armarNombre(folio, fecha));
    if (!estaDentro(carpetaDelMes, destino)) {
      registrar(`archivos.guardar: un destino quedaba fuera de la carpeta del mes (${destino.slice(0, 120)})`);
      return fallo('FUERA_DE_CARPETA', 'Ese archivo no se puede guardar ahí.');
    }
    await fs.mkdir(path.dirname(destino), { recursive: true });
    let previo = null;
    try {
      previo = await fs.readFile(destino);
    } catch (error) {
      if (error && error.code !== 'ENOENT') throw error;
    }
    if (previo !== null && previo.equals(bytes)) return { ok: true, estado: 'ya-estaba', ruta: destino, bytes: bytes.length };
    const temporal = path.join(path.dirname(destino), `.${crypto.randomBytes(6).toString('hex')}.tmp`);
    try {
      await fs.writeFile(temporal, bytes, { flag: 'wx' });
      await fs.rename(temporal, destino);
    } catch (error) {
      await fs.rm(temporal, { force: true }).catch(() => {});
      throw error;
    }
    return { ok: true, estado: previo === null ? 'guardado' : 'reemplazado', ruta: destino, bytes: bytes.length };
  }

  async function guardarUno(datos) {
    try {
      const valido = validarGuardado(datos);
      if (valido.error) return valido.error;
      return await escribir(valido);
    } catch (error) {
      registrar(`archivos.guardar falló: ${error && error.stack ? error.stack : error}`);
      return fallo('NO_SE_PUDO', MSG_NO_SE_PUDO);
    }
  }

  function guardar(datos) {
    const turno = cola.then(() => guardarUno(datos));
    cola = turno.then(() => {}, () => {});
    return turno;
  }

  /** Abre `Documentos\POS Don Poncho\Cortes` y NINGUNA otra: no lee argumentos. */
  async function abrirCarpeta() {
    try {
      await fs.mkdir(carpetaDeCortes, { recursive: true });
      const error = await shell.openPath(carpetaDeCortes);
      if (error) {
        registrar(`archivos.abrirCarpeta: el Explorador respondió «${String(error).slice(0, 160)}»`);
        return fallo('NO_SE_PUDO', 'No se pudo abrir la carpeta de cortes.');
      }
      return { ok: true, ruta: carpetaDeCortes };
    } catch (error) {
      registrar(`archivos.abrirCarpeta falló: ${error && error.stack ? error.stack : error}`);
      return fallo('NO_SE_PUDO', 'No se pudo abrir la carpeta de cortes.');
    }
  }

  return { guardar, abrirCarpeta, carpetaDeCortes };
}

module.exports = { crearArchivos, estaDentro, nombreDelCorte, MAX_BYTES, CARPETA_DE_LA_APP, CARPETA_DE_CORTES };
