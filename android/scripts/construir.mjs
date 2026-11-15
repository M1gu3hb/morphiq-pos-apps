#!/usr/bin/env node
/**
 * CONSTRUYE LA APK FIRMADA DE UN CLIENTE.
 *
 *   MORPHIQ_FIRMA="<ruta>/firma.properties" npm run construir        (cliente: don-poncho)
 *
 * 1. Prepara el cliente (`scripts/preparar.mjs`).
 * 2. `npx cap sync android`: copia las pantallas y la configuración a la app nativa.
 * 3. `gradlew assembleRelease`, firmada con el archivo que apunta MORPHIQ_FIRMA.
 * 4. Deja en `salida/`: `POS-<cliente>-<version>.apk` y `android.json` (con el sha256 REAL del APK),
 *    el archivo que lee el actualizador de las apps instaladas.
 *
 * Nunca se firma con la llave de depuración: sin MORPHIQ_FIRMA no se construye.
 *
 * VARIANTE DE DEPURACIÓN (sólo para Miguel): `node scripts/construir.mjs don-poncho --depuracion`
 * (`npm run construir:depuracion`) corre `assembleDebug` y deja `POS-<cliente>-<version>-depuracion.apk`
 * en `salida/`. No pide MORPHIQ_FIRMA, NO toca el APK bueno ni escribe `android.json` (el canal de
 * actualización jamás debe apuntar a ella) y su nombre dice «depuracion» para que no se confunda.
 * Nunca se sube al canal ni se instala al personal.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preparar } from './preparar.mjs';

const AQUI = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROYECTO = join(AQUI, 'android');
const SALIDA = join(AQUI, 'salida');
const APK_DE_GRADLE = join(PROYECTO, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
const APK_DE_DEPURACION = join(PROYECTO, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
/** El nombre de la APK de depuración termina SIEMPRE así: es lo que la distingue de la buena en `salida/`. */
export const SUFIJO_DE_ARCHIVO_DEPURACION = '-depuracion.apk';
const ES_WINDOWS = process.platform === 'win32';

export function nombreDelArchivo(cliente) {
  const base = cliente.nombre.normalize('NFD').replace(/\p{M}+/gu, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${base}-${cliente.version}.apk`;
}

/** `POS-Don-Poncho-1.0.1-depuracion.apk`: el nombre de la APK de depuración. */
export function nombreDelArchivoDeDepuracion(cliente) {
  return nombreDelArchivo(cliente).replace(/.apk$/, SUFIJO_DE_ARCHIVO_DEPURACION);
}

export function fichaDeActualizacion(cliente, archivo, sha256, notas) {
  return { versionCode: cliente.versionCode, version: cliente.version, apk: archivo, sha256, notas };
}

function correr(comando, argumentos, cwd, entorno) {
  const resultado = spawnSync(comando, argumentos, { cwd, stdio: 'inherit', env: entorno, shell: ES_WINDOWS });
  if (resultado.status !== 0) {
    throw new Error(`Falló «${comando} ${argumentos.join(' ')}» (código ${resultado.status ?? resultado.signal}).`);
  }
}

function entornoDeAndroid() {
  const entorno = { ...process.env };
  if (!entorno.ANDROID_HOME && !entorno.ANDROID_SDK_ROOT) {
    const local = process.env.LOCALAPPDATA;
    if (local) entorno.ANDROID_HOME = join(local, 'Android', 'Sdk');
  }
  return entorno;
}

/** Sólo la APK de depuración: no necesita firma, no toca la buena ni `android.json`. */
function construirDepuracion(id) {
  const cliente = preparar(id);
  const entorno = entornoDeAndroid();
  correr('npx', ['cap', 'sync', 'android'], AQUI, entorno);
  const gradlew = ES_WINDOWS ? `"${join(PROYECTO, 'gradlew.bat')}"` : join(PROYECTO, 'gradlew');
  correr(gradlew, ['assembleDebug', '--console=plain'], PROYECTO, entorno);
  if (!existsSync(APK_DE_DEPURACION)) throw new Error('Gradle terminó pero no dejó el APK de depuración.');

  mkdirSync(SALIDA, { recursive: true });
  for (const anterior of readdirSync(SALIDA)) {
    if (anterior.endsWith(SUFIJO_DE_ARCHIVO_DEPURACION)) rmSync(join(SALIDA, anterior), { force: true });
  }
  const archivo = nombreDelArchivoDeDepuracion(cliente);
  copyFileSync(APK_DE_DEPURACION, join(SALIDA, archivo));
  return { archivo, sha256: createHash('sha256').update(readFileSync(join(SALIDA, archivo))).digest('hex') };
}

function construir(id) {
  const firma = process.env.MORPHIQ_FIRMA;
  if (!firma) throw new Error('Falta la variable de entorno MORPHIQ_FIRMA con la ruta de firma.properties. Sin ella no se compila el release.');
  if (!existsSync(firma)) throw new Error('MORPHIQ_FIRMA apunta a un archivo que no existe.');

  const cliente = preparar(id);
  const entorno = entornoDeAndroid();
  correr('npx', ['cap', 'sync', 'android'], AQUI, entorno);
  const gradlew = ES_WINDOWS ? `"${join(PROYECTO, 'gradlew.bat')}"` : join(PROYECTO, 'gradlew');
  correr(gradlew, ['assembleRelease', '--console=plain'], PROYECTO, entorno);
  if (!existsSync(APK_DE_GRADLE)) throw new Error('Gradle terminó pero no dejó el APK del release.');

  // Sólo se renuevan el APK y android.json: las notas de los hitos (HITO-*.txt) y sus copias se conservan.
  mkdirSync(SALIDA, { recursive: true });
  for (const anterior of readdirSync(SALIDA)) {
    // La de depuración (si hay) también sale: «salida/» queda sólo con lo que se publica.
    if (anterior.endsWith('.apk') || anterior === 'android.json') rmSync(join(SALIDA, anterior), { force: true });
  }
  const archivo = nombreDelArchivo(cliente);
  copyFileSync(APK_DE_GRADLE, join(SALIDA, archivo));
  const sha256 = createHash('sha256').update(readFileSync(join(SALIDA, archivo))).digest('hex');
  const notas = process.env.MORPHIQ_NOTAS || `Versión ${cliente.version}`;
  writeFileSync(join(SALIDA, 'android.json'), `${JSON.stringify(fichaDeActualizacion(cliente, archivo, sha256, notas), null, 2)}\n`);
  return { archivo, sha256 };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [id, ...banderas] = process.argv.slice(2);
  const depuracion = banderas.includes('--depuracion');
  if (!id) {
    console.error('Uso: node scripts/construir.mjs <cliente> [--depuracion]');
    process.exit(2);
  }
  try {
    const { archivo, sha256 } = depuracion ? construirDepuracion(id) : construir(id);
    console.log(`\nListo: salida/${archivo}\nsha256: ${sha256}`);
    if (depuracion) console.log('Es la variante de DEPURACIÓN: no se sube al canal ni se instala al personal.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
