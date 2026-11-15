import test from 'node:test';
import assert from 'node:assert/strict';
import { compararVersiones, crearFuente, leerLatestYml, leerSumas, REINTENTO_MS, VIGENCIA_MS } from '../src/releases.mjs';

const REPO = 'M1gu3hb/morphiq-pos-apps';
const GH = 'https://github.com';
const API = 'https://api.github.com';
const DESCARGA = `${GH}/${REPO}/releases/download`;
const HUELLA_EXE = '799bb6fbb7141f915f8342194256195071a4aff19152d774cf6d98c29e30695e';
const HUELLA_APK = '941df117406073d4c39bd1a010cd361a834ba80169ab5a6ea8afaf5ce4a616b2';

/** El canal y los releases como están hoy en GitHub (la 1.0.0). */
function github(version = '1.0.0') {
  const exe = `POS-Don-Poncho-Setup-${version}.exe`;
  const apk = `POS-Don-Poncho-${version}.apk`;
  return {
    [`${DESCARGA}/canal-don-poncho/latest.yml`]: {
      cuerpo: `version: ${version}\nfiles:\n  - url: ${exe}\n    sha512: x==\n    size: 121693856\npath: ${exe}\nsha512: x==\nreleaseDate: '2026-11-15T03:16:18.973Z'\n`,
    },
    [`${DESCARGA}/canal-don-poncho/android.json`]: {
      cuerpo: JSON.stringify({ versionCode: 2, version, apk, sha256: HUELLA_APK, notas: 'x' }),
    },
    [`${DESCARGA}/don-poncho-v${version}/${exe}`]: {
      cabeceras: { 'content-length': '121693856', 'last-modified': 'Sun, 15 Nov 2026 03:20:14 GMT' },
    },
    [`${DESCARGA}/don-poncho-v${version}/${apk}`]: {
      cabeceras: { 'content-length': '3203353', 'last-modified': 'Sun, 15 Nov 2026 03:20:01 GMT' },
    },
    [`${DESCARGA}/don-poncho-v${version}/SHA256SUMS.txt`]: {
      cuerpo: `${HUELLA_EXE} *${exe}\n${HUELLA_APK} *${apk}\n`,
    },
  };
}

function releaseDeApi(version, { prerelease = false, draft = false, tag = `don-poncho-v${version}` } = {}) {
  return {
    tag_name: tag,
    draft,
    prerelease,
    published_at: '2026-12-01T18:00:00Z',
    assets: [
      { name: `POS-Don-Poncho-Setup-${version}.exe.blockmap`, size: 10 },
      { name: 'diagnostico-windows.bat', size: 2195 },
      { name: `POS-Don-Poncho-Setup-${version}.exe`, size: 120000000, digest: `sha256:${'c'.repeat(64)}` },
      { name: `POS-Don-Poncho-${version}.apk`, size: 3300000, digest: `sha256:${'d'.repeat(64)}` },
    ],
  };
}

/** Un fetch falso: responde lo de `rutas`; lo demás, 404; `caido` lo hace fallar como sin red. */
function fetchFalso(rutas, estado = { caido: false }) {
  const llamadas = [];
  const pedir = async (url, opciones = {}) => {
    llamadas.push(`${opciones.method ?? 'GET'} ${url}`);
    if (estado.caido) throw new TypeError('fetch failed');
    const r = rutas[url];
    if (!r) return new Response('Not Found', { status: 404 });
    const cuerpo = r.json !== undefined ? JSON.stringify(r.json) : r.cuerpo ?? '';
    return new Response(opciones.method === 'HEAD' ? null : cuerpo, { status: r.estado ?? 200, headers: r.cabeceras ?? {} });
  };
  return { pedir, llamadas };
}

function fuenteCon(rutas, extra = {}) {
  const estado = { caido: false };
  const reloj = { t: Date.parse('2026-11-15T19:00:00Z') };
  const avisos = [];
  const { pedir, llamadas } = fetchFalso(rutas, estado);
  const fuente = crearFuente({
    repo: REPO,
    canal: 'canal-don-poncho',
    prefijo: 'don-poncho-v',
    fetch: pedir,
    ahora: () => reloj.t,
    avisar: (m) => avisos.push(m),
    ...extra,
  });
  return { fuente, estado, reloj, llamadas, avisos };
}

