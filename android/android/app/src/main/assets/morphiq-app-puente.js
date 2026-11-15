/*
 * window.MorphiqApp · contrato v1 (puente/contrato.d.ts) para Android.
 *
 * La app lo inyecta al inicio del documento, sólo en los orígenes permitidos. Aquí no hay lógica:
 * cada método llama al plugin nativo `MorphiqApp` (Capacitor) y desenvuelve lo que devuelve.
 * El plugin vuelve a revisar el origen en CADA llamada y rechaza con el código `ORIGEN`.
 *
 * Capacitor se resuelve AL LLAMAR, no al cargar: este guion corre antes que el de Capacitor.
 */
(function () {
  'use strict';
  if (window.MorphiqApp) return;

  var PLUGIN = 'MorphiqApp';

  function falla(codigo, mensaje) {
    var error = new Error(mensaje);
    error.codigo = codigo;
    error.code = codigo;
    return error;
  }

  /** Los errores del plugin llegan como `{ message, code }`: se vuelven `Error` con `.codigo`. */
  function traducir(error) {
    var mensaje = error && error.message ? error.message : 'La app no pudo hacerlo.';
    return falla(error && error.code ? error.code : 'DESCONOCIDO', mensaje);
  }

  function llamar(metodo, datos) {
    var capacitor = window.Capacitor;
    if (!capacitor || typeof capacitor.nativePromise !== 'function') {
      return Promise.reject(falla('ORIGEN', 'La app no está disponible en esta página.'));
    }
    return capacitor.nativePromise(PLUGIN, metodo, datos || {}).then(null, function (error) {
      throw traducir(error);
    });
  }

  function campo(nombre) {
    return function (respuesta) {
      return respuesta[nombre];
    };
  }

  function nada() {
    return undefined;
  }

  function escuchar(evento, alLlegar) {
    if (typeof alLlegar !== 'function') throw new TypeError('escuchar necesita una función');
    var capacitor = window.Capacitor;
    if (!capacitor || typeof capacitor.addListener !== 'function') {
      throw falla('ORIGEN', 'La app no está disponible en esta página.');
    }
    var suscripcion = capacitor.addListener(PLUGIN, evento, function (datos) {
      alLlegar(datos);
    });
    return function () {
      suscripcion.remove();
    };
  }

  var puente = {
    contrato: 1,

    version: function () { return llamar('version').then(campo('valor')); },
    plataforma: function () { return llamar('plataforma').then(campo('valor')); },
    diagnostico: function () { return llamar('diagnostico'); },

    impresoras: function () { return llamar('impresoras').then(campo('impresoras')); },
    conexiones: function () { return llamar('conexiones').then(campo('conexiones')); },
    pedirPermiso: function (destino) { return llamar('pedirPermiso', { destino: destino }); },

    ajustes: function () { return llamar('ajustes'); },
    guardarAjustes: function (parche) { return llamar('guardarAjustes', parche || {}); },

    imprimir: function (trabajo) { return llamar('imprimir', trabajo); },
    abrirCajon: function (opciones) { return llamar('abrirCajon', opciones || {}); },
    paginaDePrueba: function (opciones) { return llamar('paginaDePrueba', opciones || {}); },
    estado: function (opciones) { return llamar('estado', opciones || {}); },
    reimprimirUltimo: function () { return llamar('reimprimirUltimo'); },
    ultimoTicket: function () {
      return llamar('ultimoTicket').then(function (respuesta) {
        return respuesta.ticket || null;
      });
    },

    buscarActualizacion: function () { return llamar('buscarActualizacion'); },
    instalarActualizacion: function () { return llamar('instalarActualizacion'); },

    modoLigero: function () { return llamar('modoLigero'); },

    abrirPos: function () { return llamar('abrirPos').then(nada); },
    abrirDiagnostico: function () { return llamar('abrirDiagnostico').then(nada); },

    escuchar: escuchar,
  };

  Object.defineProperty(window, 'MorphiqApp', {
    value: Object.freeze(puente),
    writable: false,
    configurable: false,
    enumerable: true,
  });
})();
