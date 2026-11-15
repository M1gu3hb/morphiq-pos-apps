'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { enviarPorRed } = require('../principal/impresion/red');
const { estadoPorRed, interpretarEstado, esRespuestaDeEstado } = require('../principal/impresion/estado-red');

/** Un servidor TCP falso en 127.0.0.1 que guarda lo que recibe y, opcionalmente, contesta. */
function servidorFalso({ alRecibir } = {}) {
  const recibido = [];
  const llegadas = [];
  const conexiones = new Set();
  const servidor = net.createServer((socket) => {
    conexiones.add(socket);
    socket.on('close', () => conexiones.delete(socket));
    socket.on('error', () => {});
    socket.on('data', (trozo) => {
      recibido.push(trozo);
      llegadas.push({ en: Date.now(), bytes: trozo.length });
      if (alRecibir) alRecibir(trozo, socket);
    });
  });
  return new Promise((listo) => {
    servidor.listen(0, '127.0.0.1', () => {
      listo({
        puerto: servidor.address().port,
        recibido: () => Buffer.concat(recibido),
        llegadas,
        cerrar: () => {
          conexiones.forEach((s) => s.destroy());
          return new Promise((r) => servidor.close(r));
        },
      });
    });
  });
}

test('red: entrega todos los bytes, por bloques, con progreso', async () => {
  const srv = await servidorFalso();
  try {
    const datos = Buffer.alloc(10_000, 0x41);
    const avances = [];
    const r = await enviarPorRed({
      host: '127.0.0.1',
      puerto: srv.puerto,
      datos,
      bloqueBytes: 4096,
      alProgreso: (e, t) => avances.push([e, t]),
    });
    assert.equal(r.bytes, 10_000);
    assert.deepEqual(avances, [[4096, 10_000], [8192, 10_000], [10_000, 10_000]]);
    assert.equal(Buffer.compare(srv.recibido(), datos), 0);
  } finally {
    await srv.cerrar();
  }
});

test('red: la pausa entre bloques se respeta', async () => {
  const srv = await servidorFalso();
  try {
    const inicio = Date.now();
    await enviarPorRed({ host: '127.0.0.1', puerto: srv.puerto, datos: Buffer.alloc(300, 1), bloqueBytes: 100, pausaMs: 80 });
    const duracion = Date.now() - inicio;
    assert.ok(duracion >= 150, `dos pausas de 80 ms deben tardar al menos ~160 ms (tardó ${duracion})`);
    assert.equal(srv.recibido().length, 300);
  } finally {
    await srv.cerrar();
  }
});

test('red: sin nadie escuchando responde DESCONECTADA', async () => {
  const libre = await servidorFalso();
  const puerto = libre.puerto;
  await libre.cerrar();
  await assert.rejects(
    enviarPorRed({ host: '127.0.0.1', puerto, datos: Buffer.from('x'), esperaMs: 2000 }),
    (e) => e.codigo === 'DESCONECTADA' && e.message === 'Impresora desconectada',
  );
});

test('red: si la impresora no deja de ser lenta, vence con TIEMPO', async () => {
  const srv = await servidorFalso();
  try {
    const inicio = Date.now();
    await assert.rejects(
      enviarPorRed({ host: '127.0.0.1', puerto: srv.puerto, datos: Buffer.alloc(1000, 1), bloqueBytes: 100, pausaMs: 400, esperaMs: 600 }),
      (e) => e.codigo === 'TIEMPO' && /No respondió en 1 s/.test(e.message),
    );
    assert.ok(Date.now() - inicio < 2500, 'no debe quedarse esperando');
  } finally {
    await srv.cerrar();
  }
});

test('red: un nombre de host ni se intenta (no hay DNS): NO_SOPORTADO al instante', async () => {
  const inicio = Date.now();
  await assert.rejects(
    enviarPorRed({ host: 'no-existe.invalid', puerto: 9100, datos: Buffer.from('x'), esperaMs: 4000 }),
    (e) => e.codigo === 'NO_SOPORTADO' && /dirección IP completa/.test(e.message),
  );
  assert.ok(Date.now() - inicio < 500, 'no debe esperar a ningún DNS ni plazo');
});

