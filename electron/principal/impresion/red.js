'use strict';
/** Envío por red: un socket TCP a la impresora (puerto 9100 por omisión), por bloques y con pausa. */
const net = require('node:net');
const { ErrorDeImpresion, mensajeDeTiempo, traducirError } = require('./errores');

const PUERTO_POR_OMISION = 9100;
const BLOQUE_POR_OMISION = 4096;
const ESPERA_POR_OMISION_MS = 10_000;
/** Cuánto se espera a que la impresora cierre su lado tras el último byte, antes de cortar. */
const GRACIA_DE_CIERRE_MS = 300;

const pausa = (ms) => new Promise((listo) => setTimeout(listo, ms));

/**
 * Abre el socket con un plazo total. Si el plazo vence, destruye el socket y falla con `TIEMPO`.
 * @returns {Promise<{ socket: net.Socket, vencido: () => boolean, soltar: () => void }>}
 */
function conectar({ host, puerto, esperaMs }) {
  return new Promise((resolver, rechazar) => {
    const socket = net.connect({ host, port: puerto });
    let seVencio = false;
    const temporizador = setTimeout(() => {
      seVencio = true;
      socket.destroy();
    }, esperaMs);
    const soltar = () => clearTimeout(temporizador);
    socket.setNoDelay(true);
    socket.once('connect', () => {
      socket.removeListener('error', alFallar);
      socket.removeListener('close', alCerrar);
      // Un 'error' sin oyente tumba el proceso: aquí sólo se corta el socket; el fallo sale por el callback de la escritura o por 'close'.
      socket.on('error', () => socket.destroy());
      resolver({ socket, vencido: () => seVencio, soltar });
    });
    function alFallar(error) {
      soltar();
      if (seVencio) return rechazar(new ErrorDeImpresion('TIEMPO', mensajeDeTiempo(esperaMs)));
      const { codigo, mensaje } = traducirError(error);
      rechazar(new ErrorDeImpresion(codigo, mensaje));
    }
    function alCerrar() {
      soltar();
      rechazar(new ErrorDeImpresion('TIEMPO', mensajeDeTiempo(esperaMs)));
    }
    socket.once('error', alFallar);
    socket.once('close', alCerrar);
  });
}

function escribir(socket, trozo) {
  return new Promise((listo, fallo) => {
    socket.write(trozo, (error) => (error ? fallo(error) : listo()));
  });
}

/**
 * @param {{
 *   host: string, puerto?: number, datos: Buffer, bloqueBytes?: number, pausaMs?: number,
 *   esperaMs?: number, alProgreso?: (enviados: number, total: number) => void,
 * }} opciones
 * @returns {Promise<{ bytes: number }>} rechaza con `ErrorDeImpresion` (o error de Node traducible)
 */
async function enviarPorRed({
  host,
  puerto = PUERTO_POR_OMISION,
  datos,
  bloqueBytes = BLOQUE_POR_OMISION,
  pausaMs = 0,
  esperaMs = ESPERA_POR_OMISION_MS,
  alProgreso,
}) {
  const { socket, vencido, soltar } = await conectar({ host, puerto, esperaMs });
  try {
    for (let desde = 0; desde < datos.length; desde += bloqueBytes) {
      await escribir(socket, datos.subarray(desde, desde + bloqueBytes));
      const enviados = Math.min(desde + bloqueBytes, datos.length);
      if (alProgreso) alProgreso(enviados, datos.length);
      if (pausaMs > 0 && enviados < datos.length) await pausa(pausaMs);
    }
    await new Promise((listo) => {
      if (socket.destroyed) return listo();
      const gracia = setTimeout(() => {
        socket.destroy();
        listo();
      }, GRACIA_DE_CIERRE_MS);
      socket.once('close', () => {
        clearTimeout(gracia);
        listo();
      });
      socket.end();
    });
  } catch (error) {
    // Si el plazo mató el socket, el error de escritura que sale es consecuencia, no la causa.
    if (vencido()) throw new ErrorDeImpresion('TIEMPO', mensajeDeTiempo(esperaMs));
    const { codigo, mensaje } = traducirError(error);
    throw new ErrorDeImpresion(codigo, mensaje);
  } finally {
    soltar();
    socket.destroy();
  }
  if (vencido()) throw new ErrorDeImpresion('TIEMPO', mensajeDeTiempo(esperaMs));
  return { bytes: datos.length };
}

module.exports = { enviarPorRed, conectar, PUERTO_POR_OMISION, BLOQUE_POR_OMISION, ESPERA_POR_OMISION_MS };
