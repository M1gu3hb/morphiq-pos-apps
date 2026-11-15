'use strict';
/** DP-D125 (Windows): sólo impresoras de la lista del sistema y sólo red local. Con dobles: no se imprime nada. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { crearServicioDeImpresion } = require('../principal/impresion/servicio');
const { crearVerificadorDeImpresoras, VIGENCIA_DE_LA_LISTA_MS } = require('../principal/impresion/instaladas');
const { crearUltimoTicket } = require('../principal/impresion/ultimo-ticket');
const { validarTrabajo } = require('../principal/impresion/validar');
const { ErrorDeImpresion } = require('../principal/impresion/errores');

const CRUDO = { tipo: 'crudo', base64: Buffer.from([1, 2, 3]).toString('base64') };
const HTML = { tipo: 'html', html: '<p>ticket</p>', anchoMm: 58 };
const UNC_INSTALADA = '\\\\caja\\POS-58';
const UNC_INVENTADA = '\\\\equipo-ajeno\\impresora';

/** `lista` es lo que Windows dice que está instalado; `fallaLista` simula que no se pudo leer. */
function entorno({ lista = ['EPSON TM-T20', UNC_INSTALADA], fallaLista = null, perfil = null, reloj } = {}) {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'morphiq-restricciones-'));
  const registro = { listar: 0, crudo: [], driver: [], red: [] };
  const ayudante = {
    ejecutar: async (argumentos) => {
      if (argumentos[0] === 'listar') {
        registro.listar += 1;
        if (fallaLista) throw fallaLista;
        return { ok: true, impresoras: lista.map((nombre) => ({ nombre })) };
      }
      registro.crudo.push(argumentos);
      return { ok: true, fueraDeLinea: false, sinPapel: false, tapaAbierta: false };
    },
  };
  const servicio = crearServicioDeImpresion({
    ayudante,
    imprimirPorDriver: async (datos) => (registro.driver.push(datos), { bytes: 1 }),
    carpetaTemporal: path.join(carpeta, 'tmp'),
    ajustes: () => ({ perfil }),
    ultimoTicket: crearUltimoTicket(path.join(carpeta, 'ultimo.json')),
    cliente: { nombre: 'POS Don Poncho' },
    emitir: () => {},
    enviarPorRed: async (datos) => (registro.red.push(datos), { bytes: 3 }),
    verificador: reloj ? crearVerificadorDeImpresoras({ ayudante, ahora: reloj }) : undefined,
  });
  return { servicio, registro, limpiar: () => fs.rmSync(carpeta, { recursive: true, force: true }) };
}

const imprimir = (e, destino, documento = CRUDO, id = `t-${Math.random()}`) => e.servicio.imprimir(validarTrabajo({ id, destino, documento }));

test('spooler: una impresora instalada imprime; una compartida UNC INSTALADA también', async () => {
  const e = entorno();
  try {
    assert.equal((await imprimir(e, { conexion: 'spooler', nombre: 'EPSON TM-T20' })).ok, true);
    assert.equal((await imprimir(e, { conexion: 'spooler', nombre: UNC_INSTALADA })).ok, true);
    assert.deepEqual(e.registro.crudo.map((a) => a[1]), ['EPSON TM-T20', UNC_INSTALADA]);
  } finally {
    e.limpiar();
  }
});

test('spooler: el nombre no se compara por mayúsculas (Windows no las distingue)', async () => {
  const e = entorno();
  try {
    assert.equal((await imprimir(e, { conexion: 'spooler', nombre: 'epson tm-t20' })).ok, true);
  } finally {
    e.limpiar();
  }
});

test('spooler: una impresora que no está en la lista se rechaza con DESCONECTADA y NO llega al ayudante', async () => {
  const e = entorno();
  try {
    for (const nombre of [UNC_INVENTADA, '\\\\192.168.1.9\\x', 'Impresora que no existe', 'EPSON TM-T21']) {
      const r = await imprimir(e, { conexion: 'spooler', nombre });
      assert.deepEqual([r.ok, r.estado, r.codigo], [false, 'error', 'DESCONECTADA'], nombre);
      assert.match(r.mensaje, /no está instalada en este equipo/);
    }
    assert.deepEqual(e.registro.crudo, [], 'ningún trabajo llegó al ayudante');
  } finally {
    e.limpiar();
  }
});

test('driver: sólo imprime en una impresora de la lista; un UNC inventado no abre ni la ventana', async () => {
  const e = entorno();
  try {
    const bien = await imprimir(e, { conexion: 'driver', nombre: UNC_INSTALADA }, HTML);
    assert.equal(bien.ok, true);
    const mal = await imprimir(e, { conexion: 'driver', nombre: UNC_INVENTADA }, HTML);
    assert.deepEqual([mal.ok, mal.codigo], [false, 'DESCONECTADA']);
    assert.deepEqual(e.registro.driver.map((d) => d.nombre), [UNC_INSTALADA], 'el driver no se invocó para el inventado');
  } finally {
    e.limpiar();
  }
});

