'use strict';
/**
 * Impresión por el driver de Windows, sin diálogo: una ventana OCULTA carga el HTML y
 * `webContents.print({ silent: true, deviceName, ... })`. Sólo documentos `html`.
 * Compatible con Electron 22: `print(opciones, callback)`.
 *
 * La ventana tiene JavaScript APAGADO (`webPreferences.javascript: false`): el HTML del ticket es
 * maquetación estática (texto, estilos e imágenes `data:`) y no necesita ejecutar nada. Por lo mismo
 * el alto del contenido NO se mide con `executeJavaScript` (que con JS apagado falla), sino con el
 * protocolo de depuración (`Page.getLayoutMetrics`), que lee el diseño sin correr código de la página.
 */
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { ErrorDeImpresion, mensajeDeTiempo } = require('./errores');

const MICRAS_POR_PIXEL = 25400 / 96;
const MICRAS_POR_MM = 1000;
const ALTO_MINIMO_MICRAS = 20_000;

/** El alto del contenido en micras, con un mínimo para que el driver no rechace la página. */
function altoEnMicras(altoPx) {
  return Math.max(ALTO_MINIMO_MICRAS, Math.ceil(altoPx * MICRAS_POR_PIXEL));
}

function opcionesDeImpresion({ nombre, anchoMm, altoPx }) {
  return {
    silent: true,
    deviceName: nombre,
    margins: { marginType: 'none' },
    pageSize: { width: Math.round(anchoMm * MICRAS_POR_MM), height: altoEnMicras(altoPx) },
    printBackground: true,
  };
}

/** El alto del documento cargado, en píxeles CSS, leído del motor de diseño sin ejecutar JavaScript de la página. */
async function medirAltoEnPixeles(contenidos) {
  const depurador = contenidos.debugger;
  depurador.attach('1.3');
  try {
    const { cssContentSize, contentSize } = await depurador.sendCommand('Page.getLayoutMetrics');
    return (cssContentSize ?? contentSize).height;
  } finally {
    depurador.detach();
  }
}

/**
 * @param {{ BrowserWindow: typeof import('electron').BrowserWindow, carpetaTemporal: string }} entorno
 * @returns {(args: { nombre: string, html: string, anchoMm: number, esperaMs: number }) => Promise<{ bytes: number }>}
 */
function crearImpresorPorDriver({ BrowserWindow, carpetaTemporal }) {
  return async function imprimirPorDriver({ nombre, html, anchoMm, esperaMs }) {
    fs.mkdirSync(carpetaTemporal, { recursive: true });
    const archivo = path.join(carpetaTemporal, `${randomUUID()}.html`);
    fs.writeFileSync(archivo, html, 'utf8');
    const ventana = new BrowserWindow({
      show: false,
      width: Math.ceil((anchoMm / 25.4) * 96),
      height: 800,
      webPreferences: {
        javascript: false,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        webviewTag: false,
        devTools: false,
        partition: 'morphiq-impresion',
      },
    });
    let plazo;
    try {
      const trabajo = (async () => {
        await ventana.loadFile(archivo);
        const altoPx = await medirAltoEnPixeles(ventana.webContents);
        await new Promise((listo, fallo) => {
          ventana.webContents.print(opcionesDeImpresion({ nombre, anchoMm, altoPx }), (exito, motivo) => {
            if (exito) listo();
            else fallo(erroresDelMotivo(motivo));
          });
        });
        return { bytes: Buffer.byteLength(html) };
      })();
      const vence = new Promise((_, fallo) => {
        plazo = setTimeout(() => fallo(new ErrorDeImpresion('TIEMPO', mensajeDeTiempo(esperaMs))), esperaMs);
      });
      return await Promise.race([trabajo, vence]);
    } finally {
      clearTimeout(plazo);
      if (!ventana.isDestroyed()) ventana.destroy();
      fs.rmSync(archivo, { force: true });
    }
  };
}

/** Los motivos de Chromium vienen en inglés; se dicen en español corto. */
function erroresDelMotivo(motivo) {
  const texto = String(motivo ?? '');
  if (/invalid deviceName/i.test(texto)) return new ErrorDeImpresion('DESCONECTADA', 'No se encontró la impresora');
  if (/cancel/i.test(texto)) return new ErrorDeImpresion('CANCELADO', 'Se canceló la impresión');
  return new ErrorDeImpresion('DESCONOCIDO', texto === '' ? 'No se pudo imprimir' : `No se pudo imprimir (${texto})`);
}

module.exports = { crearImpresorPorDriver, opcionesDeImpresion, altoEnMicras, erroresDelMotivo, medirAltoEnPixeles };
