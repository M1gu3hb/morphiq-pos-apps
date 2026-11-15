/**
 * Prueba el guion `morphiq-app-puente.js` (window.MorphiqApp) contra el contrato `puente/contrato.d.ts`
 * con un Capacitor de mentiras: cada método llama al plugin con el nombre y los argumentos correctos
 * y desenvuelve lo que devuelve el plugin. Corre con `npm run probar:puente`.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const AQUI = dirname(fileURLToPath(import.meta.url));
const GUION = readFileSync(join(AQUI, '..', 'android', 'app', 'src', 'main', 'assets', 'morphiq-app-puente.js'), 'utf8');
const CONTRATO = readFileSync(join(AQUI, '..', '..', 'puente', 'contrato.d.ts'), 'utf8');

/** Un Capacitor de mentiras: anota las llamadas y responde con lo que diga `respuestas[metodo]`. */
function entorno(respuestas = {}, { marco = 'principal' } = {}) {
  const llamadas = [];
  const oyentes = [];
  const window = {
    Capacitor: {
      nativePromise(plugin, metodo, datos) {
        // Como el puente real: lo que cruza a Android viaja serializado (y así no hay objetos de otro contexto).
        llamadas.push({ plugin, metodo, datos: JSON.parse(JSON.stringify(datos ?? null)) });
        const r = respuestas[metodo];
        if (r instanceof Error || (r && r.__error)) return Promise.reject(r.__error ?? r);
        return Promise.resolve(typeof r === 'function' ? r(datos) : r);
      },
      addListener(plugin, evento, alLlegar) {
        const oyente = { plugin, evento, alLlegar, quitado: false };
        oyentes.push(oyente);
        return {
          remove() {
            oyente.quitado = true;
          },
        };
      },
    },
  };
  window.window = window;
  // En el marco principal `window.top` es el propio window; en un iframe es la página que lo contiene.
  window.top = marco === 'principal' ? window : { otraPagina: true };
  vm.runInNewContext(GUION, window);
  return { window, llamadas, oyentes };
}