test('lista ilegible: no se imprime a ciegas (DESCONOCIDO) ni por spooler ni por driver', async () => {
  const e = entorno({ fallaLista: new ErrorDeImpresion('DESCONOCIDO', 'El ayudante de impresión no contestó') });
  try {
    const a = await imprimir(e, { conexion: 'spooler', nombre: 'EPSON TM-T20' });
    const b = await imprimir(e, { conexion: 'driver', nombre: 'EPSON TM-T20' }, HTML);
    for (const r of [a, b]) {
      assert.deepEqual([r.ok, r.codigo], [false, 'DESCONOCIDO']);
      assert.match(r.mensaje, /No se pudo leer la lista de impresoras de Windows/);
      assert.match(r.mensaje, /no se imprime sin comprobar/);
    }
    assert.deepEqual([e.registro.crudo.length, e.registro.driver.length], [0, 0]);
  } finally {
    e.limpiar();
  }
});

test('la página de prueba y el cajón por spooler pasan por la misma comprobación', async () => {
  const e = entorno();
  try {
    const destino = { conexion: 'spooler', nombre: UNC_INVENTADA };
    assert.equal((await e.servicio.paginaDePrueba(destino)).codigo, 'DESCONECTADA');
    assert.equal((await e.servicio.abrirCajon({ destino })).codigo, 'DESCONECTADA');
    assert.deepEqual(e.registro.crudo, []);
  } finally {
    e.limpiar();
  }
});

test('estado por spooler de una impresora que no está en la lista: fuera de línea, sin abrirla', async () => {
  const e = entorno();
  try {
    const r = await e.servicio.estado({ conexion: 'spooler', nombre: UNC_INVENTADA });
    assert.deepEqual([r.soportado, r.enLinea], [true, false]);
    assert.match(r.mensaje, /no está instalada/);
    assert.deepEqual(e.registro.crudo, [], 'no se le preguntó el estado a Windows');
  } finally {
    e.limpiar();
  }
});

test('la lista se reutiliza mientras es reciente, y se vuelve a leer cuando falta el nombre o caduca', async () => {
  let ahora = 1_000_000;
  const e = entorno({ reloj: () => ahora });
  try {
    await imprimir(e, { conexion: 'spooler', nombre: 'EPSON TM-T20' });
    await imprimir(e, { conexion: 'spooler', nombre: 'EPSON TM-T20' });
    assert.equal(e.registro.listar, 1, 'la segunda vez no relee');
    await imprimir(e, { conexion: 'spooler', nombre: 'Recién instalada' });
    assert.equal(e.registro.listar, 2, 'un nombre ausente fuerza una lectura nueva');
    ahora += VIGENCIA_DE_LA_LISTA_MS + 1;
    await imprimir(e, { conexion: 'spooler', nombre: 'EPSON TM-T20' });
    assert.equal(e.registro.listar, 3, 'caducó');
  } finally {
    e.limpiar();
  }
});

test('red: una dirección pública o un nombre no llegan al socket; la local sí, con el literal limpio', async () => {
  const e = entorno();
  try {
    for (const host of ['8.8.8.8', '192.0.2.10', 'impresora.local', '192.168.1.1.evil.com', '::ffff:8.8.8.8', '2130706433', '127.1', '010.0.0.1']) {
      const r = await imprimir(e, { conexion: 'red', host });
      assert.deepEqual([r.ok, r.codigo], [false, 'NO_SOPORTADO'], host);
    }
    assert.deepEqual(e.registro.red, [], 'ninguna conexión salió');
    await imprimir(e, { conexion: 'red', host: '[::ffff:192.168.1.5]', puerto: 9100 });
    await imprimir(e, { conexion: 'red', host: '192.168.1.50' });
    assert.deepEqual(e.registro.red.map((d) => d.host), ['::ffff:192.168.1.5', '192.168.1.50']);
  } finally {
    e.limpiar();
  }
});

test('un perfil guardado por la 1.0.0 con impresora de red por NOMBRE se rechaza con NO_SOPORTADO y su motivo', async () => {
  const e = entorno({ perfil: { destino: { conexion: 'red', host: 'impresora-cocina.local' } } });
  try {
    const r = await e.servicio.imprimir(validarTrabajo({ id: 'p1', documento: CRUDO }));
    assert.deepEqual([r.ok, r.codigo], [false, 'NO_SOPORTADO']);
    assert.match(r.mensaje, /dirección IP completa/);
    assert.equal((await e.servicio.paginaDePrueba()).codigo, 'NO_SOPORTADO');
    const estado = await e.servicio.estado();
    assert.equal(estado.soportado, false, 'el estado de un nombre de host no se consulta');
    assert.match(estado.mensaje, /dirección IP completa/);
  } finally {
    e.limpiar();
  }
});
