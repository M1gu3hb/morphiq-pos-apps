'use strict';
/**
 * Prueba de humo: `npx electron . --prueba-humo`. Ventanas OCULTAS (`show: false`); no manda nada
 * a ninguna impresora (sólo nombres que no existen) ni toca los ajustes reales (otra carpeta de datos).
 * Deja capturas y JSON en `salida/` y termina con código 0 sólo si todo pasó.
 */
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { comprobarMarcos } = require('./humo-marcos');
const { comprobarElectronUpdater } = require('./humo-actualizador');

const ESPERA_DE_PINTADO_MS = 2500;
const TOPE_DE_CARGA_MS = 45_000;
const ESPERA_DE_NAVEGACION_MS = 2500;

const esperar = (ms) => new Promise((listo) => setTimeout(listo, ms));

async function esperarHasta(condicion, tope, descripcion) {
  const limite = Date.now() + tope;
  while (Date.now() < limite) {
    if (await condicion()) return;
    await esperar(100);
  }
  throw new Error(`Se acabó el tiempo esperando: ${descripcion}`);
}

function exigir(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje);
}

/**
 * La captura es EVIDENCIA, no una comprobación: con la ventana oculta y recién abierta, Chromium a
 * veces no la da («UnknownVizError»), y eso tumbaba el paso antes de mirar lo que importa (pasó
 * en la primera corrida de la app ya empaquetada). Se reintenta; si no sale, se anota y se sigue.
 */
async function capturar(web, ruta) {
  let ultimo = 'salió vacía';
  for (let intento = 1; intento <= 3; intento += 1) {
    try {
      const imagen = await web.capturePage();
      if (!imagen.isEmpty()) {
        fs.writeFileSync(ruta, imagen.toPNG());
        return;
      }
    } catch (error) {
      ultimo = error && error.message ? error.message : String(error);
    }
    await new Promise((resolver) => setTimeout(resolver, 400));
  }
  console.warn(`  (sin captura ${path.basename(ruta)}: ${ultimo})`);
}

/**
 * @param {{
 *   electron: typeof import('electron'), cliente: import('./contexto').Cliente, rutas: ReturnType<typeof import('./contexto').rutasDeLaApp>,
 *   almacen: ReturnType<typeof import('./ajustes').crearAlmacenDeAjustes>, registrar: (m: string) => void, crearAplicacion: Function,
 * }} deps
 * @returns {Promise<number>} el código de salida
 */
