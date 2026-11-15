/* «Acerca de»: la versión, buscar actualización y volver. */
(function () {
  'use strict';
  var app = window.puente();
  var estado = document.getElementById('estado');
  if (!app) return;

  document.getElementById('abrir-pos').addEventListener('click', function () {
    app.abrirPos();
  });
  document.getElementById('diagnostico').addEventListener('click', function () {
    app.abrirDiagnostico();
  });
  document.getElementById('actualizar').addEventListener('click', function () {
    estado.textContent = 'Buscando actualización…';
    app.buscarActualizacion().then(function (a) {
      if (a.estado === 'al-dia') estado.textContent = 'Ya tienes la última versión.';
      else if (a.estado === 'error') estado.textContent = a.mensaje || 'No se pudo buscar la actualización.';
      else estado.textContent = 'Hay una versión nueva: ' + (a.versionNueva || '') + '.';
    });
  });
})();
