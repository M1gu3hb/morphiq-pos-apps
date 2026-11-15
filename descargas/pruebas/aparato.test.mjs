import test from 'node:test';
import assert from 'node:assert/strict';
import { detectarAparato } from '../src/aparato.mjs';
import { UA } from './agentes.mjs';

test('Windows 10 u 11: compatible', () => {
  assert.deepEqual(detectarAparato({ ua: UA.windows10 }), { tipo: 'windows', compatible: true });
});

test('Windows 7 y 8.1 por el user agent: no compatibles y con su nombre', () => {
  assert.deepEqual(detectarAparato({ ua: UA.windows7 }), { tipo: 'windows', compatible: false, nombre: 'Windows 7' });
  assert.deepEqual(detectarAparato({ ua: UA.windows81 }), { tipo: 'windows', compatible: false, nombre: 'Windows 8.1' });
  assert.equal(detectarAparato({ ua: UA.windows7.replace('6.1', '6.2') }).nombre, 'Windows 8');
});

test('Chrome dice «NT 10.0» en Windows 7: manda la pista Sec-CH-UA-Platform-Version', () => {
  const win7 = detectarAparato({ ua: UA.windows10, plataforma: '"Windows"', versionPlataforma: '"0.1.0"' });
  assert.deepEqual(win7, { tipo: 'windows', compatible: false, nombre: 'Windows 7' });
  const win11 = detectarAparato({ ua: UA.windows10, plataforma: '"Windows"', versionPlataforma: '"15.0.0"' });
  assert.deepEqual(win11, { tipo: 'windows', compatible: true });
  const win10 = detectarAparato({ ua: UA.windows10, plataforma: '"Windows"', versionPlataforma: '"10.0.0"' });
  assert.equal(win10.compatible, true);
});

test('si el user agent dice Windows 7, la pista no lo «rejuvenece» (así emula Playwright en una PC con Windows 10)', () => {
  const r = detectarAparato({ ua: UA.windows7, plataforma: '"Windows"', versionPlataforma: '"10.0.0"' });
  assert.deepEqual(r, { tipo: 'windows', compatible: false, nombre: 'Windows 7' });
});

test('Android 12 compatible; Android 5.1.1 no, con su versión', () => {
  assert.deepEqual(detectarAparato({ ua: UA.android12 }), { tipo: 'android', compatible: true, nombre: 'Android 12' });
  assert.deepEqual(detectarAparato({ ua: UA.android5 }), { tipo: 'android', compatible: false, nombre: 'Android 5.1.1' });
  assert.equal(detectarAparato({ ua: UA.androidReducido }).compatible, true);
});

test('Android: la pista de versión manda sobre el user agent reducido', () => {
  const viejo = detectarAparato({ ua: UA.androidReducido, plataforma: '"Android"', versionPlataforma: '"5.0.0"' });
  assert.deepEqual(viejo, { tipo: 'android', compatible: false, nombre: 'Android 5' });
  const seis = detectarAparato({ ua: UA.androidReducido, plataforma: '"Android"', versionPlataforma: '"6.0.1"' });
  assert.equal(seis.compatible, true);
});

test('iPhone e iPad: no se instala', () => {
  assert.deepEqual(detectarAparato({ ua: UA.iphone }), { tipo: 'iphone', compatible: false });
  assert.equal(detectarAparato({ ua: UA.ipad }).tipo, 'iphone');
});

test('Mac, vacío o basura: otro, sin aviso', () => {
  assert.deepEqual(detectarAparato({ ua: UA.mac }), { tipo: 'otro', compatible: true });
  assert.deepEqual(detectarAparato({ ua: '' }), { tipo: 'otro', compatible: true });
  assert.deepEqual(detectarAparato({ ua: undefined }), { tipo: 'otro', compatible: true });
  assert.deepEqual(detectarAparato(), { tipo: 'otro', compatible: true });
});
