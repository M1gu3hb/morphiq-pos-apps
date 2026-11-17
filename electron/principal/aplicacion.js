'use strict';
/**
 * Arma la app: sesiones, política de navegación, puente, ventana, impresión, actualización y menú.
 * `main.js` la usa tal cual y la prueba de humo la usa con ventanas ocultas.
 */
const path = require('node:path');
const { crearGestorDeVentana, PARTICION_DEL_POS } = require('./ventana');
const { aplicarPoliticaDeNavegacion, aplicarPermisos, aislarSesionDeImpresion } = require('./navegacion');
const { origenPermitido, esOrigenDelCliente } = require('./origen');
const { crearArchivos } = require('./archivos');
const { registrarPuente } = require('./puente');
const { crearMetodos } = require('./servicios');
const { crearDiagnostico } = require('./diagnostico');
const { crearMenuDelDuenio } = require('./menu');
const { crearActualizador } = require('./actualizador');
const { crearEjecutorDeAyudante } = require('./impresion/ayudante');
const { crearImpresorPorDriver } = require('./impresion/driver');
const { crearServicioDeImpresion } = require('./impresion/servicio');
const { crearUltimoTicket } = require('./impresion/ultimo-ticket');

const PARTICION_DE_IMPRESION = 'morphiq-impresion';

/**
 * @param {{
 *   electron: typeof import('electron'),
 *   cliente: import('./contexto').Cliente,
 *   rutas: ReturnType<typeof import('./contexto').rutasDeLaApp>,
 *   almacen: ReturnType<typeof import('./ajustes').crearAlmacenDeAjustes>,
 *   registrar: (mensaje: string) => void,
 *   opciones?: { oculta?: boolean, abrirAfuera?: (url: string) => void, conActualizador?: boolean },
 * }} deps
 */
