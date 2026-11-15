'use strict';
/**
 * El puente en el proceso principal: un `ipcMain.handle` por método del contrato y, en TODOS,
 * la revisión del origen de quien llama (`event.senderFrame`). Respuesta en sobre:
 * `{ ok: true, valor }` o `{ ok: false, error: { codigo, mensaje } }`; el preload rechaza la promesa.
 */
const { ErrorDeUso } = require('./impresion/errores');

const PREFIJO = 'morphiq:';
const CANAL_EXPUESTO = `${PREFIJO}expuesto`;
const CANAL_EVENTO = `${PREFIJO}evento`;
const ERROR_ORIGEN = Object.freeze({ codigo: 'ORIGEN', mensaje: 'Esta página no puede usar la app.' });

/** La URL del marco que llamó, o `null` si el marco ya no existe. */
function urlDelQueLlama(evento) {
  const marco = evento && evento.senderFrame;
  return marco && typeof marco.url === 'string' ? marco.url : null;
}

/**
 * @param {{
 *   ipcMain: import('electron').IpcMain,
 *   permitido: (url: string | null) => boolean,
 *   metodos: Record<string, (...args: unknown[]) => unknown>,
 *   registrar: (mensaje: string) => void,
 * }} deps
 * @returns {() => void} quita los manejadores
 */
function registrarPuente({ ipcMain, permitido, metodos, registrar }) {
  for (const [nombre, funcion] of Object.entries(metodos)) {
    ipcMain.handle(`${PREFIJO}${nombre}`, async (evento, ...argumentos) => {
      const url = urlDelQueLlama(evento);
      if (!permitido(url)) {
        registrar(`ORIGEN rechazado en ${nombre}: ${String(url).slice(0, 120)}`);
        return { ok: false, error: ERROR_ORIGEN };
      }
      try {
        return { ok: true, valor: await funcion(...argumentos) };
      } catch (error) {
        if (error instanceof ErrorDeUso) return { ok: false, error: { codigo: 'ARGUMENTOS', mensaje: error.message } };
        registrar(`Falló ${nombre}: ${error && error.stack ? error.stack : error}`);
        return { ok: false, error: { codigo: 'DESCONOCIDO', mensaje: `No se pudo completar: ${error && error.message ? error.message : error}` } };
      }
    });
  }
  // El preload pregunta una vez, al cargar, si debe exponer el puente a esa página.
  ipcMain.on(CANAL_EXPUESTO, (evento) => {
    evento.returnValue = permitido(urlDelQueLlama(evento));
  });
  return () => {
    for (const nombre of Object.keys(metodos)) ipcMain.removeHandler(`${PREFIJO}${nombre}`);
    ipcMain.removeAllListeners(CANAL_EXPUESTO);
  };
}

module.exports = { registrarPuente, urlDelQueLlama, PREFIJO, CANAL_EXPUESTO, CANAL_EVENTO, ERROR_ORIGEN };
