import test from 'node:test';
import assert from 'node:assert/strict';
import { crearApp } from '../src/app.mjs';
import { ajustesDePrueba } from '../src/montar.mjs';
import { UA } from './agentes.mjs';

const cliente = {
  id: 'don-poncho',
  nombre: 'POS Don Poncho',
  nombreCorto: 'Don Poncho',
  url: 'https://pos-don-poncho.vercel.app/n/don-poncho/login-pos',
  colores: { fondo: '#161614', texto: '#f4efe6', acento: '#c0392b' },
  firma: 'Hecho por MORPHIQ',
  repo: 'M1gu3hb/morphiq-pos-apps',
  canal: 'canal-don-poncho',
  prefijo: 'don-poncho-v',
  zonaHoraria: 'America/Mexico_City',
};
const estaticos = { logo: { ruta: '/marca/logo-1.png', ancho: 180, alto: 135 }, icono: { ruta: '/marca/icono-1.png' } };
const DESCARGA = 'https://github.com/M1gu3hb/morphiq-pos-apps/releases/download/don-poncho-v1.0.0';
const VERSIONES = {
  windows: {
    version: '1.0.0',
    archivo: 'POS-Don-Poncho-Setup-1.0.0.exe',
    url: `${DESCARGA}/POS-Don-Poncho-Setup-1.0.0.exe`,
    tamano: 121693856,
    fecha: '2026-11-15T03:20:14.000Z',
    sha256: '799bb6fbb7141f915f8342194256195071a4aff19152d774cf6d98c29e30695e',
  },
  android: {
    version: '1.0.0',
    archivo: 'POS-Don-Poncho-1.0.0.apk',
    url: `${DESCARGA}/POS-Don-Poncho-1.0.0.apk`,
    tamano: 3203353,
    fecha: '2026-11-15T03:20:01.000Z',
    sha256: '941df117406073d4c39bd1a010cd361a834ba80169ab5a6ea8afaf5ce4a616b2',
  },
};

function app(versiones = VERSIONES) {
  return crearApp({ cliente, estaticos, fuente: { obtener: async () => versiones }, avisar: () => {} });
}

const pedir = (responder, ruta, cabeceras = {}, metodo = 'GET') =>
  responder({ metodo, ruta, cabeceras: { host: 'don-poncho-apps.vercel.app', 'x-forwarded-proto': 'https', ...cabeceras } });

test('/windows y /android: 302 al archivo del release, sin caché', async () => {
  const responder = app();
  const win = await pedir(responder, '/windows');
  assert.equal(win.estado, 302);
  assert.equal(win.cabeceras.Location, VERSIONES.windows.url);
  assert.equal(win.cabeceras['Cache-Control'], 'no-store');
  const and = await pedir(responder, '/android');
  assert.equal(and.estado, 302);
  assert.equal(and.cabeceras.Location, VERSIONES.android.url);
});

test('las rutas toleran mayúsculas y la diagonal final; HEAD también', async () => {
  const responder = app();
  assert.equal((await pedir(responder, '/Windows/')).cabeceras.Location, VERSIONES.windows.url);
  assert.equal((await pedir(responder, '/ANDROID')).estado, 302);
  assert.equal((await pedir(responder, '/windows', {}, 'HEAD')).estado, 302);
});

test('sin versión de una plataforma: 503 con salida, no en blanco', async () => {
  const r = await pedir(app({ windows: null, android: VERSIONES.android }), '/windows');
  assert.equal(r.estado, 503);
  assert.match(r.cuerpo, /Todavía no hay versión de Windows/);
  assert.match(r.cuerpo, /href="\/"/);
});

test('404 amable, 405 para otros métodos, robots.txt cierra todo', async () => {
  const responder = app();
  const nada = await pedir(responder, '/no-existe');
  assert.equal(nada.estado, 404);
  assert.match(nada.cuerpo, /Ir a las descargas/);
  assert.equal((await pedir(responder, '/', {}, 'POST')).estado, 405);
  const robots = await pedir(responder, '/robots.txt');
  assert.equal(robots.cuerpo, 'User-agent: *\nDisallow: /\n');
});

test('la página: noindex en meta y cabecera, CSP sin scripts, pide la pista de versión de Windows', async () => {
  const r = await pedir(app(), '/', { 'user-agent': UA.windows10 });
  assert.equal(r.estado, 200);
  assert.match(r.cuerpo, /<meta name="robots" content="noindex, nofollow">/);
  assert.equal(r.cabeceras['X-Robots-Tag'], 'noindex, nofollow');
  assert.match(r.cabeceras['Content-Security-Policy'], /default-src 'none'; style-src 'sha256-[A-Za-z0-9+/=]+'/);
  assert.doesNotMatch(r.cabeceras['Content-Security-Policy'], /script-src/);
  assert.doesNotMatch(r.cuerpo, /<script/i);
  assert.equal(r.cabeceras['Critical-CH'], 'Sec-CH-UA-Platform-Version');
  assert.match(r.cabeceras.Vary, /User-Agent/);
});

test('la página: botones con versión, fecha en hora de México y tamaño; huellas; versiones anteriores', async () => {
  const { cuerpo } = await pedir(app(), '/', { 'user-agent': UA.mac });
  assert.match(cuerpo, /href="\/windows"/);
  assert.match(cuerpo, /Descargar para Windows \(\.exe\)/);
  assert.match(cuerpo, /Versión 1\.0\.0, 14 nov 2026, 116 MB/);
  assert.match(cuerpo, /Descargar para Android \(\.apk\)/);
  assert.match(cuerpo, /Versión 1\.0\.0, 14 nov 2026, 3\.1 MB/);
  assert.match(cuerpo, /799bb6fbb7141f915f8342194256195071a4aff19152d774cf6d98c29e30695e/);
  assert.match(cuerpo, /941df117406073d4c39bd1a010cd361a834ba80169ab5a6ea8afaf5ce4a616b2/);
  assert.match(cuerpo, /href="https:\/\/github\.com\/M1gu3hb\/morphiq-pos-apps\/releases">Versiones anteriores/);
  assert.match(cuerpo, /Hecho por MORPHIQ/);
  assert.doesNotMatch(cuerpo, /data-este/, 'en una Mac no resalta nada');
  assert.doesNotMatch(cuerpo, /[—–]/, 'sin rayas largas');
});

