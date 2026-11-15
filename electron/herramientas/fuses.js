'use strict';
/**
 * Fuses de Electron (DP-D125): se voltean en el `.exe` empaquetado, desde el `afterPack` de electron-builder.
 *
 *  - `RunAsNode` APAGADO: el `.exe` de la app ya no se puede usar como un Node suelto (`ELECTRON_RUN_AS_NODE=1`)
 *    para correr código arbitrario con la firma y los permisos de la app.
 *  - `EnableNodeOptionsEnvironmentVariable` APAGADO: `NODE_OPTIONS` se ignora.
 *  - `EnableNodeCliInspectArguments` APAGADO: `--inspect` y compañía se ignoran.
 *  - `OnlyLoadAppFromAsar` ENCENDIDO: sólo se carga el código del `app.asar` (no una carpeta `app/` suelta).
 *
 * Nada de esto lo usa la app: el ayudante C# es un `.exe` aparte que se lanza directo (no es Node), la
 * actualización la hace electron-updater lanzando el instalador NSIS, y el código vive en `app.asar`.
 * La variante para Windows 7/8 (Electron 22) no se toca: es otro binario, que no se ha comprobado con fuses.
 */
const path = require('node:path');
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');

/** Lo que se pide a los fuses. Cualquier otro fuse se deja como lo trae Electron. */
const FUSES_DESEADOS = Object.freeze({
  version: FuseVersion.V1,
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
});

/** Voltea los fuses de un binario de Electron (la ruta al `.exe`). */
async function voltearFuses(rutaDelExe) {
  await flipFuses(rutaDelExe, { ...FUSES_DESEADOS });
}

/** El gancho `afterPack` de electron-builder. */
async function afterPack(contexto) {
  if (contexto.electronPlatformName !== 'win32') return;
  if (process.env.MORPHIQ_LEGADO === '1') {
    console.log('  • fuses: variante legado (Electron 22), no se tocan');
    return;
  }
  const exe = path.join(contexto.appOutDir, `${contexto.packager.appInfo.productFilename}.exe`);
  await voltearFuses(exe);
  console.log(`  • fuses volteados en ${path.basename(exe)}`);
}

module.exports = { afterPack, voltearFuses, FUSES_DESEADOS };