test('leerLatestYml: versión, archivo, tamaño y fecha', () => {
  const yml = github()[`${DESCARGA}/canal-don-poncho/latest.yml`].cuerpo;
  assert.deepEqual(leerLatestYml(yml), {
    version: '1.0.0',
    archivo: 'POS-Don-Poncho-Setup-1.0.0.exe',
    fecha: '2026-11-15T03:16:18.973Z',
    tamano: 121693856,
  });
});

test('leerSumas: con asterisco o con dos espacios, y huellas en minúsculas', () => {
  const sumas = leerSumas(`${HUELLA_EXE.toUpperCase()} *a.exe\r\n${HUELLA_APK}  b.apk\nbasura\n`);
  assert.equal(sumas.get('a.exe'), HUELLA_EXE);
  assert.equal(sumas.get('b.apk'), HUELLA_APK);
  assert.equal(sumas.size, 2);
});

test('compararVersiones: numérica, no de texto', () => {
  assert.ok(compararVersiones('1.0.10', '1.0.9') > 0);
  assert.ok(compararVersiones('2.0.0', '10.0.0') < 0);
  assert.equal(compararVersiones('1.2.3', '1.2.3'), 0);
});

test('el canal: versión, URL del release de esa versión, tamaño, fecha y huellas', async () => {
  const { fuente, llamadas } = fuenteCon(github());
  const v = await fuente.obtener();
  assert.deepEqual(v.windows, {
    version: '1.0.0',
    archivo: 'POS-Don-Poncho-Setup-1.0.0.exe',
    url: `${DESCARGA}/don-poncho-v1.0.0/POS-Don-Poncho-Setup-1.0.0.exe`,
    etiqueta: 'don-poncho-v1.0.0',
    tamano: 121693856,
    fecha: '2026-11-15T03:20:14.000Z',
    sha256: HUELLA_EXE,
    origen: 'canal',
  });
  assert.equal(v.android.url, `${DESCARGA}/don-poncho-v1.0.0/POS-Don-Poncho-1.0.0.apk`);
  assert.equal(v.android.tamano, 3203353);
  assert.equal(v.android.sha256, HUELLA_APK);
  // Sin la API: el canal alcanzó. Comprobó que los archivos existen (HEAD) y leyó las sumas una vez.
  assert.ok(!llamadas.some((l) => l.includes(API)));
  assert.ok(llamadas.includes(`HEAD ${DESCARGA}/don-poncho-v1.0.0/POS-Don-Poncho-Setup-1.0.0.exe`));
  assert.equal(llamadas.filter((l) => l.endsWith('SHA256SUMS.txt')).length, 1);
});

test('sale la 1.0.1: pasados 5 minutos la ofrece sola, sin desplegar nada', async () => {
  const rutas = github('1.0.0');
  const { fuente, reloj } = fuenteCon(rutas);
  assert.equal((await fuente.obtener()).windows.version, '1.0.0');
  Object.assign(rutas, github('1.0.1'));
  reloj.t += VIGENCIA_MS - 1000;
  assert.equal((await fuente.obtener()).windows.version, '1.0.0', 'dentro de los 5 minutos, la del caché');
  reloj.t += 2000;
  const nueva = await fuente.obtener();
  assert.equal(nueva.windows.version, '1.0.1');
  assert.equal(nueva.android.url, `${DESCARGA}/don-poncho-v1.0.1/POS-Don-Poncho-1.0.1.apk`);
});

test('caché: dentro de los 5 minutos no le pregunta a GitHub, y las visitas simultáneas comparten consulta', async () => {
  const { fuente, llamadas, reloj } = fuenteCon(github());
  await Promise.all([fuente.obtener(), fuente.obtener(), fuente.obtener()]);
  const tras = llamadas.length;
  assert.equal(llamadas.filter((l) => l.endsWith('latest.yml')).length, 1);
  reloj.t += VIGENCIA_MS - 1;
  await fuente.obtener();
  assert.equal(llamadas.length, tras);
});

test('el canal anuncia una versión cuyo release no existe todavía: usa la API', async () => {
  const rutas = github('1.0.0');
  rutas[`${DESCARGA}/canal-don-poncho/latest.yml`].cuerpo = rutas[`${DESCARGA}/canal-don-poncho/latest.yml`].cuerpo.replaceAll('1.0.0', '1.0.1');
  rutas[`${API}/repos/${REPO}/releases?per_page=100`] = { json: [releaseDeApi('1.0.0')] };
  const { fuente } = fuenteCon(rutas);
  const v = await fuente.obtener();
  assert.equal(v.windows.version, '1.0.0');
  assert.equal(v.windows.origen, 'api');
  assert.equal(v.windows.sha256, HUELLA_EXE, 'las huellas siguen saliendo de SHA256SUMS.txt');
  assert.equal(v.android.origen, 'canal');
});