async function correrHumo({ electron, cliente, rutas, almacen, registrar, crearAplicacion }) {
  const { BrowserWindow } = electron;
  fs.mkdirSync(rutas.salida, { recursive: true });
  const externos = [];
  const pasos = [];
  const aplicacion = crearAplicacion({
    electron,
    cliente,
    rutas,
    almacen,
    registrar,
    opciones: { oculta: true, abrirAfuera: (url) => externos.push(url), conActualizador: false },
  });
  electron.Menu.setApplicationMenu(null);
  const { ventana } = aplicacion;
  const web = () => ventana.ventana().webContents;
  const evaluar = (codigo) => web().executeJavaScript(codigo, true);
  const salida = (nombre) => path.join(rutas.salida, nombre);

  async function paso(nombre, fn) {
    const inicio = Date.now();
    fs.appendFileSync(salida('humo-progreso.log'), `inicio ${nombre}
`);
    try {
      const detalle = await fn();
      pasos.push({ nombre, ok: true, ms: Date.now() - inicio, detalle });
      console.log(`  ok   ${nombre}`);
    } catch (error) {
      pasos.push({ nombre, ok: false, ms: Date.now() - inicio, error: error.message });
      console.error(`  FALLÓ ${nombre}: ${error.message}`);
    }
  }

  const conTope = (promesa, nombre) =>
    Promise.race([promesa, esperar(TOPE_DE_CARGA_MS).then(() => Promise.reject(new Error(`Tardó demasiado: ${nombre}`)))]);

  await paso('a) Diagnóstico carga, pinta y el puente responde', async () => {
    exigir(!aplicacion.almacen.leer().primerArranqueHecho, 'El primer arranque ya estaba marcado');
    await conTope(aplicacion.arrancar(), 'arrancar');
    exigir(web().getURL().endsWith('/diagnostico.html'), `El primer arranque debía abrir Diagnóstico y abrió ${web().getURL()}`);
    await esperarHasta(() => evaluar("document.getElementById('contenido') && !document.getElementById('contenido').hidden"), 20_000, 'que Diagnóstico pinte');
    await esperar(300);
    await capturar(web(), salida('humo-diagnostico.png'));
    const diagnostico = await evaluar('MorphiqApp.diagnostico()');
    fs.writeFileSync(salida('humo-diagnostico.json'), `${JSON.stringify(diagnostico, null, 2)}\n`);
    exigir(diagnostico.plataforma === 'windows', 'La plataforma no es windows');
    exigir(diagnostico.memoria.totalMb > 0 && diagnostico.procesador.nucleos > 0, 'Faltan RAM o núcleos');
    exigir(Array.isArray(diagnostico.impresoras), 'Las impresoras no son una lista');
    exigir(diagnostico.app.version === cliente.version, 'La versión no coincide con el cliente');
    return { impresoras: diagnostico.impresoras.length, avisos: diagnostico.avisos };
  });

  await paso('b) El POS de producción carga y trae el puente (contrato 1)', async () => {
    // El botón «Abrir el POS» de Diagnóstico llama a MorphiqApp.abrirPos() por el puente.
    await evaluar("document.getElementById('abrir-pos').click()");
    await esperarHasta(() => web().getURL().startsWith(`https://${cliente.dominio}/`) && !web().isLoading(), TOPE_DE_CARGA_MS, 'que cargue el POS');
    exigir(aplicacion.almacen.leer().primerArranqueHecho === true, 'abrirPos() no marcó el primer arranque');
    const url = web().getURL();
    exigir(new URL(url).origin === `https://${cliente.dominio}`, `Cargó otra cosa: ${url}`);
    const tipo = await evaluar('typeof window.MorphiqApp');
    exigir(tipo === 'object', `typeof MorphiqApp es «${tipo}»`);
    exigir((await evaluar('MorphiqApp.contrato')) === 1, 'MorphiqApp.contrato no es 1');
    exigir((await evaluar('MorphiqApp.version()')) === cliente.version, 'version() no coincide');
    await esperar(ESPERA_DE_PINTADO_MS);
    await capturar(web(), salida('humo-pos.png'));
    return { url };
  });

  await paso('c) Navegar a https://example.com se bloquea', async () => {
    const antes = web().getURL();
    await evaluar("location.href = 'https://example.com/'");
    await esperar(ESPERA_DE_NAVEGACION_MS);
    exigir(web().getURL() === antes, `La ventana navegó a ${web().getURL()}`);
    await evaluar("window.open('https://example.com/', '_blank')");
    await esperar(500);
    exigir(BrowserWindow.getAllWindows().length === 1, 'Se abrió una segunda ventana');
    exigir(externos.length === 0, 'En pantalla completa no debe abrirse el navegador del sistema');
    // Sin pantalla completa, un https ajeno sale al navegador del sistema (aquí sólo se anota).
    aplicacion.almacen.guardar({ pantallaCompleta: false });
    await evaluar("window.open('https://example.com/', '_blank')");
    await esperar(500);
    exigir(externos.length === 1 && externos[0] === 'https://example.com/', 'Sin pantalla completa debía salir al navegador del sistema');
    await evaluar("window.open('javascript:alert(1)', '_blank')");
    await evaluar("window.open('http://example.com/', '_blank')");
    await esperar(300);
    exigir(externos.length === 1, 'Un http o un javascript: no debe abrirse afuera');
    aplicacion.almacen.guardar({ pantallaCompleta: true });
    exigir(BrowserWindow.getAllWindows().length === 1, 'Quedó más de una ventana');
    return { externos };
  });

  await paso('c1) Un iframe no puede navegar fuera del origen permitido (sí a about:blank y srcdoc)', async () => {
    const r = await comprobarMarcos({ BrowserWindow, esperar });
    exigir(r.ajena === 'about:blank', `El iframe navegó a ${r.ajena}`);
    exigir(r.srcdoc === 'about:srcdoc' && r.enBlanco === 'about:blank', `srcdoc/blank: ${JSON.stringify(r)}`);
    return r;
  });

  await paso('c2) Sin internet: una carga fallida muestra nuestra pantalla, no la de Chromium', async () => {
    web().loadURL('https://no-existe-morphiq.invalid/').catch(() => {});
    await esperarHasta(() => web().getURL().endsWith('/sin-internet.html') && !web().isLoading(), 20_000, 'que aparezca «Sin internet»');
    exigir((await evaluar('typeof window.MorphiqApp')) === 'object', 'Sin internet no trae el puente');
    exigir((await evaluar("document.getElementById('reintentar') !== null")) === true, 'Falta el botón Reintentar');
    await esperar(500);
    await capturar(web(), salida('humo-sin-internet.png'));
  });

  await paso('c3) Sin internet también si el proceso de render muere, y abrirPos() vuelve al POS', async () => {
    await evaluar('MorphiqApp.abrirPos()');
    await esperarHasta(() => web().getURL().startsWith(`https://${cliente.dominio}/`) && !web().isLoading(), TOPE_DE_CARGA_MS, 'que vuelva el POS');
    web().forcefullyCrashRenderer();
    await esperarHasta(() => web().getURL().endsWith('/sin-internet.html') && !web().isLoading(), 20_000, 'que aparezca «Sin internet» tras el fallo');
    await evaluar('MorphiqApp.abrirPos()');
    await esperarHasta(() => web().getURL().startsWith(`https://${cliente.dominio}/`) && !web().isLoading(), TOPE_DE_CARGA_MS, 'que vuelva el POS otra vez');
  });

  await paso('d) Una página ajena no recibe el puente', async () => {
    const intrusa = new BrowserWindow({
      show: false,
      webPreferences: { preload: rutas.preload, contextIsolation: true, sandbox: true, nodeIntegration: false, partition: 'humo-intrusa' },
    });
    try {
      await intrusa.loadURL('data:text/html,<p>intrusa</p>');
      const tipo = await intrusa.webContents.executeJavaScript('typeof window.MorphiqApp');
      exigir(tipo === 'undefined', `La página ajena recibió el puente (${tipo})`);
    } finally {
      intrusa.destroy();
    }
  });

  await paso('e) Contrato desde la página: ajustes, conexiones, modo ligero, errores', async () => {
    const r = await evaluar(`(async () => {
      const a = window.MorphiqApp;
      const salida = {};
      salida.plataforma = await a.plataforma();
      salida.conexiones = await a.conexiones();
      salida.modoLigero = await a.modoLigero();
      salida.impresoras = (await a.impresoras()).length;
      const ajustes = await a.guardarAjustes({ pruebaHumo: 42 });
      salida.ajusteGuardado = ajustes.pruebaHumo;
      salida.sinPerfil = await a.paginaDePrueba();
      salida.usb = await a.imprimir({ id: 'humo-usb', destino: { conexion: 'usb', vendorId: 1, productId: 2 }, documento: { tipo: 'crudo', base64: 'AA==' } });
      salida.driverCrudo = await a.imprimir({ id: 'humo-drv', destino: { conexion: 'driver', nombre: 'No existe' }, documento: { tipo: 'crudo', base64: 'AA==' } });
      salida.spooler = await a.imprimir({ id: 'humo-spool', destino: { conexion: 'spooler', nombre: 'Impresora que no existe 123' }, documento: { tipo: 'crudo', base64: 'AA==' } });
      salida.estado = await a.estado({ destino: { conexion: 'spooler', nombre: 'Impresora que no existe 123' } });
      salida.ultimo = await a.ultimoTicket();
      try { await a.imprimir({ id: 5 }); salida.malUso = 'no rechazó'; } catch (e) { salida.malUso = e.codigo; }
      try { a.escuchar('nada', () => {}); salida.malEvento = 'no rechazó'; } catch (e) { salida.malEvento = e.message; }
      const quitar = a.escuchar('modo-ligero', () => {});
      salida.quitar = typeof quitar;
      return salida;
    })()`);
    exigir(r.plataforma === 'windows', 'plataforma()');
    exigir(r.conexiones.length === 6 && r.conexiones.find((c) => c.conexion === 'usb').disponible === false, 'conexiones()');
    exigir(typeof r.modoLigero.activo === 'boolean', 'modoLigero()');
    exigir(r.ajusteGuardado === 42, 'guardarAjustes()');
    exigir(r.sinPerfil.ok === false && r.sinPerfil.codigo === 'SIN_PERFIL', `paginaDePrueba sin perfil: ${JSON.stringify(r.sinPerfil)}`);
    exigir(r.usb.codigo === 'NO_SOPORTADO', 'usb debe ser NO_SOPORTADO');
    exigir(r.driverCrudo.codigo === 'NO_SOPORTADO', 'driver con crudo debe ser NO_SOPORTADO');
    exigir(r.spooler.ok === false && r.spooler.codigo === 'DESCONECTADA', `spooler inexistente: ${JSON.stringify(r.spooler)}`);
    exigir(r.estado.enLinea === false, 'estado de una impresora inexistente');
    exigir(r.ultimo === null, 'ultimoTicket debía ser null');
    exigir(r.malUso === 'ARGUMENTOS', `un mal uso debe rechazar con ARGUMENTOS (fue ${r.malUso})`);
    exigir(/Evento desconocido/.test(r.malEvento) && r.quitar === 'function', `escuchar(): ${r.malEvento} / ${r.quitar}`);
    return r;
  });

  await paso('f) Por red desde la página: prueba, cajón, copias, duplicado, progreso, último ticket, eventos', async () => {
    const recibido = [];
    const servidor = net.createServer((socket) => {
      socket.on('data', (trozo) => recibido.push(trozo));
      socket.on('error', (error) => registrar(`Servidor falso: ${error.message}`));
    });
    await new Promise((listo) => servidor.listen(0, '127.0.0.1', listo));
    const puerto = servidor.address().port;
    try {
      const r = await evaluar(`(async () => {
        const a = window.MorphiqApp;
        const ev = { progreso: [], modo: [], act: [] };
        a.escuchar('progreso', (d) => ev.progreso.push(d));
        a.escuchar('modo-ligero', (d) => ev.modo.push(d));
        a.escuchar('actualizacion', (d) => ev.act.push(d));
        const destino = { conexion: 'red', host: '127.0.0.1', puerto: ${puerto} };
        const salida = { ev };
        salida.prueba = await a.paginaDePrueba({ destino });
        salida.cajon = await a.abrirCajon({ destino });
        const trabajo = { id: 'humo-red-1', destino, copias: 2, documento: { tipo: 'crudo', base64: 'QUJD', bloqueBytes: 16, pausaMs: 5 },
          recordar: { titulo: 'Venta humo', documento: { tipo: 'crudo', base64: 'REVG' } } };
        salida.r1 = await a.imprimir(trabajo);
        salida.r2 = await a.imprimir(trabajo);
        salida.estado = await a.estado({ destino });
        salida.ultimo = await a.ultimoTicket();
        await a.guardarAjustes({ perfil: { nombre: 'humo', destino, cajon: null } });
        salida.reimpresion = await a.reimprimirUltimo();
        await a.guardarAjustes({ modoLigero: true });
        salida.modo = await a.modoLigero();
        salida.actualizacion = await a.buscarActualizacion();
        await new Promise((listo) => setTimeout(listo, 300));
        return salida;
      })()`);
      const texto = Buffer.concat(recibido).toString('latin1');
      exigir(r.prueba.ok && r.cajon.ok, `prueba/cajón por red: ${JSON.stringify([r.prueba, r.cajon])}`);
      exigir(/POS Don Poncho\n.*\nPagina de prueba\nConexion: red 127\.0\.0\.1:\d+/.test(texto), 'La página de prueba no llegó completa');
      exigir(texto.includes('ABCABC'), 'Las 2 copias de ABC no llegaron');
      exigir(r.r1.ok && r.r1.estado === 'enviado' && r.r1.bytes === 6, `r1: ${JSON.stringify(r.r1)}`);
      exigir(r.r2.estado === 'duplicado', 'El mismo id debía responder duplicado');
      exigir(texto.split('ABCABC').length === 2, 'El duplicado volvió a imprimir');
      exigir(r.ev.progreso.some((p) => p.id === 'humo-red-1' && p.enviados === p.total), 'No llegó el evento progreso');
      exigir(r.estado.soportado === false, 'El servidor falso no contesta DLE EOT: debía ser soportado:false');
      exigir(r.ultimo && r.ultimo.titulo === 'Venta humo', 'ultimoTicket()');
      exigir(r.reimpresion.ok && /\*\*\* REIMPRESION \d\d\/\d\d\/\d{4} \d\d:\d\d \*\*\*\nDEF/.test(texto), 'reimprimirUltimo()');
      exigir(r.ev.modo.length === 1 && r.ev.modo[0].activo === true && r.modo.origen === 'manual', `evento modo-ligero: ${JSON.stringify(r.ev.modo)}`);
      exigir(r.actualizacion.estado === 'error' && r.ev.act.length >= 1, 'buscarActualizacion sin empaquetar debe dar error claro y evento');
      return { bytesRecibidos: texto.length, actualizacion: r.actualizacion.mensaje };
    } finally {
      await new Promise((listo) => servidor.close(listo));
    }
  });

  await paso('g) electron-updater real (app empaquetada) ve una versión más nueva y no la misma', async () => {
    const r = await comprobarElectronUpdater({ app: electron.app, versionActual: cliente.version, versionMasNueva: '99.0.0' });
    if (r.omitido) return r;
    exigir(r.mismaVersion.disponible === false, `La misma versión no es una actualización: ${JSON.stringify(r)}`);
    exigir(r.versionMasNueva.disponible === true && r.versionMasNueva.anunciada === '99.0.0', `La 99.0.0 sí lo es: ${JSON.stringify(r)}`);
    return r;
  });

  fs.writeFileSync(salida('humo-resultado.json'), `${JSON.stringify({ pasos, externos }, null, 2)}\n`);
  aplicacion.cerrar();
  const fallos = pasos.filter((p) => !p.ok);
  console.log(fallos.length === 0 ? 'PRUEBA DE HUMO: todo pasó' : `PRUEBA DE HUMO: fallaron ${fallos.length} de ${pasos.length}`);
  return fallos.length === 0 ? 0 : 1;
}


module.exports = { correrHumo };
