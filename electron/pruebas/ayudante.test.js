'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const fs = require('node:fs');
const path = require('node:path');
const { crearEjecutorDeAyudante } = require('../principal/impresion/ayudante');

/** Un proceso falso: escribe `lineas` en stdout y se cierra con `codigo`. */
function procesoFalso({ lineas = [], codigo = 0, errorAlArrancar = null, colgado = false }) {
  const hijo = new EventEmitter();
  hijo.stdout = new PassThrough();
  hijo.stderr = new PassThrough();
  hijo.kill = () => setImmediate(() => hijo.emit('close', null));
  setImmediate(() => {
    if (errorAlArrancar) return hijo.emit('error', errorAlArrancar);
    if (colgado) return undefined;
    lineas.forEach((l) => hijo.stdout.write(`${l}\n`));
    hijo.stdout.end();
    return hijo.emit('close', codigo);
  });
  return hijo;
}

const rutas = { rutaExe: 'C:\\app\\ayudante.exe', rutaPs1: 'C:\\app\\ayudante.ps1' };

test('el ayudante: usa el .exe, pasa los argumentos sin shell y entrega el avance', async () => {
  const llamadas = [];
  const spawn = (programa, argumentos, opciones) => {
    llamadas.push({ programa, argumentos, opciones });
    return procesoFalso({ lineas: ['{"enviados":2,"total":4}', '{"enviados":4,"total":4}', '{"ok":true,"bytes":4}'] });
  };
  const avances = [];
  const { ejecutar } = crearEjecutorDeAyudante({ ...rutas, spawn });
  const r = await ejecutar(['crudo', 'Impresora; calc.exe & "x"', 'C:\\t\\a.bin'], { alAvance: (e, t) => avances.push([e, t]) });
  assert.equal(r.ok, true);
  assert.deepEqual(avances, [[2, 4], [4, 4]]);
  assert.equal(llamadas[0].programa, rutas.rutaExe);
  assert.deepEqual(llamadas[0].argumentos, ['crudo', 'Impresora; calc.exe & "x"', 'C:\\t\\a.bin']);
  assert.notEqual(llamadas[0].opciones.shell, true, 'sin shell');
  assert.equal(llamadas[0].opciones.windowsHide, true);
});

test('el ayudante: un fallo del .exe (código 1 con JSON) se traduce y NO cae al respaldo', async () => {
  const programas = [];
  const spawn = (programa) => {
    programas.push(programa);
    return procesoFalso({ lineas: ['{"ok":false,"codigo":"SIN_PAPEL","mensaje":"Sin papel","win32":28}'], codigo: 1 });
  };
  const { ejecutar } = crearEjecutorDeAyudante({ ...rutas, spawn });
  await assert.rejects(ejecutar(['crudo', 'x', 'y']), (e) => e.codigo === 'SIN_PAPEL' && e.message === 'Sin papel');
  assert.deepEqual(programas, [rutas.rutaExe]);
});

test('el ayudante: si el .exe no arranca, usa el respaldo de PowerShell y lo recuerda', async () => {
  const llamadas = [];
  const spawn = (programa, argumentos) => {
    llamadas.push({ programa, argumentos });
    if (programa === rutas.rutaExe) return procesoFalso({ errorAlArrancar: Object.assign(new Error('spawn UNKNOWN'), { code: 'UNKNOWN' }) });
    return procesoFalso({ lineas: ['{"ok":true,"impresoras":[]}'] });
  };
  const ayudante = crearEjecutorDeAyudante({ ...rutas, spawn, powershell: 'ps.exe' });
  assert.equal((await ayudante.ejecutar(['listar'])).ok, true);
  assert.equal(ayudante.usandoRespaldo(), true);
  assert.deepEqual(llamadas[1].argumentos, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', rutas.rutaPs1, 'listar']);
  await ayudante.ejecutar(['listar']);
  assert.deepEqual(llamadas.map((l) => l.programa), [rutas.rutaExe, 'ps.exe', 'ps.exe'], 'ya no vuelve a intentar el .exe');
});

test('el ayudante: si el .exe sale con un código raro (falta .NET) también usa el respaldo', async () => {
  const spawn = (programa) =>
    programa === rutas.rutaExe ? procesoFalso({ codigo: 3221225781 }) : procesoFalso({ lineas: ['{"ok":true}'] });
  const ayudante = crearEjecutorDeAyudante({ ...rutas, spawn });
  assert.equal((await ayudante.ejecutar(['listar'])).ok, true);
  assert.equal(ayudante.usandoRespaldo(), true);
});

test('el ayudante: si nadie contesta en el plazo, TIEMPO', async () => {
  const spawn = () => procesoFalso({ colgado: true });
  const { ejecutar } = crearEjecutorDeAyudante({ ...rutas, spawn });
  await assert.rejects(ejecutar(['crudo', 'x', 'y'], { esperaMs: 100 }), (e) => e.codigo === 'TIEMPO' && /No respondió en 1 s/.test(e.message));
});

test('el ayudante: sin .exe ni respaldo que sirva, dice DESCONOCIDO con el motivo', async () => {
  const spawn = () => procesoFalso({ errorAlArrancar: new Error('spawn ENOENT') });
  const { ejecutar } = crearEjecutorDeAyudante({ ...rutas, spawn });
  await assert.rejects(ejecutar(['listar']), (e) => e.codigo === 'DESCONOCIDO' && /ENOENT/.test(e.message));
});

const exeReal = path.join(__dirname, '..', 'compilado', 'ayudante.exe');
const hayExe = process.platform === 'win32' && fs.existsSync(exeReal);

test('ayudante.exe real: listar devuelve impresoras y una inexistente falla como DESCONECTADA (no imprime nada)', { skip: !hayExe }, async () => {
  const { ejecutar } = crearEjecutorDeAyudante({ rutaExe: exeReal, rutaPs1: path.join(__dirname, '..', 'ayudante', 'ayudante.ps1') });
  const listado = await ejecutar(['listar']);
  assert.equal(listado.ok, true);
  assert.ok(Array.isArray(listado.impresoras));
  for (const p of listado.impresoras) assert.equal(typeof p.nombre, 'string');
  await assert.rejects(ejecutar(['estado', 'Impresora que no existe 987']), (e) => e.codigo === 'DESCONECTADA');
  await assert.rejects(ejecutar(['crudo', 'Impresora que no existe 987', __filename]), (e) => e.codigo === 'DESCONECTADA');
  await assert.rejects(ejecutar(['serie', 'COM99', '9600', __filename]), (e) => e.codigo === 'DESCONECTADA');
});