test('el QR apunta a /android del host por el que llegó, y es SVG en línea', async () => {
  const { cuerpo } = await pedir(app(), '/', { 'user-agent': UA.windows10 });
  assert.match(cuerpo, /<svg class="qr-codigo"[^>]*viewBox="0 0 \d+ \d+"/);
  assert.match(cuerpo, /Código QR para bajar la app de Android: https:\/\/don-poncho-apps\.vercel\.app\/android/);
  assert.match(cuerpo, /don-poncho-apps\.vercel\.app\/android<\/p>/);
  const otroHost = await pedir(app(), '/', { 'x-forwarded-host': 'evil"><script>' });
  assert.doesNotMatch(otroHost.cuerpo, /<svg class="qr-codigo"/, 'un host raro no pinta QR');
  assert.doesNotMatch(otroHost.cuerpo, /<script>/);
});

const CASOS = [
  ['Windows 10', { 'user-agent': UA.windows10 }, 'windows', true, null],
  ['Windows 7', { 'user-agent': UA.windows7 }, 'windows', false, 'windows-viejo'],
  ['Windows 7 con Chrome nuevo (pista)', { 'user-agent': UA.windows10, 'sec-ch-ua-platform': '"Windows"', 'sec-ch-ua-platform-version': '"0.1.0"' }, 'windows', false, 'windows-viejo'],
  ['Android 12', { 'user-agent': UA.android12 }, 'android', true, null],
  ['Android 5', { 'user-agent': UA.android5 }, 'android', false, 'android-viejo'],
  ['iPhone', { 'user-agent': UA.iphone }, null, null, 'iphone'],
];

for (const [nombre, cabeceras, este, compatible, aviso] of CASOS) {
  test(`resaltado y aviso: ${nombre}`, async () => {
    const { cuerpo } = await pedir(app(), '/', cabeceras);
    const resaltados = [...cuerpo.matchAll(/data-plataforma="(\w+)" data-este="si"/g)].map((m) => m[1]);
    assert.deepEqual(resaltados, este ? [este] : []);
    if (este) {
      const clase = new RegExp(`class="([^"]+)" href="/${este}"`).exec(cuerpo)[1];
      assert.equal(clase.includes('boton-principal'), compatible, `relleno sólo si es compatible: ${clase}`);
    }
    const avisos = [...cuerpo.matchAll(/data-aviso="([\w-]+)"/g)].map((m) => m[1]);
    assert.deepEqual(avisos, aviso ? [aviso] : []);
  });
}

test('los textos de los avisos', async () => {
  const win7 = (await pedir(app(), '/', { 'user-agent': UA.windows7 })).cuerpo;
  assert.match(win7, /Este aparato tiene Windows 7\. Esta app necesita Windows 10 o más nuevo\./);
  assert.match(win7, /No corre en este Windows/);
  const and5 = (await pedir(app(), '/', { 'user-agent': UA.android5 })).cuerpo;
  assert.match(and5, /Este aparato tiene Android 5\.1\.1\. Necesita Android 6 o más nuevo\./);
  const iphone = (await pedir(app(), '/', { 'user-agent': UA.iphone })).cuerpo;
  assert.match(iphone, /En iPhone no se instala: abre el POS en Safari y usa “Agregar a inicio”\./);
  assert.match(iphone, /<a href="https:\/\/pos-don-poncho\.vercel\.app\/n\/don-poncho\/login-pos">Abrir el POS<\/a>/);
  const android = (await pedir(app(), '/', { 'user-agent': UA.android12 })).cuerpo;
  assert.ok(android.indexOf('href="/android"') < android.indexOf('href="/windows"'), 'en Android, Android primero');
});

test('sin ninguna versión: la página sigue, con la salida a los Releases', async () => {
  const { estado, cuerpo } = await pedir(app(null), '/');
  assert.equal(estado, 200);
  assert.match(cuerpo, /Ahora no pudimos leer las versiones/);
  assert.match(cuerpo, /Todavía no hay versión para descargar/);
});

test('si la fuente revienta: 500 amable con salida', async () => {
  const responder = crearApp({ cliente, estaticos, fuente: { obtener: async () => { throw new Error('x'); } }, avisar: () => {} });
  const r = await pedir(responder, '/');
  assert.equal(r.estado, 500);
  assert.match(r.cuerpo, /Ir a las descargas/);
});

test('los ajustes de prueba: sólo fuera de Vercel y sólo hacia localhost', () => {
  assert.deepEqual(ajustesDePrueba({ DESCARGAS_GITHUB: 'http://127.0.0.1:3211', DESCARGAS_VIGENCIA_MS: '500' }), {
    github: 'http://127.0.0.1:3211',
    vigenciaMs: 500,
    reintentoMs: 500,
  });
  assert.deepEqual(ajustesDePrueba({ VERCEL: '1', DESCARGAS_GITHUB: 'http://127.0.0.1:3211' }), {});
  assert.deepEqual(ajustesDePrueba({ DESCARGAS_GITHUB: 'https://evil.example' }), {});
});
