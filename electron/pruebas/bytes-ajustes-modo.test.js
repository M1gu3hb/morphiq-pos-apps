'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { paginaDePrueba, bytesDeCajon, renglonDeReimpresion, aAscii } = require('../principal/impresion/bytes');
const { decidirModoLigero } = require('../principal/modo-ligero');
const { mezclarAjustes, crearAlmacenDeAjustes, POR_OMISION } = require('../principal/ajustes');
const { traducirError, ErrorDeImpresion, ErrorDeUso } = require('../principal/impresion/errores');

const FECHA = new Date(2026, 10, 14, 9, 5);

test('la página de prueba son bytes ESC/POS mínimos, sólo ASCII', () => {
  const bytes = paginaDePrueba({ cliente: 'POS Don Poncho', conexion: 'red 192.168.1.50:9100', fecha: FECHA });
  assert.deepEqual([...bytes.subarray(0, 2)], [0x1b, 0x40]);
  assert.deepEqual([...bytes.subarray(-4)], [0x1d, 0x56, 0x42, 0x00]);
  const cuerpo = bytes.subarray(2, bytes.length - 4);
  assert.ok(cuerpo.every((b) => b === 0x0a || (b >= 0x20 && b <= 0x7e)), 'el cuerpo debe ser ASCII');
  const texto = cuerpo.toString('ascii');
  assert.match(texto, /^POS Don Poncho\n14\/11\/2026 09:05\nPagina de prueba\nConexion: red 192\.168\.1\.50:9100\n\n\n\n\n$/);
  assert.equal(texto.endsWith('\n\n\n\n'), true, 'avance de 4 líneas');
});

test('la página de prueba quita acentos y símbolos del nombre', () => {
  const bytes = paginaDePrueba({ cliente: 'Cafetería «Ñandú» ☕', conexion: 'spooler', fecha: FECHA });
  assert.ok(bytes.subarray(2, bytes.length - 4).every((b) => b === 0x0a || (b >= 0x20 && b <= 0x7e)));
  assert.equal(aAscii('Cafetería Ñ'), 'Cafeteria N');
});

test('el cajón: el base64 dado, y si no, ESC p 0 25 250', () => {
  assert.deepEqual([...bytesDeCajon(undefined)], [0x1b, 0x70, 0x00, 0x19, 0xfa]);
  assert.deepEqual([...bytesDeCajon('')], [0x1b, 0x70, 0x00, 0x19, 0xfa]);
  assert.deepEqual([...bytesDeCajon(Buffer.from([0x1b, 0x70, 0x01, 0x32, 0x32]).toString('base64'))], [0x1b, 0x70, 0x01, 0x32, 0x32]);
});

test('el renglón de reimpresión es ASCII con fecha y hora', () => {
  const bytes = renglonDeReimpresion(FECHA);
  assert.deepEqual([...bytes.subarray(0, 2)], [0x1b, 0x40]);
  assert.equal(bytes.subarray(2).toString('ascii'), '*** REIMPRESION 14/11/2026 09:05 ***\n');
});

test('modo ligero: automático por RAM y núcleos, o manual', () => {
  const base = { ramTotalMb: 16384, nucleos: 8 };
  assert.deepEqual(decidirModoLigero({ ...base, manual: null }).activo, false);
  assert.equal(decidirModoLigero({ ...base, ramTotalMb: 4096, manual: null }).activo, true);
  assert.equal(decidirModoLigero({ ...base, ramTotalMb: 4097, manual: null }).activo, false);
  assert.equal(decidirModoLigero({ ...base, nucleos: 2, manual: undefined }).activo, true);
  assert.equal(decidirModoLigero({ ...base, nucleos: 3, manual: null }).activo, false);
  const encendido = decidirModoLigero({ ...base, manual: true });
  assert.deepEqual([encendido.activo, encendido.origen], [true, 'manual']);
  const apagado = decidirModoLigero({ ramTotalMb: 1024, nucleos: 1, manual: false });
  assert.deepEqual([apagado.activo, apagado.origen], [false, 'manual']);
  assert.equal(decidirModoLigero({ ...base, manual: null }).origen, 'auto');
});

test('mezcla superficial de ajustes: el parche pisa, lo demás queda, version siempre 1', () => {
  const actual = { ...POR_OMISION, perfil: { nombre: 'A' }, extra: { a: 1 } };
  const nuevo = mezclarAjustes(actual, { extra: { b: 2 }, pantallaCompleta: false, version: 9 });
  assert.deepEqual(nuevo.extra, { b: 2 });
  assert.equal(nuevo.pantallaCompleta, false);
  assert.deepEqual(nuevo.perfil, { nombre: 'A' });
  assert.equal(nuevo.version, 1);
  assert.deepEqual(actual.extra, { a: 1 }, 'no muta el original');
  assert.throws(() => mezclarAjustes(actual, null), ErrorDeUso);
  assert.throws(() => mezclarAjustes(actual, [1]), ErrorDeUso);
});

test('el almacén guarda atómico, relee y tolera un archivo dañado sin perderlo', () => {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'morphiq-ajustes-'));
  try {
    const ruta = path.join(carpeta, 'ajustes.json');
    const a = crearAlmacenDeAjustes(ruta);
    assert.equal(a.leer().pantallaCompleta, true);
    a.guardar({ modoLigero: true, x: 1 });
    const b = crearAlmacenDeAjustes(ruta);
    assert.equal(b.leer().modoLigero, true);
    assert.equal(b.leer().x, 1);
    assert.deepEqual(fs.readdirSync(carpeta), ['ajustes.json'], 'sin temporales sobrantes');

    fs.writeFileSync(ruta, '{ esto no es json');
    const c = crearAlmacenDeAjustes(ruta);
    assert.equal(c.avisos.length > 0, true, 'el daño se informa');
    assert.equal(c.leer().modoLigero, null);
    assert.equal(fs.existsSync(`${ruta}.danado`), true, 'el archivo dañado se conserva');
  } finally {
    fs.rmSync(carpeta, { recursive: true, force: true });
  }
});

test('traductor de errores: códigos del contrato y mensajes cortos en español', () => {
  assert.deepEqual(traducirError(new ErrorDeImpresion('SIN_PAPEL', 'Sin papel')), { codigo: 'SIN_PAPEL', mensaje: 'Sin papel' });
  assert.equal(traducirError(new ErrorDeImpresion('INVENTADO', 'x')).codigo, 'DESCONOCIDO');
  for (const code of ['ECONNREFUSED', 'EHOSTUNREACH', 'ENOTFOUND', 'ECONNRESET']) {
    assert.deepEqual(traducirError(Object.assign(new Error('x'), { code })), { codigo: 'DESCONECTADA', mensaje: 'Impresora desconectada' });
  }
  assert.equal(traducirError(Object.assign(new Error('x'), { code: 'ETIMEDOUT' })).codigo, 'TIEMPO');
  assert.equal(traducirError(Object.assign(new Error('x'), { code: 'EACCES' })).codigo, 'SIN_PERMISO');
  const raro = traducirError(new Error('algo raro'));
  assert.equal(raro.codigo, 'DESCONOCIDO');
  assert.match(raro.mensaje, /algo raro/);
  assert.equal(traducirError('texto suelto').codigo, 'DESCONOCIDO');
});
