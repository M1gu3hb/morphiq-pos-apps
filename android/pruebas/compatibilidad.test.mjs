/**
 * Prueba `compartido/pantallas/compatibilidad.js` (las sondas del motor web) con un `window` de
 * mentiras: un motor «moderno», uno «compatible» (como el WebView 99-103 del iMin) y uno viejo.
 * Corre con `npm run probar:puente`.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RUTA = join(AQUI, '..', '..', 'compartido', 'pantallas', 'compatibilidad.js');
const Compatibilidad = createRequire(import.meta.url)(RUTA);

/** Lo que dice cada sonda de CSS en un motor: `supports(propiedad, valor)` o `supports('selector(...)')`. */
function css(soportado) {
  return {
    supports(propiedad, valor) {
      const clave = valor === undefined ? propiedad : `${propiedad}: ${valor}`;
      if (soportado.lanza) throw new Error('CSS.supports no está disponible');
      return soportado.reglas.some((regla) => clave.includes(regla));
    },
  };
}

function documento({ gap }) {
  return {
    body: { appendChild() {}, removeChild() {} },
    createElement() {
      const hijos = [];
      const nodo = {
        style: {},
        hijos,
        appendChild(hijo) {
          hijos.push(hijo);
        },
      };
      // El segundo hijo del contenedor queda a 20 px si el motor entiende `gap` en flex; si no, a 10 px.
      Object.defineProperty(nodo, 'offsetLeft', { get: () => (nodo.esSegundo ? (gap ? 20 : 10) : 0) });
      return nodo;
    },
    startViewTransition: undefined,
  };
}

/** Un `window` que sólo trae las funciones de la lista [JS] y los CSS de [reglas]. */
function ventana({ reglas, js = [], gap = false, layer = true, lanza = false }) {
  const w = {
    CSS: css({ reglas, lanza }),
    document: documento({ gap }),
    HTMLElement: { prototype: {} },
    Array: { prototype: {} },
    Object: {},
    Promise: {},
    AbortSignal: {},
    Intl: {},
    crypto: {},
    navigator: {},
  };
  // El segundo `createElement` de la sonda de gap es el segundo hijo: se marca al crearlo.
  let creados = 0;
  const original = w.document.createElement;
  w.document.createElement = () => {
    const nodo = original();
    creados += 1;
    if (creados % 3 === 0) nodo.esSegundo = true;
    return nodo;
  };
  if (layer) w.CSSLayerBlockRule = function CSSLayerBlockRule() {};
  const funcion = () => {};
  for (const clave of js) {
    if (clave === 'inert') w.HTMLElement.prototype.inert = true;
    if (clave === 'popover') w.HTMLElement.prototype.popover = null;
    if (clave === 'array-at') w.Array.prototype.at = funcion;
    if (clave === 'object-has-own') w.Object.hasOwn = funcion;
    if (clave === 'abort-timeout') w.AbortSignal.timeout = funcion;
    if (clave === 'crypto-uuid') w.crypto.randomUUID = funcion;
    if (clave === 'resize-observer') w.ResizeObserver = funcion;
    if (clave === 'structured-clone') w.structuredClone = funcion;
    if (clave === 'broadcast-channel') w.BroadcastChannel = funcion;
    if (clave === 'view-transitions') w.document.startViewTransition = funcion;
    if (clave === 'intl-segmenter') w.Intl.Segmenter = funcion;
    if (clave === 'wake-lock') w.navigator.wakeLock = { request: funcion };
  }
  return w;
}

const TODO_EL_CSS = ['color-mix', 'translate', ':has(a)', 'dvh', 'container-type', 'aspect-ratio', 'inset', 'backdrop-filter', ':focus-visible', 'selector(&)', 'text-wrap', 'field-sizing'];
const CSS_DE_CHROMIUM_99 = ['aspect-ratio', 'inset', 'backdrop-filter', ':focus-visible'];

const porId = (resultado) => Object.fromEntries(resultado.sondas.map((s) => [s.id, s.ok]));

test('trae las 35 sondas con los id exactos acordados con la web', () => {
  assert.deepEqual(Compatibilidad.ids(), [
    'color-mix', 'translate', 'has', 'dvh', 'container', 'layer', 'property', 'gap-flex', 'aspect-ratio', 'inset',
    'backdrop-filter', 'focus-visible', 'nesting', 'text-wrap', 'field-sizing',
    'inert', 'dialog', 'popover', 'view-transitions', 'structured-clone', 'array-at', 'find-last', 'to-sorted',
    'object-has-own', 'object-group-by', 'promise-with-resolvers', 'abort-timeout', 'intl-segmenter',
    'resize-observer', 'intersection-observer', 'offscreen-canvas', 'create-image-bitmap', 'crypto-uuid',
    'wake-lock', 'broadcast-channel',
  ]);
});

