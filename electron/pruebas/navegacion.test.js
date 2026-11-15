'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { EventEmitter } = require('node:events');
const { aplicarPoliticaDeNavegacion, marcoPuedeNavegar } = require('../principal/navegacion');

const DOMINIO = 'pos-don-poncho.vercel.app';
const CARPETA = path.resolve(__dirname, 'pantallas-falsas');
const contexto = { dominio: DOMINIO, carpetaPantallas: CARPETA };

/** Un `webContents` falso con la política puesta; devuelve lo que la política hizo. */
function conPolitica({ pantallaCompleta = true } = {}) {
  const contenidos = new EventEmitter();
  contenidos.setWindowOpenHandler = () => {};
  const hecho = { registros: [], afuera: [] };
  aplicarPoliticaDeNavegacion(contenidos, {
    contexto,
    esPantallaCompleta: () => pantallaCompleta,
    abrirAfuera: (url) => hecho.afuera.push(url),
    irA: () => {},
    registrar: (mensaje) => hecho.registros.push(mensaje),
  });
  /** Dispara `will-frame-navigate` con la forma de Electron 25+ (un solo objeto con `url` e `isMainFrame`). */
  const marco = (url, { isMainFrame = false, isSameDocument = false } = {}) => {
    const evento = { url, isMainFrame, isSameDocument, prevenido: false, preventDefault() { this.prevenido = true; } };
    contenidos.emit('will-frame-navigate', evento);
    return evento;
  };
  return { contenidos, hecho, marco };
}

test('iframe: sólo navega al origen permitido, a about:blank o a about:srcdoc', () => {
  const { marco, hecho } = conPolitica();
  for (const url of ['about:blank', 'about:srcdoc', `https://${DOMINIO}/ruta?x=1`, pathToFileURL(path.join(CARPETA, 'diagnostico.html')).href]) {
    assert.equal(marco(url).prevenido, false, url);
  }
  assert.deepEqual(hecho.registros, []);
});

test('iframe: a cualquier otro origen se bloquea (y se anota), sin abrir el navegador del sistema', () => {
  const { marco, hecho } = conPolitica({ pantallaCompleta: false });
  const ajenos = [
    'https://example.com/',
    `https://${DOMINIO}.evil.com/`,
    `https://evil.com/${DOMINIO}`,
    `http://${DOMINIO}/`,
    `https://${DOMINIO}:8443/`,
    'data:text/html,<p>x</p>',
    'blob:https://example.com/uuid',
    'javascript:alert(1)',
    'file:///C:/Windows/System32/drivers/etc/hosts',
    'about:blank#algo',
    'about:srcdoc?x',
    'chrome://gpu',
    '',
  ];
  for (const url of ajenos) assert.equal(marco(url).prevenido, true, url || '(vacía)');
  assert.equal(hecho.registros.length, ajenos.length);
  assert.match(hecho.registros[0], /Navegación de un iframe bloqueada: https:\/\/example\.com\//);
  assert.deepEqual(hecho.afuera, [], 'un iframe nunca saca nada al navegador del sistema');
});

test('iframe: el marco principal lo siguen decidiendo will-navigate y will-redirect, no este oyente', () => {
  const { marco, contenidos, hecho } = conPolitica();
  assert.equal(marco('https://example.com/', { isMainFrame: true }).prevenido, false, 'will-frame-navigate no toca el marco principal');
  const evento = { prevenido: false, preventDefault() { this.prevenido = true; } };
  contenidos.emit('will-navigate', evento, 'https://example.com/');
  assert.equal(evento.prevenido, true);
  assert.equal(hecho.registros.length, 1, 'sólo una anotación (la de will-navigate)');
});

test('iframe: un cambio dentro del mismo documento (ancla) no se toca', () => {
  const { marco } = conPolitica();
  assert.equal(marco('about:srcdoc#seccion', { isSameDocument: true }).prevenido, false);
});

test('iframe: también entiende la forma vieja del evento (url e isMainFrame como argumentos)', () => {
  const { contenidos } = conPolitica();
  const evento = { prevenido: false, preventDefault() { this.prevenido = true; } };
  contenidos.emit('will-frame-navigate', evento, 'https://example.com/', false, false);
  assert.equal(evento.prevenido, true);
  const principal = { prevenido: false, preventDefault() { this.prevenido = true; } };
  contenidos.emit('will-frame-navigate', principal, 'https://example.com/', false, true);
  assert.equal(principal.prevenido, false);
});

test('marcoPuedeNavegar: la función pura decide igual', () => {
  assert.equal(marcoPuedeNavegar({ url: 'about:blank', contexto }), true);
  assert.equal(marcoPuedeNavegar({ url: `https://${DOMINIO}/`, contexto }), true);
  assert.equal(marcoPuedeNavegar({ url: 'https://example.com/', contexto }), false);
  assert.equal(marcoPuedeNavegar({ url: undefined, contexto }), false);
});
