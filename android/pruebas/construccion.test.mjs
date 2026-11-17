/**
 * Comprobaciones del guion de construcción y de la variante de depuración:
 *  - la APK `release` NUNCA es depurable ni abre el WebView a `chrome://inspect`;
 *  - la de depuración es otra app (otro paquete, otro nombre) y su archivo dice «depuracion»;
 *  - construir la de depuración jamás toca `android.json` ni pide la firma;
 *  - 1.0.2 (código 4) es más nueva que 1.0.1 (código 3) y 1.0.0 (código 2) y así sale en `android.json`.
 * Son comprobaciones de texto sobre el código real (si alguien lo cambia, fallan). Corre con `npm run probar:puente`.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { fichaDeActualizacion, nombreDelArchivo, nombreDelArchivoDeDepuracion } from '../scripts/construir.mjs';
import { atajosXml, configCapacitor, nombreDeDepuracion, SUFIJO_DEPURACION, valoresDepuracionXml } from '../scripts/preparar.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const ANDROID = join(AQUI, '..');
const leer = (...partes) => readFileSync(join(ANDROID, ...partes), 'utf8');
const GRADLE = leer('android', 'app', 'build.gradle');
const MAIN = leer('android', 'app', 'src', 'main', 'java', 'mx', 'morphiq', 'pos', 'app', 'MainActivity.kt');
const CONSTRUIR = leer('scripts', 'construir.mjs');
const VERSION = JSON.parse(readFileSync(join(ANDROID, '..', 'version.json'), 'utf8'));

const CLIENTE = {
  id: 'don-poncho',
  nombre: 'POS Don Poncho',
  nombreCorto: 'Don Poncho',
  appId: 'mx.morphiq.pos.donponcho',
  colores: { fondo: '#161614', texto: '#f4efe6', acento: '#c0392b' },
  version: VERSION.version,
  versionCode: VERSION.versionCode,
};

/** El cuerpo `{ … }` que sigue a `nombre {` (primer hallazgo a partir de [desde]), con las llaves bien pareadas. */
function bloque(texto, nombre, desde = 0) {
  const inicio = texto.indexOf(`${nombre} {`, desde);
  assert.ok(inicio >= 0, `no se encontró «${nombre} {»`);
  let profundidad = 0;
  for (let i = texto.indexOf('{', inicio); i < texto.length; i += 1) {
    if (texto[i] === '{') profundidad += 1;
    if (texto[i] === '}') profundidad -= 1;
    if (profundidad === 0) return texto.slice(texto.indexOf('{', inicio) + 1, i);
  }
  throw new Error(`«${nombre}» no cierra`);
}

const TIPOS = bloque(GRADLE, 'buildTypes');

test('la release no es depurable, no cambia de paquete y se firma con la llave del cliente', () => {
  const release = bloque(TIPOS, 'release');
  assert.match(release, /debuggable\s+false/);
  assert.doesNotMatch(release, /debuggable\s+true/);
  assert.doesNotMatch(release, /applicationIdSuffix/);
  assert.match(release, /signingConfig\s+signingConfigs\.release/);
  assert.doesNotMatch(release, /signingConfigs\.debug/, 'la release jamás se firma con la llave de depuración');
});

test('la depuración es OTRA app: sufijo de paquete .debug y versión marcada', () => {
  const debug = bloque(TIPOS, 'debug');
  assert.match(debug, /applicationIdSuffix\s+'\.debug'/);
  assert.match(debug, /versionNameSuffix\s+'-depuracion'/);
  assert.equal(SUFIJO_DEPURACION, '.debug', 'preparar.mjs y build.gradle deben coincidir');
});

test('el WebView sólo se depura con BuildConfig.DEBUG; nunca encendido a mano', () => {
  assert.match(MAIN, /WebView\.setWebContentsDebuggingEnabled\(BuildConfig\.DEBUG\)/);
  assert.doesNotMatch(MAIN, /setWebContentsDebuggingEnabled\(\s*true\s*\)/);
  assert.equal(configCapacitor(CLIENTE).android.webContentsDebuggingEnabled, false, 'capacitor.config.json también la deja apagada');
});

