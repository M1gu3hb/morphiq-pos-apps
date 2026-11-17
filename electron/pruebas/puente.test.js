'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { registrarPuente } = require('../principal/puente');
const { origenPermitido } = require('../principal/origen');
const { crearMetodos, conexionesDeWindows } = require('../principal/servicios');
const { validarTrabajo, validarDestino } = require('../principal/impresion/validar');
const { crearActualizador, urlDelCanal } = require('../principal/actualizador');
const { decidirDestino, permisoConcedido } = require('../principal/navegacion');
const { ErrorDeUso } = require('../principal/impresion/errores');
const { atajoDe } = require('../principal/ventana');

const DOMINIO = 'pos-don-poncho.vercel.app';
const CARPETA = path.resolve(__dirname, 'pantallas-falsas');
const contexto = { dominio: DOMINIO, carpetaPantallas: CARPETA };

function ipcFalso() {
  const manejadores = new Map();
  const escuchas = new Map();
  return {
    handle: (canal, f) => manejadores.set(canal, f),
    removeHandler: (canal) => manejadores.delete(canal),
    on: (canal, f) => escuchas.set(canal, f),
    removeAllListeners: (canal) => escuchas.delete(canal),
    invocar: (canal, url, ...args) => manejadores.get(canal)({ senderFrame: url === undefined ? null : { url } }, ...args),
    sincrono: (canal, url) => {
      const evento = { senderFrame: { url } };
      escuchas.get(canal)(evento);
      return evento.returnValue;
    },
    canales: () => [...manejadores.keys()],
  };
}

test('puente: TODO manejador revisa el origen y rechaza con ORIGEN sin ejecutar nada', async () => {
  const ipc = ipcFalso();
  let ejecuciones = 0;
  const metodos = {
    ajustes: () => ((ejecuciones += 1), {}),
    imprimir: () => ((ejecuciones += 1), {}),
    abrirCajon: () => ((ejecuciones += 1), {}),
  };
  registrarPuente({ ipcMain: ipc, permitido: (u) => origenPermitido(u, contexto), metodos, registrar: () => {} });
  const ajenas = [
    `https://${DOMINIO}.evil.com/`,
    `http://${DOMINIO}/`,
    'https://otro.vercel.app/',
    `https://evil.com/?u=${DOMINIO}`,
    'file:///C:/Windows/x.html',
    '',
    'about:blank',
    undefined,
  ];
  for (const canal of ipc.canales()) {
    for (const url of ajenas) {
      const r = await ipc.invocar(canal, url);
      assert.deepEqual([r.ok, r.error.codigo], [false, 'ORIGEN'], `${canal} desde ${url}`);
    }
  }
  assert.equal(ejecuciones, 0);
  const bueno = await ipc.invocar('morphiq:ajustes', `https://${DOMINIO}/n/don-poncho/login-pos`);
  assert.deepEqual(bueno, { ok: true, valor: {} });
  assert.equal(ejecuciones, 1);
});

test('puente: el preload sólo expone el puente a orígenes permitidos', () => {
  const ipc = ipcFalso();
  registrarPuente({ ipcMain: ipc, permitido: (u) => origenPermitido(u, contexto), metodos: {}, registrar: () => {} });
  assert.equal(ipc.sincrono('morphiq:expuesto', `https://${DOMINIO}/`), true);
  assert.equal(ipc.sincrono('morphiq:expuesto', 'https://evil.com/'), false);
  assert.equal(ipc.sincrono('morphiq:expuesto', 'data:text/html,hola'), false);
});

test('puente: un mal uso responde ARGUMENTOS y un fallo inesperado DESCONOCIDO', async () => {
  const ipc = ipcFalso();
  const registros = [];
  registrarPuente({
    ipcMain: ipc,
    permitido: () => true,
    metodos: {
      uso: () => {
        throw new ErrorDeUso('Falta el id');
      },
      roto: () => {
        throw new Error('boom');
      },
    },
    registrar: (m) => registros.push(m),
  });
  assert.deepEqual(await ipc.invocar('morphiq:uso', 'https://x'), { ok: false, error: { codigo: 'ARGUMENTOS', mensaje: 'Falta el id' } });
  const roto = await ipc.invocar('morphiq:roto', 'https://x');
  assert.equal(roto.error.codigo, 'DESCONOCIDO');
  assert.equal(registros.length, 1, 'el fallo inesperado se registra, no se traga');
});

