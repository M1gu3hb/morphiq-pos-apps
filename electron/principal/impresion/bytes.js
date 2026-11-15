'use strict';
/** Los únicos bytes que la app arma sola: página de prueba, pulso del cajón y renglón de reimpresión. */

const ESC_INICIO = Buffer.from([0x1b, 0x40]); // ESC @
/** `ESC p 0 25 250`: pulso al pin 2 del cajón, 50 ms encendido y 500 ms apagado. */
const PULSO_DE_CAJON = Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]);
/** `GS V 66 0`: avanza hasta la cuchilla y corta. */
const CORTE = Buffer.from([0x1d, 0x56, 0x42, 0x00]);
const AVANCE_DE_4_LINEAS = '\n\n\n\n';

/** Texto de impresora: sólo ASCII imprimible. Quita acentos y cambia lo demás por «?». */
function aAscii(texto) {
  return String(texto)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7e]/g, '?');
}

const dos = (n) => String(n).padStart(2, '0');

/** `dd/mm/aaaa hh:mm` en hora local. */
function fechaYHora(fecha) {
  const dia = `${dos(fecha.getDate())}/${dos(fecha.getMonth() + 1)}/${fecha.getFullYear()}`;
  return `${dia} ${dos(fecha.getHours())}:${dos(fecha.getMinutes())}`;
}

/**
 * @param {{ cliente: string, conexion: string, fecha: Date }} datos
 * @returns {Buffer} ESC/POS mínimo, sólo ASCII.
 */
function paginaDePrueba({ cliente, conexion, fecha }) {
  const lineas = [aAscii(cliente), fechaYHora(fecha), 'Pagina de prueba', `Conexion: ${aAscii(conexion)}`];
  const texto = `${lineas.join('\n')}\n${AVANCE_DE_4_LINEAS}`;
  return Buffer.concat([ESC_INICIO, Buffer.from(texto, 'ascii'), CORTE]);
}

/** El pulso del cajón: el `base64` dado, o el del perfil, o `ESC p 0 25 250`. */
function bytesDeCajon(base64) {
  if (typeof base64 === 'string' && base64 !== '') {
    const bytes = Buffer.from(base64, 'base64');
    if (bytes.length > 0) return bytes;
  }
  return Buffer.from(PULSO_DE_CAJON);
}

/** Reinicia la impresora y deja un renglón de texto simple antes del documento recordado. */
function renglonDeReimpresion(fecha) {
  return Buffer.concat([ESC_INICIO, Buffer.from(`*** REIMPRESION ${fechaYHora(fecha)} ***\n`, 'ascii')]);
}

module.exports = { paginaDePrueba, bytesDeCajon, renglonDeReimpresion, aAscii, fechaYHora, PULSO_DE_CAJON, CORTE };
