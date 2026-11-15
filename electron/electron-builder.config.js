'use strict';
/**
 * Configuración de electron-builder. Nada del cliente va escrito aquí: sale de `generado/cliente.json`.
 * `MORPHIQ_LEGADO=1` arma la variante para Windows 7/8 (Electron 22, ia32, sufijo `-win7`, canal `win7`).
 */
const cliente = require('./generado/cliente.json');
const { afterPack } = require('./herramientas/fuses');

const legado = process.env.MORPHIQ_LEGADO === '1';
const ELECTRON_LEGADO = '22.3.27';
const prefijo = cliente.nombre.replace(/\s+/g, '-');
const sufijo = legado ? '-win7' : '';
const canalDeActualizacion = legado ? 'win7' : 'latest';

module.exports = {
  appId: cliente.appId,
  productName: cliente.nombre,
  copyright: cliente.firma,
  ...(legado ? { electronVersion: ELECTRON_LEGADO } : {}),
  directories: { output: 'salida' },
  files: ['principal/**', 'precarga/**', 'generado/**', 'package.json', '!**/*.map'],
  extraMetadata: {
    version: cliente.version,
    // La app lo lee para pedir el `<canal>.yml` correcto (`latest.yml` o `win7.yml`).
    ...(legado ? { canalActualizacion: canalDeActualizacion } : {}),
  },
  extraResources: [
    { from: 'compilado/ayudante.exe', to: 'ayudante/ayudante.exe' },
    { from: 'ayudante/Ayudante.cs', to: 'ayudante/Ayudante.cs' },
    { from: 'ayudante/ayudante.ps1', to: 'ayudante/ayudante.ps1' },
  ],
  asar: true,
  // Voltea los fuses de Electron en el .exe ya empaquetado (RunAsNode apagado, OnlyLoadAppFromAsar encendido…).
  afterPack,
  win: {
    target: [{ target: 'nsis', arch: [legado ? 'ia32' : 'x64'] }],
    icon: 'generado/icono.png',
  },
  nsis: {
    oneClick: true,
    perMachine: false,
    allowToChangeInstallationDirectory: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: cliente.nombre,
    runAfterFinish: true,
    deleteAppDataOnUninstall: false,
    artifactName: `${prefijo}-Setup-\${version}${sufijo}.exe`,
  },
  publish: {
    provider: 'generic',
    url: `https://github.com/${cliente.releases.repo}/releases/download/${cliente.releases.canal}/`,
    channel: canalDeActualizacion,
  },
};
