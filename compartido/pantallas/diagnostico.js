/* La pantalla de Diagnóstico: lo que hay en este aparato, para decidir cómo imprimir en él. */
(function () {
  'use strict';
  var app = window.puente();
  var contenido = document.getElementById('contenido');
  var cargando = document.getElementById('cargando');
  var estado = document.getElementById('estado');
  var aviso = document.getElementById('aviso-motor');
  var compat = document.getElementById('compat');
  var Compat = window.Compatibilidad || null;
  var ultimo = null;
  var ultimaCompat = null;

  function decir(texto, clase) {
    estado.textContent = texto;
    estado.className = 'estado' + (clase ? ' ' + clase : '');
  }

  function tarjeta(titulo, ancha, destino) {
    var caja = window.nodo('section', null, 'tarjeta' + (ancha ? ' ancha' : ''));
    caja.appendChild(window.nodo('h2', titulo));
    (destino || contenido).appendChild(caja);
    return caja;
  }

  /** El motor: user agent completo, el `Chrome/N` que dice, y lo que el puente sepa del WebView (en Electron no hay paquete ni puente). */
  function tarjetaDelMotor(d) {
    var motor = tarjeta('Motor de pantalla', true);
    var ua = window.navigator.userAgent;
    var version = Compat ? Compat.motorDelUserAgent(ua) : null;
    dato(motor, 'Versión del motor', version ? version.completa : 'no se pudo leer');
    if (d.navegador) {
      dato(motor, d.navegador.nombre, d.navegador.version);
      if (d.navegador.paquete) dato(motor, 'Paquete del WebView', d.navegador.paquete);
    }
    if (d.puente) {
      dato(motor, 'Puente con la app', d.puente.inyeccion === 'inicio-del-documento' ? 'Normal' : 'Modo compatible');
      dato(motor, 'Llamadas por marco', d.puente.marcoPrincipalVerificado ? 'Sólo la página principal' : 'Sólo se revisa la página principal');
    }
    motor.appendChild(window.nodo('p', 'User agent', 'vacio'));
    motor.appendChild(window.nodo('p', ua, 'agente'));
  }

  /** El aviso del nivel del motor: se ve sin tocar nada. */
  function avisarDelMotor(resultado) {
    var texto = Compat ? Compat.avisoDeNivel(resultado.nivel) : null;
    aviso.hidden = !texto;
    aviso.textContent = texto || '';
    aviso.className = resultado.nivel === 'demasiado-viejo' ? 'aviso mal' : 'aviso';
  }

  /** La lista de sondas: cada una «pasa» o «falla». */
  function pintarCompatibilidad(resultado) {
    compat.textContent = '';
    var caja = tarjeta('Compatibilidad del motor', true, compat);
    caja.appendChild(window.nodo('p', resultado.aprobadas + ' de ' + resultado.total + ' pasan · nivel: ' + resultado.nivel, 'grande'));
    resultado.sondas.forEach(function (sonda) {
      var renglon = window.nodo('div', null, 'dato');
      renglon.appendChild(window.nodo('span', sonda.grupo + ' · ' + sonda.id));
      renglon.appendChild(window.nodo('span', sonda.ok ? 'pasa' : 'falla', sonda.ok ? 'bien' : 'mal'));
      caja.appendChild(renglon);
    });
    compat.hidden = false;
  }

  function probarCompatibilidad() {
    if (!Compat) {
      decir('Esta pantalla no trae las pruebas de compatibilidad.', 'mal');
      return;
    }
    ultimaCompat = Compat.probar();
    avisarDelMotor(ultimaCompat);
    pintarCompatibilidad(ultimaCompat);
    decir('Compatibilidad probada ✓', 'bien');
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
    dato(pantalla, 'Modo ligero', (d.modoLigero.activo ? 'Encendido' : 'Apagado') + ' · ' + d.modoLigero.motivo);

    tarjetaDelMotor(d);

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

  if (Compat) avisarDelMotor(Compat.probar());

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
  document.getElementById('compatibilidad').addEventListener('click', probarCompatibilidad);

  // «Pantalla de inicio» (sólo Android): el personal no puede salirse del POS con el botón de inicio.
  // Se guarda como ajuste del aparato (`pantallaDeInicio`) y la app lo aplica al momento.
  var botonDeInicio = document.getElementById('inicio');
  var enInicio = false;
  function pintarInicio() {
    botonDeInicio.textContent = enInicio ? 'Dejar de usar como pantalla de inicio' : 'Usar como pantalla de inicio';
  }
  if (botonDeInicio) {
    app.diagnostico().then(function (d) {
      if (d.plataforma !== 'android') return null;
      return app.ajustes().then(function (ajustes) {
        enInicio = !!ajustes && ajustes.pantallaDeInicio === true;
        pintarInicio();
        botonDeInicio.hidden = false;
      });
    }).catch(function () {
      // Sin diagnóstico o sin ajustes no se ofrece el botón: el resto de la pantalla ya dice qué falló.
      botonDeInicio.hidden = true;
    });
    botonDeInicio.addEventListener('click', function () {
      app.guardarAjustes({ pantallaDeInicio: !enInicio }).then(function (ajustes) {
        enInicio = !!ajustes && ajustes.pantallaDeInicio === true;
        pintarInicio();
        decir(enInicio
          ? 'Listo. Toca el botón de inicio del aparato: Android pregunta qué usar; elige esta app y «Siempre».'
          : 'Listo. El aparato vuelve a su pantalla de inicio de siempre.', 'bien');
      }, function (error) {
        decir('No se pudo cambiar: ' + (error && error.message ? error.message : 'error desconocido'), 'mal');
      });
    });
  }
  document.getElementById('copiar').addEventListener('click', function () {
    if (!ultimo) return;
    var motor = { userAgent: window.navigator.userAgent, version: Compat ? Compat.motorDelUserAgent(window.navigator.userAgent) : null };
    var texto = JSON.stringify(Object.assign({}, ultimo, { motorWeb: motor, compatibilidad: ultimaCompat || (Compat ? Compat.probar() : null) }), null, 2);
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
