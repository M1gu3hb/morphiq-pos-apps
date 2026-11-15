/* La pantalla de Diagnóstico: lo que hay en este aparato, para decidir cómo imprimir en él. */
(function () {
  'use strict';
  var app = window.puente();
  var contenido = document.getElementById('contenido');
  var cargando = document.getElementById('cargando');
  var estado = document.getElementById('estado');
  var ultimo = null;

  function decir(texto, clase) {
    estado.textContent = texto;
    estado.className = 'estado' + (clase ? ' ' + clase : '');
  }

  function tarjeta(titulo, ancha) {
    var caja = window.nodo('section', null, 'tarjeta' + (ancha ? ' ancha' : ''));
    caja.appendChild(window.nodo('h2', titulo));
    contenido.appendChild(caja);
    return caja;
  }

  function dato(caja, nombre, valor) {
    var renglon = window.nodo('div', null, 'dato');
    renglon.appendChild(window.nodo('span', nombre));
    renglon.appendChild(window.nodo('span', valor === undefined || valor === '' ? '—' : valor));
    caja.appendChild(renglon);
  }

  function gb(mb) {
    return (mb / 1024).toFixed(1) + ' GB';
  }

  function boton(texto, alTocar) {
    var b = window.nodo('button', texto);
    b.type = 'button';
    b.addEventListener('click', function () {
      b.disabled = true;
      Promise.resolve()
        .then(alTocar)
        .catch(function (error) {
          decir(error && error.message ? error.message : 'No se pudo.', 'mal');
        })
        .then(function () {
          b.disabled = false;
        });
    });
    return b;
  }

  function resultado(prefijo, r) {
    if (r.ok) decir(prefijo + (r.estado === 'impreso' ? ': impreso ✓' : ': enviado ✓'), 'bien');
    else decir(prefijo + ': ' + (r.mensaje || 'no se pudo') + ' (' + (r.codigo || 'DESCONOCIDO') + ')', 'mal');
  }

  function filaDeImpresora(caja, impresora) {
    var fila = window.nodo('div', null, 'fila');
    var texto = window.nodo('div');
    texto.appendChild(window.nodo('strong', impresora.nombre + (impresora.predeterminada ? ' · predeterminada' : '')));
    texto.appendChild(window.nodo('small', impresora.id + (impresora.detalle ? ' · ' + impresora.detalle : '')));
    fila.appendChild(texto);

    var acciones = window.nodo('div', null, 'acciones');
    if (impresora.conPermiso === false) {
      acciones.appendChild(
        boton('Dar permiso', function () {
          return app.pedirPermiso(impresora.destino).then(function (r) {
            decir(r.concedido ? 'Permiso concedido ✓' : r.mensaje || 'No se dio el permiso.', r.concedido ? 'bien' : 'mal');
            return leer();
          });
        }),
      );
    }
    if (impresora.destino.conexion !== 'driver') {
      acciones.appendChild(
        boton('Página de prueba', function () {
          decir('Enviando la página de prueba…');
          return app.paginaDePrueba({ destino: impresora.destino }).then(function (r) {
            resultado('Página de prueba', r);
          });
        }),
      );
      acciones.appendChild(
        boton('Abrir cajón', function () {
          return app.abrirCajon({ destino: impresora.destino }).then(function (r) {
            resultado('Cajón', r);
          });
        }),
      );
    }
    fila.appendChild(acciones);
    caja.appendChild(fila);
  }

  function pintar(d) {
    ultimo = d;
    contenido.textContent = '';
    document.getElementById('version').textContent = d.app.version;

    var sistema = tarjeta('Sistema');
    sistema.appendChild(window.nodo('p', d.sistema.nombre, 'grande'));
    dato(sistema, 'Versión', d.sistema.version);
    dato(sistema, 'Bits', String(d.sistema.bits));
    if (d.sistema.marca) dato(sistema, 'Marca', d.sistema.marca);
    if (d.sistema.modelo) dato(sistema, 'Modelo', d.sistema.modelo);

    var fuerza = tarjeta('Memoria y procesador');
    fuerza.appendChild(window.nodo('p', gb(d.memoria.totalMb) + ' de RAM', 'grande'));
    dato(fuerza, 'RAM libre', gb(d.memoria.libreMb));
    dato(fuerza, 'Procesador', d.procesador.nombre);
    dato(fuerza, 'Núcleos', String(d.procesador.nucleos));
    dato(fuerza, 'Arquitectura', d.procesador.arquitectura);

    var pantalla = tarjeta('Pantalla');
    pantalla.appendChild(window.nodo('p', d.pantalla.anchoPx + ' × ' + d.pantalla.altoPx, 'grande'));
    dato(pantalla, 'Escala', String(d.pantalla.escala));
    dato(pantalla, 'Táctil', d.pantalla.tactil ? 'Sí' : 'No');
    dato(pantalla, d.navegador.nombre, d.navegador.version);
    dato(pantalla, 'Modo ligero', (d.modoLigero.activo ? 'Encendido' : 'Apagado') + ' · ' + d.modoLigero.motivo);

    var impresoras = tarjeta('Impresoras', true);
    if (d.impresoras.length === 0) {
      impresoras.appendChild(window.nodo('p', 'No se encontró ninguna impresora en este aparato.', 'vacio'));
    }
    d.impresoras.forEach(function (i) {
      filaDeImpresora(impresoras, i);
    });

    if (d.bluetooth) {
      var bt = tarjeta('Bluetooth emparejados');
      if (d.bluetooth.length === 0) bt.appendChild(window.nodo('p', 'Ninguno.', 'vacio'));
      d.bluetooth.forEach(function (b) {
        dato(bt, b.nombre + (b.esInnerPrinter ? ' · impresora integrada' : ''), b.direccion);
      });
    }
    if (d.usb) {
      var usb = tarjeta('USB conectados');
      if (d.usb.length === 0) usb.appendChild(window.nodo('p', 'Ninguno.', 'vacio'));
      d.usb.forEach(function (u) {
        dato(usb, u.nombre + (u.esImpresora ? ' · impresora' : ''), 'vendor ' + u.vendorId + ' · product ' + u.productId);
      });
    }
    if (d.serviciosDeMarca && d.serviciosDeMarca.length > 0) {
      var marca = tarjeta('Servicios de la marca');
      d.serviciosDeMarca.forEach(function (s) {
        dato(marca, s, 'instalado');
      });
    }
    if (d.avisos.length > 0) {
      var avisos = tarjeta('Lo que no se pudo leer', true);
      d.avisos.forEach(function (a) {
        avisos.appendChild(window.nodo('p', a, 'aviso'));
      });
    }

    cargando.hidden = true;
    contenido.hidden = false;
  }

  function leer() {
    return app.diagnostico().then(pintar);
  }

  if (!app) {
    cargando.textContent = 'Esta pantalla sólo funciona dentro de la app.';
    return;
  }

  leer().catch(function (error) {
    cargando.textContent = 'No se pudo leer el aparato: ' + (error && error.message ? error.message : 'error desconocido');
    cargando.className = 'aviso';
  });

  document.getElementById('abrir-pos').addEventListener('click', function () {
    app.abrirPos();
  });
  document.getElementById('releer').addEventListener('click', function () {
    decir('Leyendo…');
    leer().then(function () {
      decir('Leído ✓', 'bien');
    });
  });
  document.getElementById('actualizar').addEventListener('click', function () {
    decir('Buscando actualización…');
    app.buscarActualizacion().then(function (a) {
      if (a.estado === 'al-dia') decir('Ya tienes la última versión (' + a.versionActual + ').', 'bien');
      else if (a.estado === 'error') decir(a.mensaje || 'No se pudo buscar la actualización.', 'mal');
      else decir('Hay una versión nueva: ' + (a.versionNueva || '') + '.', 'bien');
    });
  });
  document.getElementById('copiar').addEventListener('click', function () {
    if (!ultimo) return;
    var texto = JSON.stringify(ultimo, null, 2);
    var area = document.createElement('textarea');
    area.value = texto;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    var copiado = false;
    try {
      copiado = document.execCommand('copy');
    } catch (error) {
      copiado = false;
    }
    area.remove();
    decir(copiado ? 'Diagnóstico copiado ✓' : 'No se pudo copiar: toma una captura de la pantalla.', copiado ? 'bien' : 'mal');
  });
})();
