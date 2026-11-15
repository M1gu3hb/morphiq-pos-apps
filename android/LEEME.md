# App de Android

Capacitor 7.6.10 + un plugin propio en Kotlin (`MorphiqApp`). Abre sólo el POS de producción del
cliente y le entrega a la impresora los bytes que arma la página. Contrato: `../puente/contrato.d.ts`.

## Construir

Requisitos: Node 24, JDK 21 y el SDK de Android (`platforms/android-36`). Si falta `ANDROID_HOME`,
los guiones usan `%LOCALAPPDATA%\Android\Sdk`.

```bash
cd android
npm install
MORPHIQ_FIRMA="<ruta>/firma.properties" npm run construir   # APK firmada → salida/
npm run probar                                               # pruebas JVM (JUnit)
```

`firma.properties` (llaves `storeFile`, `storePassword`, `keyAlias`, `keyPassword`) vive FUERA del
repo; sin `MORPHIQ_FIRMA` el build `release` se detiene con un mensaje y nunca firma con la llave de
depuración. `salida/` queda con `POS-<cliente>-<version>.apk` y `android.json` (con el sha256 real),
que se sube al canal de GitHub Releases del cliente.

## Cómo está armado

- Todo lo del cliente sale de `generado/cliente.json` (lo deja `scripts/preparar-cliente.mjs` de la
  raíz). `scripts/preparar.mjs` escribe `capacitor.config.json` y los recursos de Android del cliente
  (nombre, colores, ícono, acceso directo); Gradle lee de ahí `applicationId`, versión, dominio, URL
  y canal de actualización.
- Sin `server.url` en `capacitor.config.json`: con él, Capacitor 7 sólo sirve en local la página de
  error y Diagnóstico no abriría. `MainActivity` carga el POS (`cliente.url`) y las pantallas
  internas viven en `https://localhost`.
- `src/main/java/mx/morphiq/pos/app/logica/`: lo puro (origen permitido, cola, ESC/POS, versiones,
  ajustes, errores, red) con pruebas JVM. `hardware/`: USB y Bluetooth. `puente/`: el plugin, la
  inyección de `window.MorphiqApp` (`assets/morphiq-app-puente.js`) y los diálogos.
- Probar en un aparato: instalar la APK, abrir Diagnóstico (primer arranque o mantener presionado el
  ícono) y usar «Página de prueba» y «Abrir cajón» en cada impresora.
