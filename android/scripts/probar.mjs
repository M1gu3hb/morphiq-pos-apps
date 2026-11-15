#!/usr/bin/env node
/** Corre las pruebas JVM (JUnit) de la lógica pura: `npm run probar`. Prepara el cliente primero porque Gradle lo necesita. */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preparar } from './preparar.mjs';

const AQUI = join(dirname(fileURLToPath(import.meta.url)), '..');
const ES_WINDOWS = process.platform === 'win32';

preparar(process.argv[2] ?? 'don-poncho');
const entorno = { ...process.env };
if (!entorno.ANDROID_HOME && !entorno.ANDROID_SDK_ROOT && process.env.LOCALAPPDATA) {
  entorno.ANDROID_HOME = join(process.env.LOCALAPPDATA, 'Android', 'Sdk');
}
const resultado = spawnSync(ES_WINDOWS ? `"${join(AQUI, 'android', 'gradlew.bat')}"` : join(AQUI, 'android', 'gradlew'), ['testDebugUnitTest', '--console=plain'], {
  cwd: join(AQUI, 'android'),
  stdio: 'inherit',
  env: entorno,
  shell: ES_WINDOWS,
});
process.exit(resultado.status ?? 1);
