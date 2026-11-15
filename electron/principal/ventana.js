'use strict';
/**
 * La ventana única de la app: pantalla completa por omisión, sin barra de menú, con «Sin internet»
 * cuando la página no carga y los atajos del dueño (Ctrl+Shift+M menú, Ctrl+Shift+Q salir).
 */
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { origenPermitido, esPantallaInterna } = require('./origen');

const PARTICION_DEL_POS = 'persist:morphiq-pos';
/** `ERR_ABORTED`: una carga que se cancela porque empezó otra. No es una falla. */
const ERR_ABORTED = -3;

/** `Ctrl+Shift+M` abre el menú del dueño y `Ctrl+Shift+Q` sale. Cualquier otra tecla: `null`. */
function atajoDe(entrada) {
  if (entrada.type !== 'keyDown' || !entrada.control || !entrada.shift || entrada.alt) return null;
  const tecla = String(entrada.key).toLowerCase();
  if (tecla === 'm') return 'menu';
  return tecla === 'q' ? 'salir' : null;
}

/**
 * @param {{
 *   electron: typeof import('electron'),
 *   cliente: import('./contexto').Cliente,
 *   rutas: ReturnType<typeof import('./contexto').rutasDeLaApp>,
 *   ajustes: () => { pantallaCompleta?: boolean },
 *   alAtajoDeMenu: () => void,
 *   alAtajoDeSalir: () => void,
 *   registrar: (mensaje: string) => void,
 *   oculta?: boolean,
 * }} deps
 */
function crearGestorDeVentana(deps) {
  const { electron, cliente, rutas, ajustes, alAtajoDeMenu, alAtajoDeSalir, registrar, oculta = false } = deps;
  const { BrowserWindow, app } = electron;
  const contexto = { dominio: cliente.dominio, carpetaPantallas: rutas.pantallas };
  /** @type {import('electron').BrowserWindow | null} */
  let ventana = null;

  const urlDePantalla = (nombre) => pathToFileURL(path.join(rutas.pantallas, `${nombre}.html`)).href;
  const quiereCompleta = () => ajustes().pantallaCompleta !== false;

  function crear() {
    const nueva = new BrowserWindow({
      width: 1280,
      height: 800,
      minWidth: 800,
      minHeight: 500,
      show: !oculta,
      fullscreen: !oculta && quiereCompleta(),
      autoHideMenuBar: true,
      backgroundColor: '#161614',
      title: cliente.nombre,
      icon: rutas.icono,
      webPreferences: {
        preload: rutas.preload,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        webviewTag: false,
        devTools: !app.isPackaged,
        backgroundThrottling: false,
        partition: PARTICION_DEL_POS,
      },
    });
    nueva.setMenuBarVisibility(false);
    nueva.on('closed', () => {
      ventana = null;
    });
    conectarEventos(nueva);
    return nueva;
  }

  function conectarEventos(nueva) {
    const web = nueva.webContents;
    web.on('did-fail-load', (_e, codigo, descripcion, urlFallida, esMarcoPrincipal) => {
      if (!esMarcoPrincipal || codigo === ERR_ABORTED) return;
      registrar(`No cargó ${urlFallida}: ${descripcion} (${codigo})`);
      // Si lo que falló es una pantalla nuestra no se cae en un ciclo: se deja el error a la vista.
      if (!esPantallaInterna(urlFallida, rutas.pantallas)) cargarSinInternet();
    });
    web.on('render-process-gone', (_e, detalles) => {
      registrar(`El proceso de la página murió: ${detalles.reason}`);
      cargarSinInternet();
    });
    web.on('before-input-event', (evento, entrada) => {
      const atajo = atajoDe(entrada);
      if (atajo === null) return;
      evento.preventDefault();
      if (atajo === 'menu') alAtajoDeMenu();
      else alAtajoDeSalir();
    });
    if (app.isPackaged) {
      // Con la app empaquetada ningún atajo abre las herramientas de desarrollador.
      web.on('devtools-opened', () => web.closeDevTools());
    }
  }

  function asegurarVentana() {
    if (!ventana || ventana.isDestroyed()) ventana = crear();
    return ventana;
  }

  function cargarPos() {
    return asegurarVentana().loadURL(cliente.url);
  }

  function cargarPantalla(nombre) {
    return asegurarVentana().loadURL(urlDePantalla(nombre));
  }

  function cargarSinInternet() {
    const actual = asegurarVentana();
    if (actual.webContents.getURL() === urlDePantalla('sin-internet')) return Promise.resolve();
    return actual.loadURL(urlDePantalla('sin-internet'));
  }

  return {
    contexto,
    urlDePantalla,
    ventana: () => ventana,
    asegurarVentana,
    cargarPos,
    cargarPantalla,
    cargarSinInternet,
    enfocar() {
      if (!ventana) return;
      if (ventana.isMinimized()) ventana.restore();
      ventana.focus();
    },
    esPantallaCompleta: () => (ventana && !oculta ? ventana.isFullScreen() : quiereCompleta()),
    ponerPantallaCompleta(si) {
      if (ventana) ventana.setFullScreen(si);
    },
    recargar() {
      if (ventana) ventana.webContents.reload();
    },
    /** Manda un evento del puente a la ventana, sólo si lo que muestra es un origen permitido. */
    enviar(evento, datos) {
      if (!ventana || ventana.isDestroyed()) return;
      const web = ventana.webContents;
      if (origenPermitido(web.getURL(), contexto)) web.send('morphiq:evento', evento, datos);
    },
  };
}

module.exports = { crearGestorDeVentana, atajoDe, PARTICION_DEL_POS };
