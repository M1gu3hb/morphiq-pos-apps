'use strict';
/** La 1.0.2 se instala ENCIMA de la 1.0.1 (y de la 1.0.0) con la actualización automática: tiene que contar como más nueva. */
const test = require('node:test');
const assert = require('node:assert/strict');
const EventEmitter = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const { NsisUpdater } = require('electron-updater');
const { crearActualizador } = require('../principal/actualizador');

const RAIZ = path.join(__dirname, '..', '..');
const { version, versionCode } = JSON.parse(fs.readFileSync(path.join(RAIZ, 'version.json'), 'utf8'));
// Se usa el MISMO `semver` que electron-updater para comparar: es el que decide de verdad.
const semver = require(require.resolve('semver', { paths: [path.dirname(require.resolve('electron-updater'))] }));

/** El `NsisUpdater` real con una `app` de mentira: sólo para preguntarle `isUpdateAvailable`. */
function actualizadorReal(versionInstalada) {
  const app = { version: versionInstalada, name: 'POS Don Poncho', isPackaged: true, getVersion: () => versionInstalada, getPath: () => path.join(RAIZ, 'electron'), getAppPath: () => RAIZ, on() {}, once() {} };
  const u = new NsisUpdater({ provider: 'generic', url: 'https://example.invalid/' }, app);
  u.currentVersion = new semver.SemVer(versionInstalada);
  return u;
}

test('version.json: es la 1.0.2 y su versionCode sube (no se puede reusar uno ya publicado: 1.0.1 fue el 3)', () => {
  assert.equal(version, '1.0.2');
  assert.equal(versionCode, 4);
});

test('electron-updater: una 1.0.1 instalada ve la 1.0.2 como más nueva (y la 1.0.0 también); la 1.0.2 ya no', async () => {
  assert.equal(await actualizadorReal('1.0.1').isUpdateAvailable({ version }), true);
  assert.equal(await actualizadorReal('1.0.0').isUpdateAvailable({ version }), true);
  assert.equal(await actualizadorReal(version).isUpdateAvailable({ version }), false);
});

test('actualizador: una 1.0.1 instalada ve la 1.0.2 como versión nueva y la descarga', async () => {
  const motor = new EventEmitter();
  motor.setFeedURL = () => {};
  motor.checkForUpdates = async () => {
    const hay = await actualizadorReal('1.0.1').isUpdateAvailable({ version });
    motor.emit(hay ? 'update-available' : 'update-not-available', hay ? { version } : {});
    return { isUpdateAvailable: hay };
  };
  const cliente = { nombre: 'POS Don Poncho', releases: { repo: 'a/b', canal: 'c' } };
  const a = crearActualizador({ autoUpdater: motor, versionActual: '1.0.1', cliente, alCambiar: () => {}, preguntarReinicio: async () => false });
  const r = await a.buscar();
  assert.deepEqual([r.estado, r.versionActual, r.versionNueva], ['descargando', '1.0.1', '1.0.2']);
});

test('electron-updater: la 1.0.1 es más nueva que la 1.0.0, y no al revés ni igual', async () => {
  assert.equal(await actualizadorReal('1.0.0').isUpdateAvailable({ version: '1.0.1' }), true);
  assert.equal(await actualizadorReal('1.0.1').isUpdateAvailable({ version: '1.0.1' }), false);
  assert.equal(await actualizadorReal('1.0.1').isUpdateAvailable({ version: '1.0.0' }), false);
  assert.equal(await actualizadorReal('1.0.9').isUpdateAvailable({ version: '1.0.10' }), true, 'compara por números, no por texto');
});

test('actualizador: una 1.0.0 instalada ve la versión actual (1.0.2) como nueva y la descarga', async () => {
  const motor = new EventEmitter();
  motor.setFeedURL = () => {};
  const instalada = '1.0.0';
  motor.checkForUpdates = async () => {
    const hay = await actualizadorReal(instalada).isUpdateAvailable({ version: version });
    if (hay) motor.emit('update-available', { version });
    else motor.emit('update-not-available', {});
    return { isUpdateAvailable: hay };
  };
  const cliente = { nombre: 'POS Don Poncho', releases: { repo: 'a/b', canal: 'c' } };
  const a = crearActualizador({ autoUpdater: motor, versionActual: instalada, cliente, alCambiar: () => {}, preguntarReinicio: async () => false });
  const r = await a.buscar();
  assert.deepEqual([r.estado, r.versionActual, r.versionNueva], ['descargando', '1.0.0', version]);
});