/** Los métodos que declara `interface MorphiqApp` en el contrato (los que son funciones). */
function metodosDelContrato() {
  const cuerpo = CONTRATO.slice(CONTRATO.indexOf('export interface MorphiqApp'));
  return [...cuerpo.matchAll(/^\s{2}([a-zA-Z]+)\(/gm)].map((m) => m[1]);
}

test('implementa TODOS los métodos del contrato y la versión 1', () => {
  const { window } = entorno();
  const metodos = metodosDelContrato();
  assert.ok(metodos.length >= 20, `el contrato debería traer ~21 métodos y se leyeron ${metodos.length}`);
  for (const m of metodos) assert.equal(typeof window.MorphiqApp[m], 'function', `falta ${m}()`);
  assert.equal(window.MorphiqApp.contrato, 1);
});

test('no expone nada que el contrato no declare', () => {
  const { window } = entorno();
  const permitidos = new Set([...metodosDelContrato(), 'contrato']);
  for (const llave of Object.keys(window.MorphiqApp)) assert.ok(permitidos.has(llave), `sobra ${llave}`);
});

test('window.MorphiqApp no se puede reemplazar ni modificar', () => {
  const { window } = entorno();
  const original = window.MorphiqApp;
  assert.throws(() => vm.runInNewContext('"use strict"; window.MorphiqApp = {}', window));
  assert.throws(() => vm.runInNewContext('"use strict"; window.MorphiqApp.imprimir = () => 1', window));
  assert.equal(window.MorphiqApp, original);
});

test('inyectar dos veces no pisa el puente', () => {
  const { window } = entorno();
  const primero = window.MorphiqApp;
  vm.runInNewContext(GUION, window);
  assert.equal(window.MorphiqApp, primero);
});

test('version y plataforma desenvuelven el valor', async () => {
  const { window, llamadas } = entorno({ version: { valor: '0.1.0' }, plataforma: { valor: 'android' } });
  assert.equal(await window.MorphiqApp.version(), '0.1.0');
  assert.equal(await window.MorphiqApp.plataforma(), 'android');
  assert.deepEqual(llamadas.map((l) => [l.plugin, l.metodo]), [['MorphiqApp', 'version'], ['MorphiqApp', 'plataforma']]);
});

test('impresoras, conexiones y ultimoTicket desenvuelven sus listas y el nulo', async () => {
  const { window } = entorno({
    impresoras: { impresoras: [{ id: 'usb:1:2' }] },
    conexiones: { conexiones: [{ conexion: 'red', disponible: true }] },
    ultimoTicket: { ticket: null },
  });
  assert.deepEqual(await window.MorphiqApp.impresoras(), [{ id: 'usb:1:2' }]);
  assert.deepEqual(await window.MorphiqApp.conexiones(), [{ conexion: 'red', disponible: true }]);
  assert.equal(await window.MorphiqApp.ultimoTicket(), null);
});

test('ultimoTicket devuelve el ticket cuando existe', async () => {
  const { window } = entorno({ ultimoTicket: { ticket: { titulo: 'Mesa 4', guardadoEn: '2026-11-14T10:00:00-0600' } } });
  assert.deepEqual(await window.MorphiqApp.ultimoTicket(), { titulo: 'Mesa 4', guardadoEn: '2026-11-14T10:00:00-0600' });
});

test('imprimir, abrirCajon, paginaDePrueba y estado pasan sus argumentos tal cual (u {} si faltan)', async () => {
  const { window, llamadas } = entorno({ imprimir: { ok: true }, abrirCajon: { ok: true }, paginaDePrueba: { ok: true }, estado: { soportado: false } });
  const trabajo = { id: 't1', documento: { tipo: 'crudo', base64: 'AA==' }, copias: 2 };
  assert.deepEqual(await window.MorphiqApp.imprimir(trabajo), { ok: true });
  await window.MorphiqApp.abrirCajon();
  await window.MorphiqApp.abrirCajon({ base64: 'G3AAGfo=' });
  await window.MorphiqApp.paginaDePrueba({ destino: { conexion: 'red', host: '10.0.0.9' } });
  await window.MorphiqApp.estado();
  assert.deepEqual(llamadas[0].datos, trabajo);
  assert.deepEqual(llamadas[1].datos, {});
  assert.deepEqual(llamadas[2].datos, { base64: 'G3AAGfo=' });
  assert.deepEqual(llamadas[3].datos, { destino: { conexion: 'red', host: '10.0.0.9' } });
  assert.deepEqual(llamadas[4].datos, {});
});

test('pedirPermiso manda el destino y guardarAjustes manda el parche', async () => {
  const { window, llamadas } = entorno({ pedirPermiso: { concedido: true }, guardarAjustes: (d) => ({ version: 1, ...d }) });
  assert.deepEqual(await window.MorphiqApp.pedirPermiso({ conexion: 'usb', vendorId: 1, productId: 2 }), { concedido: true });
  assert.deepEqual(await window.MorphiqApp.guardarAjustes({ modoLigero: true }), { version: 1, modoLigero: true });
  assert.deepEqual(llamadas[0].datos, { destino: { conexion: 'usb', vendorId: 1, productId: 2 } });
  assert.deepEqual(llamadas[1].datos, { modoLigero: true });
});

test('abrirPos y abrirDiagnostico resuelven sin valor', async () => {
  const { window } = entorno({ abrirPos: {}, abrirDiagnostico: {} });
  assert.equal(await window.MorphiqApp.abrirPos(), undefined);
  assert.equal(await window.MorphiqApp.abrirDiagnostico(), undefined);
});

test('un error del plugin llega como Error con .codigo (ORIGEN incluido)', async () => {
  const { window } = entorno({ diagnostico: { __error: { message: 'Esta página no puede usar la app.', code: 'ORIGEN' } } });
  await assert.rejects(window.MorphiqApp.diagnostico(), (error) => {
    assert.equal(error.name, 'Error');
    assert.equal(typeof error.stack, 'string');
    assert.equal(error.codigo, 'ORIGEN');
    assert.equal(error.code, 'ORIGEN');
    assert.equal(error.message, 'Esta página no puede usar la app.');
    return true;
  });
});

test('un error sin código se vuelve DESCONOCIDO', async () => {
  const { window } = entorno({ ajustes: { __error: { message: 'algo' } } });
  await assert.rejects(window.MorphiqApp.ajustes(), (error) => error.codigo === 'DESCONOCIDO');
});

test('si Capacitor no existe todavía (página sin puente nativo) se rechaza con ORIGEN, no se lanza', async () => {
  const { window } = entorno();
  delete window.Capacitor;
  await assert.rejects(window.MorphiqApp.version(), (error) => error.codigo === 'ORIGEN');
});

test('Capacitor se resuelve AL LLAMAR: el puente puede cargarse antes que Capacitor', async () => {
  const contexto = {};
  contexto.window = contexto;
  contexto.top = contexto;
  vm.runInNewContext(GUION, contexto);
  const llamadas = [];
  contexto.Capacitor = { nativePromise: (p, m) => (llamadas.push([p, m]), Promise.resolve({ valor: 'x' })) };
  assert.equal(await contexto.MorphiqApp.version(), 'x');
  assert.deepEqual(llamadas, [['MorphiqApp', 'version']]);
});

test('escuchar se suscribe al evento y devuelve la función que lo quita', () => {
  const { window, oyentes } = entorno();
  const recibidos = [];
  const quitar = window.MorphiqApp.escuchar('progreso', (datos) => recibidos.push(datos));
  assert.equal(typeof quitar, 'function');
  assert.equal(oyentes[0].plugin, 'MorphiqApp');
  assert.equal(oyentes[0].evento, 'progreso');
  oyentes[0].alLlegar({ id: 't1', enviados: 10, total: 20 });
  assert.deepEqual(recibidos, [{ id: 't1', enviados: 10, total: 20 }]);
  assert.equal(oyentes[0].quitado, false);
  quitar();
  assert.equal(oyentes[0].quitado, true);
});

test('escuchar exige una función', () => {
  const { window } = entorno();
  assert.throws(() => window.MorphiqApp.escuchar('progreso', null), (error) => error.name === 'TypeError');
});

test('dentro de un iframe el puente NO se instala (ni en el mismo origen)', () => {
  const { window } = entorno({}, { marco: 'iframe' });
  assert.equal(window.MorphiqApp, undefined);
});

test('en el marco principal sí se instala', () => {
  const { window } = entorno({}, { marco: 'principal' });
  assert.equal(typeof window.MorphiqApp.imprimir, 'function');
});
