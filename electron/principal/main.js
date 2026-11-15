'use strict';
/**
 * Arranque de la app de Windows. Nada del cliente va escrito aquí: todo sale de
 * `generado/cliente.json` (`npm run preparar`).
 */
const os = require('node:os');
const path = require('node:path');
const electron = require('electron');
const { cargarCliente, rutasDeLaApp } = require('./contexto');
const { crearAlmacenDeAjustes } = require('./ajustes');
const { crearRegistro } = require('./registro');

const { app, dialog, powerSaveBlocker } = electron;
const MODO_HUMO = process.argv.includes('--prueba-humo');

function fallar(titulo, error) {
  console.error(`${titulo}: ${error && error.stack ? error.stack : error}`);
  dialog.showErrorBox(titulo, error && error.message ? error.message : String(error));
  app.exit(1);
}

function main() {
  let cliente;
  try {
    cliente = cargarCliente();
  } catch (error) {
    app.whenReady().then(() => fallar('La app no está preparada', error));
    return;
  }

  // La prueba de humo usa su propia carpeta de datos: no toca los ajustes ni la sesión reales.
  const userData = MODO_HUMO
    ? path.join(os.tmpdir(), `morphiq-humo-${process.pid}`)
    : path.join(app.getPath('appData'), cliente.nombre);
  app.setPath('userData', userData);
  const registrar = crearRegistro(path.join(userData, 'registro.log'));

  if (!MODO_HUMO && !app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  const almacen = crearAlmacenDeAjustes(path.join(userData, 'ajustes.json'));
  // La aceleración de GPU se decide ANTES de `ready`, por eso los ajustes se leen aquí, síncronos.
  if (almacen.leer().aceleracionGpu === false) app.disableHardwareAcceleration();
  almacen.avisos.forEach(registrar);

  const salida = process.argv.find((a) => a.startsWith('--salida='))?.slice('--salida='.length);
  const rutas = rutasDeLaApp({ empaquetada: app.isPackaged, recursos: process.resourcesPath, salida });

  app.whenReady().then(async () => {
    const { crearAplicacion } = require('./aplicacion');
    if (MODO_HUMO) {
      const { correrHumo } = require('./humo');
      const codigo = await correrHumo({ electron, cliente, rutas, almacen, registrar, crearAplicacion });
      app.exit(codigo);
      return;
    }
    const aplicacion = crearAplicacion({ electron, cliente, rutas, almacen, registrar });
    app.on('second-instance', () => aplicacion.ventana.enfocar());
    app.on('window-all-closed', () => app.quit());

    powerSaveBlocker.start('prevent-display-sleep');
    if (app.isPackaged) {
      app.setLoginItemSettings({ openAtLogin: almacen.leer().arrancarConElSistema !== false });
    }
    aplicacion.actualizador.programar();
    aplicacion.arrancar().catch((error) => registrar(`La primera carga falló: ${error.message}`));
  }).catch((error) => fallar('No se pudo arrancar', error));
}

main();