test('sin canal: la release más nueva por la API (semver, sin borradores, prerelease ni otros clientes)', async () => {
  const rutas = {
    [`${API}/repos/${REPO}/releases?per_page=100`]: {
      json: [
        releaseDeApi('2.0.0', { prerelease: true }),
        releaseDeApi('3.0.0', { draft: true }),
        releaseDeApi('9.0.0', { tag: 'otro-cliente-v9.0.0' }),
        { tag_name: 'canal-don-poncho', assets: [] },
        releaseDeApi('1.0.9'),
        releaseDeApi('1.0.10'),
        releaseDeApi('0.1.0'),
      ],
    },
  };
  const { fuente } = fuenteCon(rutas);
  const v = await fuente.obtener();
  assert.equal(v.windows.version, '1.0.10');
  assert.equal(v.windows.archivo, 'POS-Don-Poncho-Setup-1.0.10.exe', 'el instalador, no el .blockmap');
  assert.equal(v.windows.url, `${DESCARGA}/don-poncho-v1.0.10/POS-Don-Poncho-Setup-1.0.10.exe`);
  assert.equal(v.windows.tamano, 120000000);
  assert.equal(v.windows.sha256, 'c'.repeat(64), 'sin SHA256SUMS.txt, el digest de la API');
  assert.equal(v.android.version, '1.0.10');
  assert.equal(v.android.origen, 'api');
});

test('GitHub caído desde el arranque: la versión de la construcción, sin error', async () => {
  const conocida = { windows: { version: '1.0.0', url: 'u-exe', origen: 'canal' }, android: { version: '1.0.0', url: 'u-apk', origen: 'canal' } };
  const { fuente, estado, avisos } = fuenteCon({}, { conocida });
  estado.caido = true;
  const v = await fuente.obtener();
  assert.equal(v.windows.url, 'u-exe');
  assert.equal(v.android.url, 'u-apk');
  assert.equal(v.windows.origen, 'conocida');
  assert.ok(avisos.some((a) => a.includes('GitHub no respondió')));
});

test('GitHub se cae después: la última que conoce; reintenta al minuto, no en cada visita', async () => {
  const { fuente, estado, reloj, llamadas } = fuenteCon(github());
  await fuente.obtener();
  estado.caido = true;
  reloj.t += VIGENCIA_MS + 1;
  const v = await fuente.obtener();
  assert.equal(v.windows.version, '1.0.0');
  assert.equal(v.windows.url, `${DESCARGA}/don-poncho-v1.0.0/POS-Don-Poncho-Setup-1.0.0.exe`);
  const tras = llamadas.length;
  reloj.t += REINTENTO_MS - 1;
  await fuente.obtener();
  assert.equal(llamadas.length, tras, 'dentro del minuto no vuelve a preguntar');
  estado.caido = false;
  reloj.t += 2;
  await fuente.obtener();
  assert.ok(llamadas.length > tras, 'pasado el minuto, sí');
});

test('sin GitHub y sin ninguna conocida: null, nunca una excepción', async () => {
  const { fuente, estado } = fuenteCon({});
  estado.caido = true;
  assert.equal(await fuente.obtener(), null);
});

test('un canal con un nombre de archivo raro no se ofrece', async () => {
  const rutas = github();
  rutas[`${DESCARGA}/canal-don-poncho/android.json`].cuerpo = JSON.stringify({ version: '1.0.0', apk: '../../evil.apk' });
  const { fuente, avisos } = fuenteCon(rutas);
  const v = await fuente.obtener();
  assert.equal(v.android, null);
  assert.ok(avisos.some((a) => a.includes('archivo inválido')));
});

test('sin SHA256SUMS.txt: la huella del apk sale de android.json y la del exe queda vacía', async () => {
  const rutas = github();
  delete rutas[`${DESCARGA}/don-poncho-v1.0.0/SHA256SUMS.txt`];
  const { fuente } = fuenteCon(rutas);
  const v = await fuente.obtener();
  assert.equal(v.android.sha256, HUELLA_APK);
  assert.equal(v.windows.sha256, null);
});
