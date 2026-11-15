/*
 * Sondas de compatibilidad del motor web (WebView / Chromium) de este aparato.
 *
 * JS plano y sin dependencias, escrito para correr hasta en un Chromium 80: nada de `?.`, `??`,
 * `at()`, clases ni módulos. Los `id` de las sondas son los mismos que usa la web del POS.
 *
 * Se usa así: `Compatibilidad.probar()` mira el `window` real y devuelve
 * `{ nivel, sondas: [{ id, grupo, ok, detalle }], aprobadas, total }`. Para probarlo sin navegador
 * se le pasa un `window` de mentiras: `Compatibilidad.probar(ventanaFalsa)`.
 *
 * Una sonda que lanza una excepción es una sonda que FALLA (con el motivo en `detalle`).
 */
(function (raiz, fabrica) {
  'use strict';
  var api = fabrica();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (raiz) raiz.Compatibilidad = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var AVISO_COMPATIBLE = 'Este aparato usa un motor antiguo: el POS trabaja en modo compatible';
  var AVISO_VIEJO = 'Este aparato es demasiado viejo para el POS. Pide ayuda a tu proveedor';

  /** Las cinco que separan un motor «moderno» de uno que sólo es «compatible». */
  var DE_MODERNO = ['color-mix', 'translate', 'has', 'dvh', 'container'];

  function css(w, propiedad, valor) {
    return w.CSS.supports(propiedad, valor);
  }

  function selector(w, texto) {
    return w.CSS.supports('selector(' + texto + ')');
  }

  function esFuncion(valor) {
    return typeof valor === 'function';
  }

  /** `gap` en flex, MEDIDO: dos hijos de 10 px con `gap: 10px`; el segundo debe quedar a 20 px. */
  function gapEnFlex(w) {
    var d = w.document;
    var contenedor = d.createElement('div');
    contenedor.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;display:flex;gap:10px';
    var primero = d.createElement('div');
    var segundo = d.createElement('div');
    primero.style.cssText = 'width:10px;height:10px;flex:none';
    segundo.style.cssText = 'width:10px;height:10px;flex:none';
    contenedor.appendChild(primero);
    contenedor.appendChild(segundo);
    d.body.appendChild(contenedor);
    try {
      return segundo.offsetLeft === 20;
    } finally {
      d.body.removeChild(contenedor);
    }
  }

  /** [id, grupo, función(window) → verdadero si pasa] */
  var SONDAS = [
    // ---- CSS ----
    ['color-mix', 'css', function (w) { return css(w, 'color', 'color-mix(in lab, red, red)'); }],
    ['translate', 'css', function (w) { return css(w, 'translate', '0'); }],
    ['has', 'css', function (w) { return selector(w, ':has(a)'); }],
    ['dvh', 'css', function (w) { return css(w, 'height', '1dvh'); }],
    ['container', 'css', function (w) { return css(w, 'container-type', 'inline-size'); }],
    ['layer', 'css', function (w) { return typeof w.CSSLayerBlockRule !== 'undefined'; }],
    ['property', 'css', function (w) { return typeof w.CSSPropertyRule !== 'undefined'; }],
    ['gap-flex', 'css', gapEnFlex],
    ['aspect-ratio', 'css', function (w) { return css(w, 'aspect-ratio', '1 / 1'); }],
    ['inset', 'css', function (w) { return css(w, 'inset', '0'); }],
    ['backdrop-filter', 'css', function (w) { return css(w, 'backdrop-filter', 'blur(1px)') || css(w, '-webkit-backdrop-filter', 'blur(1px)'); }],
    ['focus-visible', 'css', function (w) { return selector(w, ':focus-visible'); }],
    ['nesting', 'css', function (w) { return selector(w, '&'); }],
    ['text-wrap', 'css', function (w) { return css(w, 'text-wrap', 'balance'); }],
    ['field-sizing', 'css', function (w) { return css(w, 'field-sizing', 'content'); }],

    // ---- JS / DOM ----
    ['inert', 'js', function (w) { return 'inert' in w.HTMLElement.prototype; }],
    ['dialog', 'js', function (w) { return esFuncion(w.HTMLDialogElement) && esFuncion(w.HTMLDialogElement.prototype.showModal); }],
    ['popover', 'js', function (w) { return 'popover' in w.HTMLElement.prototype; }],
    ['view-transitions', 'js', function (w) { return esFuncion(w.document.startViewTransition); }],
    ['structured-clone', 'js', function (w) { return esFuncion(w.structuredClone); }],
    ['array-at', 'js', function (w) { return esFuncion(w.Array.prototype.at); }],
    ['find-last', 'js', function (w) { return esFuncion(w.Array.prototype.findLast); }],
    ['to-sorted', 'js', function (w) { return esFuncion(w.Array.prototype.toSorted); }],
    ['object-has-own', 'js', function (w) { return esFuncion(w.Object.hasOwn); }],
    ['object-group-by', 'js', function (w) { return esFuncion(w.Object.groupBy); }],
    ['promise-with-resolvers', 'js', function (w) { return esFuncion(w.Promise.withResolvers); }],
    ['abort-timeout', 'js', function (w) { return esFuncion(w.AbortSignal.timeout); }],
    ['intl-segmenter', 'js', function (w) { return typeof w.Intl !== 'undefined' && esFuncion(w.Intl.Segmenter); }],
    ['resize-observer', 'js', function (w) { return esFuncion(w.ResizeObserver); }],
    ['intersection-observer', 'js', function (w) { return esFuncion(w.IntersectionObserver); }],
    ['offscreen-canvas', 'js', function (w) { return esFuncion(w.OffscreenCanvas); }],
    ['create-image-bitmap', 'js', function (w) { return esFuncion(w.createImageBitmap); }],
    ['crypto-uuid', 'js', function (w) { return !!w.crypto && esFuncion(w.crypto.randomUUID); }],
    ['wake-lock', 'js', function (w) { return !!w.navigator && !!w.navigator.wakeLock && esFuncion(w.navigator.wakeLock.request); }],
    ['broadcast-channel', 'js', function (w) { return esFuncion(w.BroadcastChannel); }],
  ];

  function correr(sonda, ventana) {
    var resultado = { id: sonda[0], grupo: sonda[1], ok: false };
    try {
      resultado.ok = sonda[2](ventana) === true;
    } catch (error) {
      resultado.ok = false;
      resultado.detalle = error && error.message ? String(error.message) : 'lanzó una excepción';
    }
    return resultado;
  }

  /** `'moderno'`, `'compatible'` o `'demasiado-viejo'` según qué sondas pasaron (ver el encabezado del POS). */
  function nivelDe(sondas) {
    var paso = {};
    for (var i = 0; i < sondas.length; i++) paso[sondas[i].id] = sondas[i].ok;
    if (!paso.layer) return 'demasiado-viejo';
    for (var j = 0; j < DE_MODERNO.length; j++) {
      if (!paso[DE_MODERNO[j]]) return 'compatible';
    }
    return 'moderno';
  }

  /** Corre todas las sondas contra [ventana] (por omisión, el `window` real). */
  function probar(ventana) {
    var w = ventana || (typeof window !== 'undefined' ? window : {});
    var sondas = [];
    var aprobadas = 0;
    for (var i = 0; i < SONDAS.length; i++) {
      var r = correr(SONDAS[i], w);
      if (r.ok) aprobadas++;
      sondas.push(r);
    }
    return { nivel: nivelDe(sondas), sondas: sondas, aprobadas: aprobadas, total: sondas.length };
  }

  /** El aviso para quien atiende el aparato, o `null` si no hace falta (motor moderno). */
  function avisoDeNivel(nivel) {
    if (nivel === 'compatible') return AVISO_COMPATIBLE;
    if (nivel === 'demasiado-viejo') return AVISO_VIEJO;
    return null;
  }

  /** La versión del motor que dice el user agent (`Chrome/99.0.4844.88` → `{ completa, mayor }`), o `null`. */
  function motorDelUserAgent(userAgent) {
    var texto = typeof userAgent === 'string' ? userAgent : '';
    var coincide = /(?:Chrome|Chromium)\/(\d+(?:\.\d+){0,3})/.exec(texto);
    if (!coincide) return null;
    return { completa: coincide[1], mayor: parseInt(coincide[1], 10) };
  }

  return {
    probar: probar,
    avisoDeNivel: avisoDeNivel,
    motorDelUserAgent: motorDelUserAgent,
    ids: function () {
      var lista = [];
      for (var i = 0; i < SONDAS.length; i++) lista.push(SONDAS[i][0]);
      return lista;
    },
  };
});
