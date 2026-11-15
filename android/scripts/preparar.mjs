#!/usr/bin/env node
/**
 * PREPARA LA APP DE ANDROID PARA UN CLIENTE.
 *
 *   node scripts/preparar.mjs don-poncho        (o: npm run preparar)
 *
 * 1. Corre `scripts/preparar-cliente.mjs` de la raíz: deja `generado/cliente.json`,
 *    `generado/icono.png` y `www/` (las pantallas internas).
 * 2. Escribe `capacitor.config.json` (nada del cliente va escrito a mano en el código).
 * 3. Escribe los recursos de Android del cliente en `android/app/src/generado/res/`: nombre de la
 *    app, colores, ícono de lanzador (adaptable + clásico) y el acceso directo «Diagnóstico».
 *
 * `applicationId`, `versionCode`, `versionName` y el dominio/URL/canal de actualización los lee
 * Gradle directo de `generado/cliente.json` (ver `android/app/build.gradle`).
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAIZ = join(AQUI, '..');
const RECURSOS = join(AQUI, 'android', 'app', 'src', 'generado', 'res');
/** Acción del acceso directo «Diagnóstico»: la misma que reconoce MainActivity. */
export const ACCION_DIAGNOSTICO = 'mx.morphiq.pos.app.DIAGNOSTICO';
export const CLASE_ACTIVIDAD = 'mx.morphiq.pos.app.MainActivity';

export function escaparXml(texto) {
  return String(texto)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", "\\'");
}

export function configCapacitor(cliente) {
  return {
    appId: cliente.appId,
    appName: cliente.nombre,
    webDir: 'www',
    // Sin `server.url` a propósito: con ese ajuste Capacitor 7 sólo sirve en local la página de
    // error y Diagnóstico no abriría. El POS lo carga MainActivity (`cliente.url`); la página de
    // inicio de Capacitor es la local y de ahí salen las pantallas internas.
    server: {
      allowNavigation: [cliente.dominio],
      androidScheme: 'https',
      cleartext: false,
      errorPath: 'sin-internet.html',
    },
    android: {
      webContentsDebuggingEnabled: false,
      allowMixedContent: false,
      backgroundColor: cliente.colores.fondo,
    },
  };
}

export function valoresXml(cliente) {
  const nombre = escaparXml(cliente.nombre);
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- GENERADO por scripts/preparar.mjs desde clientes/${cliente.id}.json. No se edita a mano. -->
<resources>
    <string name="app_name">${nombre}</string>
    <string name="title_activity_main">${nombre}</string>
    <string name="atajo_diagnostico_corto">Diagnóstico</string>
    <string name="atajo_diagnostico_largo">Diagnóstico de ${escaparXml(cliente.nombreCorto)}</string>
    <color name="morphiq_fondo">${cliente.colores.fondo}</color>
    <color name="morphiq_acento">${cliente.colores.acento}</color>
    <color name="ic_launcher_background">${cliente.colores.fondo}</color>
</resources>
`;
}

export function atajosXml(cliente) {
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- GENERADO por scripts/preparar.mjs. -->
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
    <shortcut
        android:shortcutId="diagnostico"
        android:enabled="true"
        android:icon="@mipmap/ic_launcher"
        android:shortcutShortLabel="@string/atajo_diagnostico_corto"
        android:shortcutLongLabel="@string/atajo_diagnostico_largo">
        <intent
            android:action="${ACCION_DIAGNOSTICO}"
            android:targetPackage="${cliente.appId}"
            android:targetClass="${CLASE_ACTIVIDAD}" />
    </shortcut>
</shortcuts>
`;
}

const ICONO_ADAPTABLE = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground>
        <inset android:drawable="@drawable/ic_launcher_foreground" android:inset="17%" />
    </foreground>
</adaptive-icon>
`;

function escribir(ruta, contenido) {
  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta, contenido);
}

export function preparar(id) {
  execFileSync(process.execPath, [join(RAIZ, 'scripts', 'preparar-cliente.mjs'), id], { stdio: 'inherit' });
  const cliente = JSON.parse(readFileSync(join(AQUI, 'generado', 'cliente.json'), 'utf8'));
  const icono = join(AQUI, 'generado', 'icono.png');

  writeFileSync(join(AQUI, 'capacitor.config.json'), `${JSON.stringify(configCapacitor(cliente), null, 2)}\n`);

  rmSync(RECURSOS, { recursive: true, force: true });
  escribir(join(RECURSOS, 'values', 'morphiq_cliente.xml'), valoresXml(cliente));
  escribir(join(RECURSOS, 'xml', 'shortcuts.xml'), atajosXml(cliente));
  escribir(join(RECURSOS, 'mipmap-anydpi-v26', 'ic_launcher.xml'), ICONO_ADAPTABLE);
  mkdirSync(join(RECURSOS, 'mipmap-nodpi'), { recursive: true });
  mkdirSync(join(RECURSOS, 'drawable-nodpi'), { recursive: true });
  cpSync(icono, join(RECURSOS, 'mipmap-nodpi', 'ic_launcher.png'));
  cpSync(icono, join(RECURSOS, 'drawable-nodpi', 'ic_launcher_foreground.png'));
  return cliente;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const id = process.argv[2];
  if (!id) {
    console.error('Uso: node scripts/preparar.mjs <cliente>');
    process.exit(2);
  }
  try {
    const cliente = preparar(id);
    console.log(`Android listo para ${cliente.nombre} ${cliente.version} (código ${cliente.versionCode}).`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
