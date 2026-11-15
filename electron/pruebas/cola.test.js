'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearCola } = require('../principal/impresion/cola');
const { ErrorDeImpresion } = require('../principal/impresion/errores');

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

test('un trabajo a la vez y en orden por impresora', async () => {
  const bitacora = [];
  let simultaneos = 0;
  let maximo = 0;
  const cola = crearCola({
    entregar: async (trabajo) => {
      simultaneos += 1;
      maximo = Math.max(maximo, simultaneos);
      bitacora.push(`inicio ${trabajo.id}`);
      await espera(trabajo.id === 'a' ? 40 : 5);
      bitacora.push(`fin ${trabajo.id}`);
      simultaneos -= 1;
      return { bytes: 10 };
    },
  });
  const resultados = await Promise.all([
    cola.encolar('impresora-1', { id: 'a' }),
    cola.encolar('impresora-1', { id: 'b' }),
    cola.encolar('impresora-1', { id: 'c' }),
  ]);
  assert.deepEqual(bitacora, ['inicio a', 'fin a', 'inicio b', 'fin b', 'inicio c', 'fin c']);
  assert.equal(maximo, 1);
  assert.deepEqual(resultados.map((r) => r.estado), ['enviado', 'enviado', 'enviado']);
});

test('impresoras distintas corren en paralelo', async () => {
  let simultaneos = 0;
  let maximo = 0;
  const cola = crearCola({
    entregar: async () => {
      simultaneos += 1;
      maximo = Math.max(maximo, simultaneos);
      await espera(30);
      simultaneos -= 1;
      return { bytes: 1 };
    },
  });
  await Promise.all([cola.encolar('uno', { id: 'x' }), cola.encolar('dos', { id: 'y' })]);
  assert.equal(maximo, 2);
});

test('un id ya entregado responde duplicado y no vuelve a imprimir', async () => {
  let llamadas = 0;
  const cola = crearCola({ entregar: async () => ((llamadas += 1), { bytes: 5 }) });
  const primero = await cola.encolar('p', { id: 'venta-1' });
  const segundo = await cola.encolar('p', { id: 'venta-1' });
  assert.equal(primero.estado, 'enviado');
  assert.equal(segundo.estado, 'duplicado');
  assert.equal(segundo.ok, true);
  assert.equal(llamadas, 1);
});

test('el mismo id encolado dos veces seguidas imprime una sola vez', async () => {
  let llamadas = 0;
  const cola = crearCola({ entregar: async () => (await espera(10), (llamadas += 1), { bytes: 1 }) });
  const [a, b] = await Promise.all([cola.encolar('p', { id: 'doble' }), cola.encolar('p', { id: 'doble' })]);
  assert.deepEqual([a.estado, b.estado], ['enviado', 'duplicado']);
  assert.equal(llamadas, 1);
});

test('un trabajo que falló se puede reintentar con el mismo id', async () => {
  let intento = 0;
  const cola = crearCola({
    entregar: async () => {
      intento += 1;
      if (intento === 1) throw new ErrorDeImpresion('SIN_PAPEL', 'Sin papel');
      return { bytes: 7 };
    },
  });
  const fallido = await cola.encolar('p', { id: 'venta-2' });
  assert.equal(fallido.ok, false);
  assert.equal(fallido.estado, 'error');
  assert.equal(fallido.codigo, 'SIN_PAPEL');
  assert.equal(fallido.mensaje, 'Sin papel');
  assert.equal(cola.fueEntregado('venta-2'), false);
  const reintento = await cola.encolar('p', { id: 'venta-2' });
  assert.equal(reintento.ok, true);
  assert.equal(reintento.estado, 'enviado');
  assert.equal(intento, 2);
});

test('un fallo no frena a los trabajos que siguen en la misma cola', async () => {
  const cola = crearCola({
    entregar: async (t) => {
      if (t.id === 'malo') throw new Error('boom');
      return { bytes: 1 };
    },
  });
  const [malo, bueno] = await Promise.all([cola.encolar('p', { id: 'malo' }), cola.encolar('p', { id: 'bueno' })]);
  assert.equal(malo.codigo, 'DESCONOCIDO');
  assert.equal(bueno.ok, true);
});

test('las copias repiten el documento y suman los bytes', async () => {
  const copiasVistas = [];
  const cola = crearCola({
    entregar: async (trabajo, copia) => {
      copiasVistas.push(copia);
      return { bytes: 100 };
    },
  });
  const r = await cola.encolar('p', { id: 'v', copias: 3 });
  assert.deepEqual(copiasVistas, [1, 2, 3]);
  assert.equal(r.bytes, 300);
});

test('si falla una copia se corta ahí y se informa', async () => {
  let n = 0;
  const cola = crearCola({
    entregar: async () => {
      n += 1;
      if (n === 2) throw new ErrorDeImpresion('DESCONECTADA', 'Impresora desconectada');
      return { bytes: 10 };
    },
  });
  const r = await cola.encolar('p', { id: 'v', copias: 3 });
  assert.equal(r.ok, false);
  assert.equal(r.codigo, 'DESCONECTADA');
  assert.equal(n, 2);
  assert.equal(r.bytes, 10);
});

test('sólo recuerda los últimos 50 ids entregados', async () => {
  const cola = crearCola({ entregar: async () => ({ bytes: 1 }) });
  for (let i = 0; i < 51; i += 1) await cola.encolar('p', { id: `t${i}` });
  assert.equal(cola.fueEntregado('t0'), false);
  assert.equal(cola.fueEntregado('t1'), true);
  assert.equal(cola.fueEntregado('t50'), true);
});
