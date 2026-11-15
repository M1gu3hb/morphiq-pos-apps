'use strict';
/**
 * Paso de la prueba de humo: un iframe no puede navegar fuera del origen permitido. Usa una ventana
 * OCULTA con una página `data:` (la política de la app vale para TODO `webContents` que se crea).
 */

/** @returns {Promise<{ ajena: string, srcdoc: string, enBlanco: string }>} la URL del iframe tras cada intento */
async function comprobarMarcos({ BrowserWindow, esperar }) {
  const ventana = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, partition: 'humo-marcos' },
  });
  const web = ventana.webContents;
  const urlDelMarco = () => (web.mainFrame.frames[0] ? web.mainFrame.frames[0].url : '(sin iframe)');
  const poner = (codigo) => web.executeJavaScript(codigo, true);
  try {
    await ventana.loadURL(`data:text/html,${encodeURIComponent('<iframe id="f" src="about:blank"></iframe>')}`);
    await poner("document.getElementById('f').src = 'https://example.com/'");
    await esperar(2500);
    const ajena = urlDelMarco();
    await poner("document.getElementById('f').removeAttribute('src'); document.getElementById('f').srcdoc = '<p>ok</p>'");
    await esperar(800);
    const srcdoc = urlDelMarco();
    await poner("document.getElementById('f').removeAttribute('srcdoc'); document.getElementById('f').src = 'about:blank'");
    await esperar(500);
    return { ajena, srcdoc, enBlanco: urlDelMarco() };
  } finally {
    ventana.destroy();
  }
}

module.exports = { comprobarMarcos };
