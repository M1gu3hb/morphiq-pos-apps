/* Lo que comparten las pantallas de la app: la marca del cliente y dos ayudantes. */
(function () {
  'use strict';
  var marca = window.MARCA || { nombre: 'POS', colores: {}, firma: '', version: '' };
  var raiz = document.documentElement;
  if (marca.colores.fondo) raiz.style.setProperty('--fondo', marca.colores.fondo);
  if (marca.colores.texto) raiz.style.setProperty('--texto', marca.colores.texto);
  if (marca.colores.acento) raiz.style.setProperty('--acento', marca.colores.acento);

  document.querySelectorAll('[data-marca]').forEach(function (nodo) {
    var valor = marca[nodo.getAttribute('data-marca')];
    if (typeof valor === 'string') nodo.textContent = valor;
  });
  document.title = document.title.replace('{nombre}', marca.nombre);

  /** Crea un nodo con texto (nunca HTML: lo que llega del aparato no se interpreta). */
  window.nodo = function (etiqueta, texto, clase) {
    var n = document.createElement(etiqueta);
    if (texto !== undefined && texto !== null) n.textContent = String(texto);
    if (clase) n.className = clase;
    return n;
  };

  /** El puente, o `null` si esta pantalla se abrió fuera de la app. */
  window.puente = function () {
    return window.MorphiqApp || null;
  };
})();