test('red: una dirección pública no se conecta; el literal que se valida es el que usa el socket', async () => {
  await assert.rejects(enviarPorRed({ host: '8.8.8.8', datos: Buffer.from('x') }), (e) => e.codigo === 'NO_SOPORTADO' && /red local/.test(e.message));
  const srv = await servidorFalso();
  try {
    await enviarPorRed({ host: '[127.0.0.1]', puerto: srv.puerto, datos: Buffer.from('ok') });
    assert.equal(srv.recibido().toString(), 'ok');
  } finally {
    await srv.cerrar();
  }
});

test('estado: una dirección pública no se consulta y se dice por qué', async () => {
  const e = await estadoPorRed({ host: '192.0.2.10', esperaMs: 2000 });
  assert.deepEqual([e.soportado, /red local/.test(e.mensaje)], [false, true]);
});

test('estado: interpreta los tres bytes DLE EOT', () => {
  assert.equal(esRespuestaDeEstado(0x12), true);
  assert.equal(esRespuestaDeEstado(0x00), false);
  assert.deepEqual(interpretarEstado({ impresora: 0x12, causaFueraDeLinea: 0x12, papel: 0x12 }), {
    soportado: true,
    enLinea: true,
    cajonAbierto: false,
    tapaAbierta: false,
    sinPapel: false,
  });
  const mal = interpretarEstado({ impresora: 0x12 | 0x08 | 0x04, causaFueraDeLinea: 0x12 | 0x04, papel: 0x12 | 0x60 });
  assert.deepEqual([mal.enLinea, mal.cajonAbierto, mal.tapaAbierta, mal.sinPapel], [false, true, true, true]);
  assert.equal(interpretarEstado({ impresora: 0x12, causaFueraDeLinea: 0x12, papel: 0x12 | 0x0c }).sinPapel, false, 'poco papel no es sin papel');
});

/** Una impresora falsa que contesta DLE EOT n con el byte indicado. */
const impresoraQueContesta = (bytes) => (trozo, socket) => {
  for (let i = 0; i + 2 < trozo.length + 0 && i < trozo.length; i += 3) {
    if (trozo[i] === 0x10 && trozo[i + 1] === 0x04) socket.write(Buffer.from([bytes[trozo[i + 2]]]));
  }
};

test('estado: lee la respuesta de una impresora de red', async () => {
  const srv = await servidorFalso({ alRecibir: impresoraQueContesta({ 1: 0x12, 2: 0x16, 4: 0x72 }) });
  try {
    const e = await estadoPorRed({ host: '127.0.0.1', puerto: srv.puerto });
    assert.deepEqual(e, { soportado: true, enLinea: true, cajonAbierto: false, tapaAbierta: true, sinPapel: true });
    assert.deepEqual([...srv.recibido()], [0x10, 0x04, 0x01, 0x10, 0x04, 0x02, 0x10, 0x04, 0x04]);
  } finally {
    await srv.cerrar();
  }
});

test('estado: una impresora en línea y con papel', async () => {
  const srv = await servidorFalso({ alRecibir: impresoraQueContesta({ 1: 0x12, 2: 0x12, 4: 0x12 }) });
  try {
    const e = await estadoPorRed({ host: '127.0.0.1', puerto: srv.puerto });
    assert.equal(e.enLinea, true);
    assert.equal(e.sinPapel, false);
    assert.equal(e.tapaAbierta, false);
  } finally {
    await srv.cerrar();
  }
});

test('estado: si no contesta, dice que no se puede preguntar (no inventa)', async () => {
  const srv = await servidorFalso();
  try {
    const e = await estadoPorRed({ host: '127.0.0.1', puerto: srv.puerto });
    assert.equal(e.soportado, false);
    assert.match(e.mensaje, /no contestó/i);
  } finally {
    await srv.cerrar();
  }
});

test('estado: sin nadie escuchando, está fuera de línea', async () => {
  const libre = await servidorFalso();
  const puerto = libre.puerto;
  await libre.cerrar();
  const e = await estadoPorRed({ host: '127.0.0.1', puerto, esperaMs: 2000 });
  assert.equal(e.enLinea, false);
  assert.match(e.mensaje, /desconectada/i);
});