function crearAplicacion({ electron, cliente, rutas, almacen, registrar, opciones = {} }) {
  const { app, BrowserWindow, Menu, dialog, ipcMain, screen, session, shell } = electron;
  const { oculta = false, abrirAfuera = (url) => void shell.openExternal(url), conActualizador = app.isPackaged } = opciones;
  const userData = app.getPath('userData');
  const contexto = { dominio: cliente.dominio, carpetaPantallas: rutas.pantallas };
  let modoLigeroAnterior = null;

  // --- sesiones: permisos y aislamiento de la ventana de impresión -------------------------
  aplicarPermisos(session.fromPartition(PARTICION_DEL_POS), cliente.dominio);
  aplicarPermisos(session.defaultSession, cliente.dominio);
  aislarSesionDeImpresion(session.fromPartition(PARTICION_DE_IMPRESION), cliente.dominio);

  // --- ventana ------------------------------------------------------------------------------
  /** @type {ReturnType<typeof crearMenuDelDuenio>} */
  let menu;
  const ventana = crearGestorDeVentana({
    electron,
    cliente,
    rutas,
    ajustes: almacen.leer,
    alAtajoDeMenu: () => menu.abrir(),
    alAtajoDeSalir: () => app.quit(),
    registrar,
    oculta,
  });

  const alCrearContenidos = (_evento, contenidos) =>
    aplicarPoliticaDeNavegacion(contenidos, {
      contexto,
      esPantallaCompleta: ventana.esPantallaCompleta,
      abrirAfuera,
      irA: (destino, url) => void destino.loadURL(url),
      registrar,
    });
  app.on('web-contents-created', alCrearContenidos);

  // --- impresión ----------------------------------------------------------------------------
  const ayudante = crearEjecutorDeAyudante({ rutaExe: rutas.ayudanteExe, rutaPs1: rutas.ayudantePs1 });
  const carpetaTemporal = path.join(app.getPath('temp'), 'morphiq-pos');
  const emitir = (evento, datos) => ventana.enviar(evento, datos);
  const ultimoTicket = crearUltimoTicket(path.join(userData, 'ultimo-ticket.json'));
  const servicio = crearServicioDeImpresion({
    ayudante,
    imprimirPorDriver: crearImpresorPorDriver({ BrowserWindow, carpetaTemporal }),
    carpetaTemporal,
    ajustes: almacen.leer,
    ultimoTicket,
    cliente,
    emitir,
  });

  // --- actualización ------------------------------------------------------------------------
  /** Un diálogo nativo sobre la ventana si existe (y suelto si no). */
  const mostrarDialogo = (opciones) => {
    const actual = ventana.ventana();
    return actual && !actual.isDestroyed() ? dialog.showMessageBox(actual, opciones) : dialog.showMessageBox(opciones);
  };
  const preguntarReinicio = async ({ titulo, detalle }) => {
    const { response } = await mostrarDialogo({
      type: 'info',
      title: cliente.nombre,
      message: titulo,
      detail: detalle,
      buttons: ['Reiniciar ahora', 'Al cerrar'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    return response === 0;
  };
  const actualizador = crearActualizador({
    autoUpdater: conActualizador ? require('electron-updater').autoUpdater : null,
    versionActual: cliente.version,
    cliente,
    canalDeActualizacion: require('../package.json').canalActualizacion,
    alCambiar: (estado) => emitir('actualizacion', estado),
    preguntarReinicio,
    motivoSinActualizar: conActualizador ? null : 'Las actualizaciones sólo funcionan en la app instalada, no en pruebas.',
  });

  // --- diagnóstico, modo ligero y métodos del contrato --------------------------------------
  /** `metodos.modoLigero` se asigna abajo; el diagnóstico lo pide perezosamente. */
  let leerModoLigero = () => ({ activo: false, origen: 'auto', motivo: '' });
  const diagnostico = crearDiagnostico({ cliente, screen, ayudante, modoLigero: () => leerModoLigero(), avisosPrevios: almacen.avisos });

  /** Efectos de guardar ajustes: lo que debe cambiar ya, sin reiniciar. */
  function aplicarAjustes(parche, nuevos) {
    if ('pantallaCompleta' in parche) ventana.ponerPantallaCompleta(nuevos.pantallaCompleta !== false);
    if ('arrancarConElSistema' in parche && app.isPackaged) {
      app.setLoginItemSettings({ openAtLogin: nuevos.arrancarConElSistema !== false });
    }
    if ('modoLigero' in parche) {
      const ahora = leerModoLigero();
      if (modoLigeroAnterior === null || modoLigeroAnterior.activo !== ahora.activo) emitir('modo-ligero', { activo: ahora.activo });
      modoLigeroAnterior = ahora;
    }
  }

  // --- los PDF de los cortes (1.0.2) ----------------------------------------------------------
  const archivos = crearArchivos({ carpetaDocumentos: app.getPath('documents'), shell, registrar });

  const { metodos, modoLigero } = crearMetodos({
    cliente,
    ajustes: almacen,
    servicio,
    ultimoTicket,
    diagnostico,
    ayudante,
    actualizador,
    ventana,
    archivos,
    aplicarAjustes,
    registrar,
  });
  leerModoLigero = modoLigero;
  modoLigeroAnterior = modoLigero();

  // Guardar archivos es la única excepción del puente: sólo desde la página de producción, NO desde
  // las pantallas internas (que sí pasan la revisión general).
  const soloProduccion = (url) => esOrigenDelCliente(url, cliente.dominio);
  const quitarPuente = registrarPuente({
    ipcMain,
    permitido: (url) => origenPermitido(url, contexto),
    reglas: { 'archivos.guardar': soloProduccion, 'archivos.abrirCarpeta': soloProduccion },
    metodos,
    registrar,
  });

  // --- menú del dueño -----------------------------------------------------------------------
  const avisarActualizacion = async () => {
    const r = await actualizador.buscar();
    const texto = {
      'al-dia': `Ya tienes la última versión (${r.versionActual}).`,
      descargando: `Hay una versión nueva (${r.versionNueva ?? ''}) y se está descargando.`,
      lista: `La versión ${r.versionNueva ?? ''} ya está lista; se instala al cerrar la app.`,
      disponible: `Hay una versión nueva (${r.versionNueva ?? ''}).`,
      error: r.mensaje ?? 'No se pudo buscar la actualización.',
    }[r.estado];
    await mostrarDialogo({ type: 'info', title: cliente.nombre, message: texto, noLink: true });
  };
  menu = crearMenuDelDuenio({ Menu, ventana, ajustes: almacen, buscarActualizacion: avisarActualizacion, salir: () => app.quit() });

  return {
    ventana,
    metodos,
    almacen,
    actualizador,
    servicio,
    arrancar() {
      Menu.setApplicationMenu(null);
      return almacen.leer().primerArranqueHecho ? ventana.cargarPos() : ventana.cargarPantalla('diagnostico');
    },
    cerrar() {
      quitarPuente();
      app.removeListener('web-contents-created', alCrearContenidos);
    },
  };
}

module.exports = { crearAplicacion };
