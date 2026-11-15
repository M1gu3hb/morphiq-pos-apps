'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { crearServicioDeImpresion } = require('../principal/impresion/servicio');
const { crearUltimoTicket } = require('../principal/impresion/ultimo-ticket');
const { validarTrabajo } = require('../principal/impresion/validar');
const { ErrorDeImpresion } = require('../principal/impresion/errores');

const base64 = (bytes) => Buffer.from(bytes).toString('base64');
const FECHA = new Date(2026, 10, 14, 9, 5);

/** Arma el servicio con un ayudante falso que anota los argumentos y lo que había en el archivo temporal. */
function entorno({ perfil = null, fallaAyudante = null } = {}) {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'morphiq-servicio-'));
  const llamadas = [];
  const eventos = [];
  const ayudante = {
    ejecutar: async (argumentos, opciones) => {
      const archivo = argumentos.find((a) => a.endsWith('.bin'));
      llamadas.push({ argumentos, opciones, contenido: archivo ? fs.readFileSync(archivo) : null, archivo });
      if (fallaAyudante) throw fallaAyudante;
      if (opciones && opciones.alAvance) opciones.alAvance(3, 3);
      return { ok: true, fueraDeLinea: false, sinPapel: false, tapaAbierta: false };
    },
  };
  const ultimoTicket = crearUltimoTicket(path.join(carpeta, 'ultimo.json'), () => FECHA);
  const servicio = crearServicioDeImpresion({
    ayudante,
    imprimirPorDriver: async () => ({ bytes: 1 }),
    carpetaTemporal: path.join(carpeta, 'tmp'),
    ajustes: () => ({ perfil }),
    ultimoTicket,
    cliente: { nombre: 'POS Don Poncho' },
    emitir: (evento, datos) => eventos.push({ evento, datos }),
    ahora: () => FECHA,
  });
  return { servicio, llamadas, eventos, carpeta, limpiar: () => fs.rmSync(carpeta, { recursive: true, force: true }) };
}

const spooler = { conexion: 'spooler', nombre: 'EPSON TM-T20' };

test('spooler: manda los bytes por archivo temporal, sin shell, y lo borra siempre', async () => {
  const e = entorno();
  try {
    const trabajo = validarTrabajo({ id: 't1', destino: spooler, documento: { tipo: 'crudo', base64: base64([1, 2, 3]), bloqueBytes: 512, pausaMs: 20 } });
    const r = await e.servicio.imprimir(trabajo);
    assert.equal(r.ok, true);
    assert.equal(r.estado, 'enviado');
    assert.equal(r.bytes, 3);
    const [llamada] = e.llamadas;
    assert.deepEqual(llamada.argumentos.slice(0, 2), ['crudo', 'EPSON TM-T20']);
    assert.deepEqual(llamada.argumentos.slice(3), ['512', '20']);
    assert.deepEqual([...llamada.contenido], [1, 2, 3]);
    assert.equal(fs.existsSync(llamada.archivo), false, 'el temporal se borra');
    assert.deepEqual(e.eventos, [{ evento: 'progreso', datos: { id: 't1', enviados: 3, total: 3 } }]);
  } finally {
    e.limpiar();
  }
});

test('spooler: el temporal también se borra si el ayudante falla, y el fallo se traduce', async () => {
  const e = entorno({ fallaAyudante: new ErrorDeImpresion('SIN_PAPEL', 'Sin papel') });
  try {
    const r = await e.servicio.imprimir(validarTrabajo({ id: 't2', destino: spooler, documento: { tipo: 'crudo', base64: base64([9]) } }));
    assert.deepEqual([r.ok, r.estado, r.codigo, r.mensaje], [false, 'error', 'SIN_PAPEL', 'Sin papel']);
    assert.equal(fs.existsSync(e.llamadas[0].archivo), false);
    assert.deepEqual(fs.readdirSync(path.join(e.carpeta, 'tmp')), []);
  } finally {
    e.limpiar();
  }
});

test('sin destino ni perfil responde SIN_PERFIL (no rechaza)', async () => {
  const e = entorno();
  try {
    const r = await e.servicio.imprimir(validarTrabajo({ id: 't3', documento: { tipo: 'crudo', base64: base64([1]) } }));
    assert.deepEqual([r.ok, r.codigo], [false, 'SIN_PERFIL']);
    assert.equal((await e.servicio.paginaDePrueba()).codigo, 'SIN_PERFIL');
    assert.equal(e.llamadas.length, 0);
  } finally {
    e.limpiar();
  }
});

test('usa el destino del perfil guardado y valida que sea sano', async () => {
  const bueno = entorno({ perfil: { destino: spooler } });
  const malo = entorno({ perfil: { destino: { conexion: 'red' } } });
  try {
    const r = await bueno.servicio.imprimir(validarTrabajo({ id: 't4', documento: { tipo: 'crudo', base64: base64([1]) } }));
    assert.equal(r.ok, true);
    const m = await malo.servicio.imprimir(validarTrabajo({ id: 't4', documento: { tipo: 'crudo', base64: base64([1]) } }));
    assert.equal(m.codigo, 'SIN_PERFIL');
  } finally {
    bueno.limpiar();
    malo.limpiar();
  }
});

