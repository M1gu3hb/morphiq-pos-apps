import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapar, formatearFecha, formatearTamano } from '../src/formato.mjs';
import { contraste, paleta } from '../src/colores.mjs';
import { datosDePagina, leerFicha, validarFicha } from '../src/cliente.mjs';
import { qrSvg } from '../src/qr.mjs';

const RAIZ_REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('tamaños como los cuenta Windows', () => {
  assert.equal(formatearTamano(121693856), '116 MB');
  assert.equal(formatearTamano(3203353), '3.1 MB');
  assert.equal(formatearTamano(10433331), '9.9 MB');
  assert.equal(formatearTamano(10433332), '10 MB', 'al redondear a 10 ya no lleva decimal');
  assert.equal(formatearTamano(2195), '2.1 KB');
  assert.equal(formatearTamano(512), '512 bytes');
  assert.equal(formatearTamano(0), null);
  assert.equal(formatearTamano(undefined), null);
});

test('fechas en la hora de México: las 03:20 UTC del 15 todavía son el 14', () => {
  assert.equal(formatearFecha('2026-11-15T03:20:14Z'), '14 nov 2026');
  assert.equal(formatearFecha('2026-01-02T18:00:00Z'), '2 ene 2026');
  assert.equal(formatearFecha('2026-11-15T03:20:14Z', 'UTC'), '15 nov 2026');
  assert.equal(formatearFecha('no es fecha'), null);
  assert.equal(formatearFecha(null), null);
});

test('escapar', () => {
  assert.equal(escapar(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});

test('la paleta de Don Poncho: el texto sobre el acento pasa AA', () => {
  const c = paleta({ fondo: '#161614', texto: '#f4efe6', acento: '#c0392b' });
  assert.equal(c.sobreAcento, '#f4efe6');
  assert.ok(contraste(c.sobreAcento, c.acento) >= 4.5, `contraste ${contraste(c.sobreAcento, c.acento)}`);
  assert.ok(contraste(c.tenue, c.fondo) >= 4.5);
  assert.ok(contraste(c.tenue, c.superficie) >= 4.5);
  assert.ok(contraste(c.tenueMas, c.fondo) >= 4.5);
  assert.ok(contraste(c.texto, c.avisoFondo) >= 4.5);
});

test('un acento claro lleva texto oscuro encima', () => {
  assert.equal(paleta({ fondo: '#111111', texto: '#fafafa', acento: '#f6d55c' }).sobreAcento, '#111111');
});

test('la ficha real de Don Poncho es válida y da los datos de la página', () => {
  const ficha = leerFicha(RAIZ_REPO, 'don-poncho');
  const datos = datosDePagina(ficha);
  assert.equal(datos.nombre, 'POS Don Poncho');
  assert.equal(datos.prefijo, 'don-poncho-v');
  assert.equal(datos.canal, 'canal-don-poncho');
  assert.equal(datos.repo, 'M1gu3hb/morphiq-pos-apps');
  assert.equal(datos.zonaHoraria, 'America/Mexico_City');
  assert.equal(datos.appId, undefined, 'no lleva lo que la página no usa');
});

test('fichas inválidas y ids peligrosos', () => {
  assert.throws(() => leerFicha(RAIZ_REPO, '../secreto'), /no es un id válido/);
  assert.throws(() => leerFicha(RAIZ_REPO, 'no-existe'), /No existe/);
  const errores = validarFicha({ id: 'x', nombre: 'X', firma: 'f', colores: { fondo: 'rojo' }, logo: '../a.png', url: 'http://x' });
  assert.ok(errores.some((e) => e.includes('colores.fondo')));
  assert.ok(errores.some((e) => e.includes('«logo»')));
  assert.ok(errores.some((e) => e.includes('https')));
  assert.ok(errores.some((e) => e.includes('releases.repo')));
});

test('QR: SVG cuadrado, nítido (lado múltiplo de los módulos) y con título', () => {
  const svg = qrSvg('https://don-poncho-apps.vercel.app/android', { oscuro: '#161614', claro: '#f4efe6', titulo: 'QR <x>' });
  const [, total] = /viewBox="0 0 (\d+) \1"/.exec(svg);
  const [, lado] = /width="(\d+)" height="\1"/.exec(svg);
  assert.equal(Number(lado) % Number(total), 0);
  assert.match(svg, /<title id="qr-titulo">QR &lt;x&gt;<\/title>/);
  assert.match(svg, /<path fill="#161614" d="M\d/);
  assert.ok(svg.length < 12000, `pesa ${svg.length}`);
});