test('la variante de depuración no se actualiza sola desde el canal', () => {
  const servicios = leer('android', 'app', 'src', 'main', 'java', 'mx', 'morphiq', 'pos', 'app', 'puente', 'ServiciosDeLaApp.kt');
  assert.match(servicios, /habilitado\s*=\s*!BuildConfig\.DEBUG/);
  assert.match(MAIN, /if \(!BuildConfig\.DEBUG\) servicios\.actualizador\.iniciarRevisiones\(\)/);
});

test('la depuración se llama «… · depuración» y su acceso directo apunta a su propio paquete', () => {
  assert.equal(nombreDeDepuracion(CLIENTE), 'POS Don Poncho · depuración');
  const valores = valoresDepuracionXml(CLIENTE);
  assert.match(valores, /<string name="app_name">POS Don Poncho · depuración<\/string>/);
  assert.match(valores, /<string name="title_activity_main">POS Don Poncho · depuración<\/string>/);
  assert.match(atajosXml(CLIENTE, `${CLIENTE.appId}${SUFIJO_DEPURACION}`), /targetPackage="mx\.morphiq\.pos\.donponcho\.debug"/);
  assert.match(atajosXml(CLIENTE), /targetPackage="mx\.morphiq\.pos\.donponcho"/, 'el de la release no cambia');
});

test('el archivo de depuración dice «depuracion» y no se parece al bueno', () => {
  assert.equal(nombreDelArchivo(CLIENTE), 'POS-Don-Poncho-1.0.2.apk');
  assert.equal(nombreDelArchivoDeDepuracion(CLIENTE), 'POS-Don-Poncho-1.0.2-depuracion.apk');
  assert.notEqual(nombreDelArchivoDeDepuracion(CLIENTE), nombreDelArchivo(CLIENTE));
});

test('construir la depuración no pide firma, no toca android.json y no se publica', () => {
  const inicio = CONSTRUIR.indexOf('function construirDepuracion');
  const fin = CONSTRUIR.indexOf('function construir(id)');
  assert.ok(inicio >= 0 && fin > inicio);
  const cuerpo = CONSTRUIR.slice(inicio, fin);
  assert.match(cuerpo, /assembleDebug/);
  assert.doesNotMatch(cuerpo, /assembleRelease/);
  assert.doesNotMatch(cuerpo, /MORPHIQ_FIRMA/);
  assert.doesNotMatch(cuerpo, /android\.json|fichaDeActualizacion/);
  assert.match(cuerpo, /nombreDelArchivoDeDepuracion/);
  assert.doesNotMatch(cuerpo, /nombreDelArchivo\(cliente\)(?!De)/, 'no usa el nombre del archivo bueno');
});

test('1.0.2 con versionCode 4 es la versión que sale, y android.json la anuncia', () => {
  assert.deepEqual(VERSION, { version: '1.0.2', versionCode: 4 });
  const ficha = fichaDeActualizacion(CLIENTE, nombreDelArchivo(CLIENTE), 'a'.repeat(64), 'notas');
  assert.equal(ficha.versionCode, 4);
  assert.equal(ficha.version, '1.0.2');
  assert.equal(ficha.apk, 'POS-Don-Poncho-1.0.2.apk');
  assert.ok(ficha.versionCode > 2, 'más nueva que la 1.0.0 (código 2)');
});

test('el appId y el nombre de la app buena no cambian (la 1.0.1 se instala ENCIMA de la 1.0.0)', () => {
  assert.equal(CLIENTE.appId, 'mx.morphiq.pos.donponcho');
  assert.doesNotMatch(bloque(GRADLE, 'defaultConfig'), /applicationIdSuffix/);
  assert.match(GRADLE, /applicationId cliente\.appId/);
});