test('contrato: el preload, el principal y contrato.d.ts exponen exactamente los mismos métodos', () => {
  const preload = fs.readFileSync(path.join(__dirname, '..', 'precarga', 'preload.js'), 'utf8');
  const lista = /const METODOS = \[([\s\S]*?)\];/.exec(preload)[1].match(/'([^']+)'/g).map((m) => m.slice(1, -1));
  const dts = fs.readFileSync(path.join(__dirname, '..', '..', 'puente', 'contrato.d.ts'), 'utf8');
  const cuerpo = /export interface MorphiqApp \{([\s\S]*?)\n\}/.exec(dts)[1];
  const delContrato = [...cuerpo.matchAll(/^\s{2}([a-zA-Z]+)\(/gm)].map((m) => m[1]).filter((n) => n !== 'escuchar');
  assert.deepEqual([...lista].sort(), [...delContrato].sort(), 'preload vs contrato.d.ts');

  const { metodos } = crearMetodos({
    cliente: { version: '1.0.0' },
    ajustes: { leer: () => ({}), guardar: () => ({}) },
    servicio: {},
    ultimoTicket: {},
    diagnostico: async () => ({}),
    ayudante: { ejecutar: async () => ({}) },
    actualizador: {},
    ventana: {},
    archivos: {},
    aplicarAjustes: () => {},
    registrar: () => {},
  });
  const deArchivos = Object.keys(metodos)
    .filter((n) => n.startsWith('archivos.'))
    .map((n) => n.slice('archivos.'.length))
    .sort();
  assert.deepEqual(Object.keys(metodos).filter((n) => !n.startsWith('archivos.')).sort(), [...delContrato].sort(), 'principal vs contrato.d.ts');
  assert.deepEqual(deArchivos, ['abrirCarpeta', 'guardar'], 'el principal sólo atiende esos dos de archivos');
  const interfazDeArchivos = /export interface ArchivosDeCortes \{([\s\S]*?)\n\}/.exec(dts)[1];
  const archivosDelContrato = [...interfazDeArchivos.matchAll(/^\s{2}([a-zA-Z]+)\(/gm)].map((m) => m[1]).sort();
  assert.deepEqual(archivosDelContrato, deArchivos, 'archivos: principal vs contrato.d.ts');
  assert.match(dts, /readonly contrato: 1;/);
});

test('contrato: la cabecera ya no dice «sin archivos» a secas: nombra la excepción y sus tres cerrojos', () => {
  const dts = fs.readFileSync(path.join(__dirname, '..', '..', 'puente', 'contrato.d.ts'), 'utf8');
  const cabecera = /\/\*\*([\s\S]*?)\*\//.exec(dts)[1];
  assert.match(cabecera, /ÚNICA EXCEPCIÓN/);
  assert.match(cabecera, /SÓLO PDF/);
  assert.match(cabecera, /SÓLO esa carpeta[\s\S]*Documentos\\POS Don Poncho\\Cortes\\AAAA-MM/);
  assert.match(cabecera, /SÓLO el origen de producción/);
  assert.match(dts, /readonly capacidades\?: readonly Capacidad\[\];/);
  assert.match(dts, /export type Capacidad = 'archivos';/);
});

test('conexiones: usb y bluetooth no disponibles en Windows, con su motivo', () => {
  const c = Object.fromEntries(conexionesDeWindows().map((x) => [x.conexion, x]));
  assert.equal(c.spooler.disponible && c.driver.disponible && c.red.disponible && c.serial.disponible, true);
  assert.equal(c.usb.disponible, false);
  assert.match(c.usb.motivo, /Windows/);
  assert.equal(c.bluetooth.disponible, false);
});

test('validación: destinos y trabajos de la página', () => {
  assert.throws(() => validarDestino({ conexion: 'red' }), ErrorDeUso);
  assert.throws(() => validarDestino({ conexion: 'red', host: '10.0.0.5 && calc' }), ErrorDeUso);
  assert.throws(() => validarDestino({ conexion: 'red', host: '10.0.0.5', puerto: 70000 }), ErrorDeUso);
  assert.throws(() => validarDestino({ conexion: 'serial', puertoSerie: 'COM3; x' }), ErrorDeUso);
  assert.throws(() => validarDestino({ conexion: 'spooler' }), ErrorDeUso);
  assert.throws(() => validarDestino({ conexion: 'infrarrojo' }), ErrorDeUso);
  assert.deepEqual(validarDestino({ conexion: 'red', host: '192.168.1.50', basura: 1 }), { conexion: 'red', host: '192.168.1.50' });
  const crudo = { tipo: 'crudo', base64: 'AA==' };
  assert.throws(() => validarTrabajo(null), ErrorDeUso);
  assert.throws(() => validarTrabajo({ documento: crudo }), ErrorDeUso);
  assert.throws(() => validarTrabajo({ id: 'x', documento: { tipo: 'crudo', base64: '***' } }), ErrorDeUso);
  assert.throws(() => validarTrabajo({ id: 'x', documento: crudo, copias: 0 }), ErrorDeUso);
  assert.throws(() => validarTrabajo({ id: 'x', documento: crudo, copias: 1000 }), ErrorDeUso);
  assert.throws(() => validarTrabajo({ id: 'x', documento: { tipo: 'html', html: '<p>', anchoMm: 5 } }), ErrorDeUso);
  assert.throws(() => validarTrabajo({ id: 'x', documento: crudo, recordar: { titulo: 'a', documento: { tipo: 'html', html: '<p>', anchoMm: 58 } } }), ErrorDeUso);
  const limpio = validarTrabajo({ id: 'x', documento: crudo });
  assert.deepEqual([limpio.copias, limpio.esperaMs, limpio.documento.bloqueBytes, limpio.documento.pausaMs], [1, 10_000, 4096, 0]);
});

test('navegación: decide dentro, afuera o bloqueado', () => {
  const dec = (url, pantallaCompleta) => decidirDestino({ url, contexto, pantallaCompleta });
  assert.equal(dec(`https://${DOMINIO}/x`, true), 'dentro');
  assert.equal(dec('https://example.com/', true), 'bloqueado', 'en pantalla completa se bloquea');
  assert.equal(dec('https://example.com/', false), 'afuera');
  assert.equal(dec('http://example.com/', false), 'bloqueado');
  assert.equal(dec('javascript:alert(1)', false), 'bloqueado');
  assert.equal(dec('file:///C:/Windows/x.html', false), 'bloqueado');
  assert.equal(dec(`https://${DOMINIO}.evil.com/`, false), 'afuera', 'otro host https sale al navegador, nunca dentro');
  assert.equal(dec('', false), 'bloqueado');
});

test('permisos: sólo cámara, pantalla completa y portapapeles de escritura, sólo al cliente', () => {
  const ok = (permiso, url, detalles) => permisoConcedido({ permiso, urlSolicitante: url, detalles, dominio: DOMINIO });
  const pos = `https://${DOMINIO}/x`;
  assert.equal(ok('media', pos, { mediaTypes: ['video'] }), true);
  assert.equal(ok('media', pos, { mediaTypes: ['video', 'audio'] }), false);
  assert.equal(ok('media', pos, { mediaTypes: ['audio'] }), false);
  assert.equal(ok('fullscreen', pos), true);
  assert.equal(ok('clipboard-sanitized-write', pos), true);
  for (const p of ['geolocation', 'notifications', 'clipboard-read', 'midi', 'openExternal', 'hid', 'serial', 'usb']) assert.equal(ok(p, pos), false, p);
  assert.equal(ok('media', 'https://evil.com/', { mediaTypes: ['video'] }), false);
  assert.equal(ok('fullscreen', `https://${DOMINIO}.evil.com/`), false);
});

function autoUpdaterFalso({ hayVersion = false } = {}) {
  const u = new EventEmitter();
  u.llamadas = [];
  u.setFeedURL = (opciones) => u.llamadas.push(['feed', opciones]);
  u.checkForUpdates = async () => {
    u.emit('checking-for-update');
    if (hayVersion) {
      u.emit('update-available', { version: '0.2.0' });
      return { isUpdateAvailable: true };
    }
    u.emit('update-not-available', {});
    return { isUpdateAvailable: false };
  };
  u.quitAndInstall = (...args) => u.llamadas.push(['instalar', args]);
  return u;
}

test('actualizador: URL del canal, al día, descarga, lista y diálogo', async () => {
  const cliente = { nombre: 'POS Don Poncho', releases: { repo: 'M1gu3hb/morphiq-pos-apps', canal: 'canal-don-poncho' } };
  assert.equal(urlDelCanal(cliente.releases), 'https://github.com/M1gu3hb/morphiq-pos-apps/releases/download/canal-don-poncho/');
  const eventos = [];
  const motor = autoUpdaterFalso({ hayVersion: true });
  const preguntas = [];
  const a = crearActualizador({
    autoUpdater: motor,
    versionActual: '0.1.0',
    cliente,
    canalDeActualizacion: 'win7',
    alCambiar: (e) => eventos.push(e.estado),
    preguntarReinicio: async (m) => (preguntas.push(m), true),
  });
  assert.deepEqual(motor.llamadas[0], ['feed', { provider: 'generic', url: urlDelCanal(cliente.releases), channel: 'win7' }]);
  assert.equal(motor.autoInstallOnAppQuit, true);
  assert.equal(motor.autoDownload, true);
  const r = await a.buscar();
  assert.deepEqual([r.estado, r.versionNueva], ['descargando', '0.2.0']);
  assert.equal(a.instalar().mensaje !== undefined, true, 'aún no está lista');
  motor.emit('download-progress', { percent: 50 });
  motor.emit('update-downloaded', { version: '0.2.0' });
  await new Promise((listo) => setImmediate(listo));
  assert.equal(a.estado().estado, 'lista');
  assert.match(preguntas[0].titulo, /POS Don Poncho tiene una actualización/);
  assert.equal(motor.llamadas.at(-1)[0], 'instalar', 'el usuario eligió reiniciar ahora');
  assert.ok(eventos.includes('descargando') && eventos.includes('lista'));
});

test('actualizador: al día, error de red y app sin empaquetar', async () => {
  const cliente = { nombre: 'X', releases: { repo: 'a/b', canal: 'c' } };
  const alDia = crearActualizador({ autoUpdater: autoUpdaterFalso(), versionActual: '1.0.0', cliente, alCambiar: () => {}, preguntarReinicio: async () => false });
  assert.equal((await alDia.buscar()).estado, 'al-dia');

  const roto = autoUpdaterFalso();
  roto.checkForUpdates = async () => {
    throw new Error('getaddrinfo ENOTFOUND github.com');
  };
  const conError = crearActualizador({ autoUpdater: roto, versionActual: '1.0.0', cliente, alCambiar: () => {}, preguntarReinicio: async () => false });
  const e = await conError.buscar();
  assert.equal(e.estado, 'error');
  assert.match(e.mensaje, /ENOTFOUND/);

  const sin = crearActualizador({ autoUpdater: null, versionActual: '1.0.0', cliente, alCambiar: () => {}, preguntarReinicio: async () => false });
  const s = await sin.buscar();
  assert.deepEqual([s.estado, /instalada/.test(s.mensaje)], ['error', true]);
  assert.equal(sin.instalar().estado, 'error');
});

test('atajos del dueño: Ctrl+Shift+M menú, Ctrl+Shift+Q salir, nada más', () => {
  const tecla = (key, extra = {}) => ({ type: 'keyDown', key, control: true, shift: true, alt: false, ...extra });
  assert.equal(atajoDe(tecla('M')), 'menu');
  assert.equal(atajoDe(tecla('m')), 'menu');
  assert.equal(atajoDe(tecla('Q')), 'salir');
  assert.equal(atajoDe(tecla('I')), null);
  assert.equal(atajoDe(tecla('M', { shift: false })), null);
  assert.equal(atajoDe(tecla('M', { control: false })), null);
  assert.equal(atajoDe(tecla('M', { alt: true })), null);
  assert.equal(atajoDe(tecla('M', { type: 'keyUp' })), null);
});
