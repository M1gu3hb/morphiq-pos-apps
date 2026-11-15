/* «Sin internet, reintentando…»: prueba cada 5 s y, en cuanto hay red, vuelve al POS sola. */
(function () {
  'use strict';
  var app = window.puente();
  var estado = document.getElementById('estado');
  var reimprimir = document.getElementById('reimprimir');
  var CADA_MS = 5000;
  var intentos = 0;
  var probando = false;

  function hayRed() {
    var destino = window.MARCA && window.MARCA.sonda;
    if (!destino || typeof fetch !== 'function') return Promise.resolve(navigator.onLine !== false);
    return fetch(destino, { method: 'HEAD', mode: 'no-cors', cache: 'no-store' }).then(
      function () {
        return true;
      },
      function () {
        return false;
      },
    );
  }

  function probar() {
    if (probando) return;
    probando = true;
    intentos += 1;
    estado.textContent = 'Intento ' + intentos + '…';
    hayRed().then(function (hay) {
      probando = false;
      if (hay && app) {
        estado.textContent = 'Volvió el internet. Abriendo…';
        app.abrirPos();
      } else {
        estado.textContent = 'Sigue sin internet. Se vuelve a intentar en 5 segundos.';
      }
    });
  }

  document.getElementById('reintentar').addEventListener('click', probar);
  window.addEventListener('online', probar);
  setInterval(probar, CADA_MS);
  setTimeout(probar, 1500);

  if (!app) return;

  document.getElementById('diagnostico').addEventListener('click', function () {
    app.abrirDiagnostico();
  });

  app.ultimoTicket().then(function (ticket) {
    if (!ticket) return;
    reimprimir.hidden = false;
    reimprimir.textContent = 'Reimprimir el último ticket (' + ticket.titulo + ')';
  });
  reimprimir.addEventListener('click', function () {
    reimprimir.disabled = true;
    estado.textContent = 'Enviando a la impresora…';
    app
      .reimprimirUltimo()
      .then(function (r) {
        estado.textContent = r.ok
          ? r.estado === 'impreso'
            ? 'Impreso ✓'
            : 'Enviado ✓'
          : (r.mensaje || 'No se pudo imprimir') + '.';
      })
      .then(function () {
        reimprimir.disabled = false;
      });
  });
})();
