'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { evaluarDireccion, exigirDireccionPrivada } = require('../principal/impresion/direccion');

const permitida = (texto, literal = texto) => {
  const r = evaluarDireccion(texto);
  assert.equal(r.veredicto, 'PERMITIDA', `«${texto}» debería permitirse`);
  assert.equal(r.literal, literal);
  // Lo permitido es un literal que Node reconoce solo: al conectar no se consulta ningún DNS.
  assert.notEqual(net.isIP(r.literal), 0, `«${r.literal}» debe ser un literal IP para net`);
};
const rechazada = (texto, esperado) => {
  const r = evaluarDireccion(texto);
  assert.equal(r.veredicto, esperado, `«${texto}»`);
  assert.equal(r.literal, undefined, `«${texto}» no debe devolver literal`);
};

test('direccion: IPv4 privadas, de enlace local y loopback', () => {
  for (const d of ['10.0.0.1', '10.255.255.254', '172.16.0.1', '172.31.255.254', '192.168.0.1', '192.168.1.50', '169.254.1.1', '127.0.0.1', '127.255.255.254']) permitida(d);
});

test('direccion: IPv4 públicas o reservadas fuera de la lista son PUBLICA (incluida la de documentación 192.0.2.x)', () => {
  const publicas = ['8.8.8.8', '1.1.1.1', '192.0.2.10', '172.15.255.255', '172.32.0.1', '192.167.1.1', '192.169.1.1', '169.253.1.1', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '11.0.0.1', '9.255.255.255'];
  for (const d of publicas) rechazada(d, 'PUBLICA');
});

test('direccion: un nombre de host nunca se acepta (no se consulta DNS)', () => {
  for (const d of ['impresora.local', 'localhost', 'impresora-cocina', 'ticket.example.com', '192.168.1.1.evil.com', 'evil.com/192.168.1.1', '10.0.0.1.nip.io']) rechazada(d, 'NO_ES_LITERAL');
});

test('direccion: formas ambiguas de escribir una IPv4 (octal, hex, entero, cortas, ceros)', () => {
  const ambiguas = ['010.0.0.1', '0x7f.1', '0x7f.0.0.1', '2130706433', '127.1', '127.0.1', '192.168.001.001', '0177.0.0.1', '1.1.1.256', '1.1.1', '1.1.1.1.1', '+1.1.1.1', '-1.0.0.1', '1..1.1', '.1.1.1', '1.1.1.', '٠.٠.٠.١', '1e2.0.0.1'];
  for (const d of ambiguas) rechazada(d, 'NO_ES_LITERAL');
});

test('direccion: con puerto, esquema, máscara o texto pegado no es una dirección', () => {
  for (const d of ['192.168.1.1:9100', '192.168.1.1 y otra', 'http://192.168.1.1', '192.168.1.1/24', '192.168.1.1\n10.0.0.1', '192.168.1.1\u0000']) rechazada(d, 'NO_ES_LITERAL');
});

test('direccion: espacios alrededor se ignoran y los corchetes se quitan', () => {
  permitida('  192.168.1.5 ', '192.168.1.5');
  permitida('[::1]', '::1');
  permitida('[fd00::5]', 'fd00::5');
  permitida('[127.0.0.1]', '127.0.0.1');
});

test('direccion: vacío o ni texto es VACIA', () => {
  for (const d of [undefined, null, '', '   ', 5, {}]) rechazada(d, 'VACIA');
});

test('direccion: IPv6 loopback, ULA y enlace local', () => {
  for (const d of ['::1', '0:0:0:0:0:0:0:1', 'fd00::1', 'fc00::1', 'fdff:ffff::1', 'fe80::1', 'fe80::1234:5678:9abc:def0', 'febf::1', 'FE80::A']) permitida(d);
});

test('direccion: la zona sólo vale en enlace local y con caracteres sanos (igual que en Android)', () => {
  permitida('fe80::1%wlan0');
  permitida('[fe80::1%eth0]', 'fe80::1%eth0');
  permitida('fe80::1%x');
  permitida('fe80::1%12');
  const raras = ['fd00::1%wlan0', '2001:db8::1%wlan0', 'fe80::1%', 'fe80::1%wl an0', 'fe80::1%a%b', 'fe80::1%wlan0/../x', `fe80::1%${'z'.repeat(33)}`, 'fe80::1%é'];
  for (const d of raras) rechazada(d, 'NO_ES_LITERAL');
});

test('direccion: IPv6 públicas, no especificada y sitio-local viejo son PUBLICA', () => {
  for (const d of ['2001:db8::1', '2606:4700:4700::1111', '::', 'fec0::1', 'fe00::1', 'ff02::1', '64:ff9b::808:808', '::8.8.8.8', '1::']) rechazada(d, 'PUBLICA');
});

test('direccion: una IPv4 mapeada en IPv6 se juzga por la IPv4 que lleva dentro', () => {
  rechazada('::ffff:8.8.8.8', 'PUBLICA');
  rechazada('::ffff:808:808', 'PUBLICA');
  rechazada('0:0:0:0:0:ffff:8.8.8.8', 'PUBLICA');
  rechazada('[::ffff:8.8.8.8]', 'PUBLICA');
  permitida('::ffff:192.168.1.5');
  permitida('::ffff:c0a8:0105');
  permitida('::ffff:10.0.0.1');
  permitida('::ffff:127.0.0.1');
});

test('direccion: un IPv6 mal escrito no es una dirección', () => {
  const malas = ['1::2::3', ':::1', '::1::', ':1', '1:', '12345::1', 'g::1', '1:2:3:4:5:6:7', '1:2:3:4:5:6:7:8:9', '::1.2.3', '::ffff:1.2.3.256', '::ffff:010.0.0.1', 'fe80::1::2'];
  for (const d of malas) rechazada(d, 'NO_ES_LITERAL');
});

test('direccion: un texto larguísimo se rechaza sin analizarlo', () => {
  rechazada(`${'1'.repeat(500)}.1.1.1`, 'NO_ES_LITERAL');
  rechazada('a:'.repeat(100), 'NO_ES_LITERAL');
});

test('direccion: exigir devuelve el literal o NO_SOPORTADO con el motivo en español', () => {
  assert.equal(exigirDireccionPrivada(' 10.1.2.3 '), '10.1.2.3');
  assert.throws(() => exigirDireccionPrivada('8.8.8.8'), (e) => e.codigo === 'NO_SOPORTADO' && /red local/.test(e.message));
  assert.throws(() => exigirDireccionPrivada('impresora.local'), (e) => e.codigo === 'NO_SOPORTADO' && /dirección IP completa/.test(e.message));
  assert.throws(() => exigirDireccionPrivada(''), (e) => e.codigo === 'NO_SOPORTADO' && /Falta la dirección/.test(e.message));
});
