'use strict';
/**
 * Paso de la prueba de humo: el `electron-updater` REAL, dentro de la app empaquetada (con sus fuses),
 * pregunta por una actualización a un servidor local de mentira (127.0.0.1) que sirve un `latest.yml`.
 * No descarga ni instala nada (`autoDownload` apagado) y no toca la red de verdad.
 */
const http = require('node:http');

const FALSO_SHA512 = `${'A'.repeat(86)}==`;

function canalFalso(version) {
  return [
    `version: ${version}`,
    'files:',
    '  - url: instalador-de-mentira.exe',
    `    sha512: ${FALSO_SHA512}`,
    '    size: 1',
    'path: instalador-de-mentira.exe',
    `sha512: ${FALSO_SHA512}`,
    "releaseDate: '2026-01-01T00:00:00.000Z'",
    '',
  ].join('\n');
}

/** Sirve `latest.yml` con la versión que se le pida; devuelve `{ puerto, cambiar, cerrar, pedidos }`. */
function servidorDeCanal(versionInicial) {
  let version = versionInicial;
  const pedidos = [];
  const servidor = http.createServer((peticion, respuesta) => {
    pedidos.push(peticion.url);
    if (peticion.url.split('?')[0] === '/latest.yml') {
      respuesta.writeHead(200, { 'Content-Type': 'text/yaml' });
      respuesta.end(canalFalso(version));
    } else {
      respuesta.writeHead(404);
      respuesta.end();
    }
  });
  return new Promise((listo) => {
    servidor.listen(0, '127.0.0.1', () =>
      listo({
        puerto: servidor.address().port,
        pedidos,
        cambiar: (nueva) => {
          version = nueva;
        },
        cerrar: () => new Promise((fin) => servidor.close(fin)),
      }),
    );
  });
}

/**
 * @param {{ app: import('electron').App, versionActual: string, versionMasNueva: string }} datos
 * @returns {Promise<object>} lo que dijo electron-updater en cada caso, o `{ omitido }` si la app no está empaquetada
 */
async function comprobarElectronUpdater({ app, versionActual, versionMasNueva }) {
  if (!app.isPackaged) return { omitido: 'sólo se comprueba en la app empaquetada' };
  const { autoUpdater } = require('electron-updater');
  const servidor = await servidorDeCanal(versionActual);
  try {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.setFeedURL({ provider: 'generic', url: `http://127.0.0.1:${servidor.puerto}/` });
    const igual = await autoUpdater.checkForUpdates();
    servidor.cambiar(versionMasNueva);
    const nueva = await autoUpdater.checkForUpdates();
    return {
      versionInstalada: app.getVersion(),
      mismaVersion: { disponible: igual.isUpdateAvailable, anunciada: igual.updateInfo.version },
      versionMasNueva: { disponible: nueva.isUpdateAvailable, anunciada: nueva.updateInfo.version },
      pedidos: servidor.pedidos.length,
    };
  } finally {
    await servidor.cerrar();
  }
}

module.exports = { comprobarElectronUpdater, canalFalso };