test('un motor moderno pasa lo que tiene y el nivel es «moderno»', () => {
  const w = ventana({ reglas: TODO_EL_CSS, gap: true, js: ['inert', 'popover', 'array-at', 'crypto-uuid'] });
  const r = Compatibilidad.probar(w);
  const paso = porId(r);
  assert.equal(r.nivel, 'moderno');
  for (const id of ['color-mix', 'translate', 'has', 'dvh', 'container', 'layer', 'gap-flex', 'nesting', 'inert', 'popover', 'array-at', 'crypto-uuid']) {
    assert.equal(paso[id], true, id);
  }
  assert.equal(paso['object-group-by'], false);
  assert.equal(r.total, 35);
  assert.equal(r.aprobadas, r.sondas.filter((s) => s.ok).length);
});

test('un Chromium 99-103 (como el WebView del iMin) es «compatible»: tiene layer pero no color-mix ni :has', () => {
  const w = ventana({ reglas: CSS_DE_CHROMIUM_99, gap: true, js: ['array-at', 'object-has-own', 'structured-clone', 'resize-observer', 'broadcast-channel'] });
  const r = Compatibilidad.probar(w);
  const paso = porId(r);
  assert.equal(r.nivel, 'compatible');
  assert.equal(paso.layer, true);
  assert.equal(paso['color-mix'], false);
  assert.equal(paso.has, false);
  assert.equal(paso.dvh, false);
  assert.equal(Compatibilidad.avisoDeNivel(r.nivel), 'Este aparato usa un motor antiguo: el POS trabaja en modo compatible');
});

test('basta con que falle UNA de las cinco modernas para ser «compatible»', () => {
  for (const faltante of ['color-mix', 'translate', ':has(a)', 'dvh', 'container-type']) {
    const reglas = TODO_EL_CSS.filter((regla) => regla !== faltante);
    assert.equal(Compatibilidad.probar(ventana({ reglas, gap: true })).nivel, 'compatible', `sin ${faltante}`);
  }
});

test('sin @layer el motor es «demasiado-viejo» aunque lo demás pase', () => {
  const r = Compatibilidad.probar(ventana({ reglas: TODO_EL_CSS, gap: true, layer: false }));
  assert.equal(r.nivel, 'demasiado-viejo');
  assert.equal(Compatibilidad.avisoDeNivel(r.nivel), 'Este aparato es demasiado viejo para el POS. Pide ayuda a tu proveedor');
});

test('el motor moderno no lleva aviso', () => {
  assert.equal(Compatibilidad.avisoDeNivel('moderno'), null);
});

test('gap en flex se MIDE: el segundo hijo a 20 px pasa, a 10 px falla', () => {
  assert.equal(porId(Compatibilidad.probar(ventana({ reglas: [], gap: true })))['gap-flex'], true);
  assert.equal(porId(Compatibilidad.probar(ventana({ reglas: [], gap: false })))['gap-flex'], false);
});

test('una sonda que lanza una excepción FALLA con su motivo, y las demás siguen', () => {
  const r = Compatibilidad.probar(ventana({ reglas: [], lanza: true, js: ['array-at'] }));
  const colorMix = r.sondas.find((s) => s.id === 'color-mix');
  assert.equal(colorMix.ok, false);
  assert.match(colorMix.detalle, /no está disponible/);
  assert.equal(porId(r)['array-at'], true);
  assert.equal(r.nivel, 'compatible');
});

test('un window casi vacío no revienta: todo falla y el nivel es «demasiado-viejo»', () => {
  const r = Compatibilidad.probar({});
  assert.equal(r.aprobadas, 0);
  assert.equal(r.nivel, 'demasiado-viejo');
  assert.equal(r.total, 35);
});

test('backdrop-filter pasa con o sin prefijo -webkit-', () => {
  const sin = ventana({ reglas: [] });
  const solo = ventana({ reglas: [] });
  solo.CSS.supports = (propiedad) => propiedad === '-webkit-backdrop-filter';
  assert.equal(porId(Compatibilidad.probar(sin))['backdrop-filter'], false);
  assert.equal(porId(Compatibilidad.probar(solo))['backdrop-filter'], true);
});

test('lee la versión del motor del user agent', () => {
  const ua = 'Mozilla/5.0 (Linux; Android 7.1.2; D4-503) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.88 Safari/537.36';
  assert.deepEqual(Compatibilidad.motorDelUserAgent(ua), { completa: '99.0.4844.88', mayor: 99 });
  assert.equal(Compatibilidad.motorDelUserAgent('algo sin motor'), null);
  assert.equal(Compatibilidad.motorDelUserAgent(undefined), null);
});

test('el módulo no usa sintaxis que un Chromium 80 no entienda', () => {
  const fuente = readFileSync(RUTA, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(fuente, /\?\.[A-Za-z_(\[]/, 'encadenamiento opcional');
  assert.doesNotMatch(fuente, /\?\?/, 'fusión de nulos');
  assert.doesNotMatch(fuente, /\.at\(/, 'Array.prototype.at()');
  assert.doesNotMatch(fuente, /=>/, 'funciones flecha');
  assert.doesNotMatch(fuente, /\b(?:let|const|class)\s/, 'let/const/class');
});