test('usb y bluetooth no existen en Windows: NO_SOPORTADO; el driver no imprime crudo ni el spooler html', async () => {
  const e = entorno();
  try {
    const crudo = { tipo: 'crudo', base64: base64([1]) };
    const usb = await e.servicio.imprimir(validarTrabajo({ id: 'u', destino: { conexion: 'usb', vendorId: 1, productId: 2 }, documento: crudo }));
    const bt = await e.servicio.imprimir(validarTrabajo({ id: 'b', destino: { conexion: 'bluetooth', direccion: 'AA:BB' }, documento: crudo }));
    const drv = await e.servicio.imprimir(validarTrabajo({ id: 'd', destino: { conexion: 'driver', nombre: 'X' }, documento: crudo }));
    const html = await e.servicio.imprimir(validarTrabajo({ id: 'h', destino: spooler, documento: { tipo: 'html', html: '<p>x</p>', anchoMm: 58 } }));
    for (const r of [usb, bt, drv, html]) assert.deepEqual([r.ok, r.codigo], [false, 'NO_SOPORTADO']);
    assert.match(usb.mensaje, /USB/);
  } finally {
    e.limpiar();
  }
});

test('página de prueba por spooler: ESC/POS ASCII con el nombre del cliente y la conexión', async () => {
  const e = entorno({ perfil: { destino: spooler } });
  try {
    const r = await e.servicio.paginaDePrueba();
    assert.equal(r.ok, true);
    const bytes = e.llamadas[0].contenido;
    assert.deepEqual([...bytes.subarray(0, 2)], [0x1b, 0x40]);
    assert.deepEqual([...bytes.subarray(-4)], [0x1d, 0x56, 0x42, 0x00]);
    assert.match(bytes.toString('ascii'), /POS Don Poncho\n14\/11\/2026 09:05\nPagina de prueba\nConexion: spooler EPSON TM-T20/);
  } finally {
    e.limpiar();
  }
});

test('cajón por spooler: ESC p 0 25 250 por omisión, el del perfil si existe, el dado si viene', async () => {
  const e = entorno({ perfil: { destino: spooler, cajon: { base64: base64([0x1b, 0x70, 0x01, 0x40, 0x40]) } } });
  const sin = entorno({ perfil: { destino: spooler, cajon: null } });
  try {
    await e.servicio.abrirCajon();
    assert.deepEqual([...e.llamadas[0].contenido], [0x1b, 0x70, 0x01, 0x40, 0x40]);
    await e.servicio.abrirCajon({ base64: base64([7, 7]) });
    assert.deepEqual([...e.llamadas[1].contenido], [7, 7]);
    await sin.servicio.abrirCajon();
    assert.deepEqual([...sin.llamadas[0].contenido], [0x1b, 0x70, 0x00, 0x19, 0xfa]);
  } finally {
    e.limpiar();
    sin.limpiar();
  }
});

/** Un servidor TCP falso que guarda lo que recibe. */
function servidor() {
  const trozos = [];
  const srv = net.createServer((s) => {
    s.on('data', (t) => trozos.push(t));
    s.on('error', () => {});
  });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok({ puerto: srv.address().port, recibido: () => Buffer.concat(trozos), cerrar: () => new Promise((r) => srv.close(r)) })));
}

test('red: la página de prueba y el cajón llegan completos al socket', async () => {
  const srv = await servidor();
  const e = entorno();
  try {
    const destino = { conexion: 'red', host: '127.0.0.1', puerto: srv.puerto };
    assert.equal((await e.servicio.paginaDePrueba(destino)).ok, true);
    assert.equal((await e.servicio.abrirCajon({ destino })).ok, true);
    const recibido = srv.recibido();
    assert.match(recibido.toString('latin1'), /Pagina de prueba\nConexion: red 127\.0\.0\.1:\d+/);
    assert.deepEqual([...recibido.subarray(-5)], [0x1b, 0x70, 0x00, 0x19, 0xfa]);
    assert.equal(e.llamadas.length, 0, 'por red no se usa el ayudante');
  } finally {
    e.limpiar();
    await srv.cerrar();
  }
});

test('copias y duplicados por red: 2 copias llegan; el mismo id no vuelve a imprimir', async () => {
  const srv = await servidor();
  const e = entorno();
  try {
    const destino = { conexion: 'red', host: '127.0.0.1', puerto: srv.puerto };
    const trabajo = validarTrabajo({ id: 'venta-9', destino, copias: 2, documento: { tipo: 'crudo', base64: base64([65, 66]) } });
    const r1 = await e.servicio.imprimir(trabajo);
    const r2 = await e.servicio.imprimir(trabajo);
    assert.deepEqual([r1.estado, r1.bytes], ['enviado', 4]);
    assert.equal(r2.estado, 'duplicado');
    assert.equal(srv.recibido().toString('ascii'), 'ABAB');
  } finally {
    e.limpiar();
    await srv.cerrar();
  }
});

test('«recordar» guarda el último ticket y reimprimir lo manda con el renglón de REIMPRESION', async () => {
  const e = entorno({ perfil: { destino: spooler } });
  try {
    assert.equal((await e.servicio.reimprimirUltimo()).ok, false);
    await e.servicio.imprimir(
      validarTrabajo({
        id: 'v1',
        documento: { tipo: 'crudo', base64: base64([1]) },
        recordar: { titulo: 'Venta 1', documento: { tipo: 'crudo', base64: base64([0x41, 0x42]) } },
      }),
    );
    const r = await e.servicio.reimprimirUltimo();
    assert.equal(r.ok, true);
    const bytes = e.llamadas.at(-1).contenido;
    assert.equal(bytes.subarray(2).toString('ascii'), '*** REIMPRESION 14/11/2026 09:05 ***\nAB');
  } finally {
    e.limpiar();
  }
});

test('estado por spooler traduce las banderas del ayudante', async () => {
  const e = entorno({ perfil: { destino: spooler } });
  try {
    assert.deepEqual(await e.servicio.estado(), { soportado: true, enLinea: true, sinPapel: false, tapaAbierta: false });
    const serie = await e.servicio.estado({ conexion: 'serial', puertoSerie: 'COM3' });
    assert.equal(serie.soportado, false);
  } finally {
    e.limpiar();
  }
});
