# morphiq-pos-apps

Las apps de escritorio y de Android de los puntos de venta de Morphiq. Abren **el POS de producción
del cliente** a pantalla completa y le hablan directo al hardware: imprimir sin el diálogo del
navegador (impresora integrada, USB, Bluetooth o red), abrir el cajón y actualizarse solas. Todo lo
demás (pantallas, cobros, cortes) vive en la web del POS.

| Carpeta | Qué es |
| --- | --- |
| `clientes/` | Lo que cambia por cliente: nombre, ícono, URL y dominio permitido (`<id>.json`). |
| `puente/contrato.d.ts` | `window.MorphiqApp`: la misma interfaz en las dos apps. |
| `compartido/pantallas/` | Diagnóstico, Sin internet y Acerca de: las mismas en las dos apps. |
| `electron/` | La app de Windows (`.exe`, instalador NSIS por usuario). |
| `android/` | La app de Android (`.apk`, Capacitor y un plugin propio en Kotlin). |
| `scripts/` | Preparar un cliente y publicar un release. |
| `descargas/` | La página para bajar las apps desde cualquier navegador (Vercel): <https://don-poncho-apps.vercel.app>. |

## Este repositorio es público y no lleva ningún secreto

Es público para que las apps bajen sus actualizaciones de GitHub Releases sin token. El keystore de
Android, sus contraseñas y cualquier certificado viven **fuera del repo** (la ruta se pasa por
variable de entorno al compilar; ver `android/LEEME.md`).

## Seguridad del puente

- El puente se expone sólo a `https://<dominio del cliente>` y a las pantallas internas de la app.
  Cualquier otro destino se abre en el navegador del sistema o se bloquea.
- Electron: `contextIsolation`, sin `nodeIntegration`, `sandbox`, preload con `contextBridge`, y cada
  `ipcMain` revisa el origen de quien llama. Capacitor: el plugin revisa la URL del WebView.
- El puente no da acceso a archivos ni a comandos del sistema: sólo imprimir, cajón, diagnóstico,
  ajustes del aparato y actualización. **Única excepción (Windows 1.0.2):** `MorphiqApp.archivos`
  guarda el PDF de un corte y abre su carpeta, con tres cerrojos: sólo PDF (firma `%PDF-` y tope de
  20 MiB), sólo `Documentos\POS Don Poncho\Cortes\AAAA-MM\` (la página no da nombre ni ruta: la app
  arma `Corte-<folio>-<fecha>.pdf` y comprueba que quede dentro) y sólo desde el origen de producción.
- En las apps publicadas las herramientas de desarrollador están apagadas.

Cómo instalar y configurar cada aparato: [`INSTALAR.md`](INSTALAR.md).
