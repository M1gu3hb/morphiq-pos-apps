'use strict';
/**
 * Actualización con electron-updater (proveedor `generic`, repo público sin token):
 * `https://github.com/<repo>/releases/download/<canal>/` con `latest.yml` y el instalador.
 * El `autoUpdater` se inyecta para poder probar la máquina de estados sin red.
 */

const REVISAR_CADA_MS = 4 * 60 * 60 * 1000;
const PRIMERA_REVISION_MS = 15_000;

/** La URL del canal del cliente; con barra final, como pide el proveedor genérico. */
function urlDelCanal(releases) {
  return `https://github.com/${releases.repo}/releases/download/${releases.canal}/`;
}

/**
 * @param {{
 *   autoUpdater: import('node:events').EventEmitter & Record<string, unknown> | null,
 *   versionActual: string,
 *   cliente: { nombre: string, releases: { repo: string, canal: string } },
 *   canalDeActualizacion?: string,
 *   alCambiar: (estado: object) => void,
 *   preguntarReinicio: (mensaje: { titulo: string, detalle: string }) => Promise<boolean>,
 *   motivoSinActualizar?: string | null,
 * }} deps `autoUpdater` es `null` si la app no está empaquetada.
 */
function crearActualizador(deps) {
  const { autoUpdater, versionActual, cliente, canalDeActualizacion, alCambiar, preguntarReinicio, motivoSinActualizar } = deps;
  let estado = { estado: 'al-dia', versionActual };

  function poner(parche) {
    estado = { estado: parche.estado, versionActual, ...parche };
    alCambiar(estado);
    return estado;
  }

  if (autoUpdater) {
    autoUpdater.setFeedURL({ provider: 'generic', url: urlDelCanal(cliente.releases), ...(canalDeActualizacion ? { channel: canalDeActualizacion } : {}) });
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;
    autoUpdater.on('update-available', (info) => poner({ estado: 'descargando', versionNueva: info.version, avance: 0 }));
    autoUpdater.on('update-not-available', () => poner({ estado: 'al-dia' }));
    autoUpdater.on('download-progress', (p) =>
      poner({ estado: 'descargando', versionNueva: estado.versionNueva, avance: Math.round(p.percent) / 100 }),
    );
    autoUpdater.on('error', (error) => poner({ estado: 'error', mensaje: `No se pudo actualizar: ${error.message}` }));
    autoUpdater.on('update-downloaded', async (info) => {
      poner({ estado: 'lista', versionNueva: info.version, avance: 1 });
      const reiniciar = await preguntarReinicio({
        titulo: `${cliente.nombre} tiene una actualización`,
        detalle: `La versión ${info.version} ya está lista. ¿Reiniciar ahora o instalarla al cerrar la app?`,
      });
      if (reiniciar) instalar();
    });
  }

  const sinActualizar = () =>
    poner({ estado: 'error', mensaje: motivoSinActualizar ?? 'Las actualizaciones sólo funcionan en la app instalada.' });

  async function buscar() {
    if (!autoUpdater) return sinActualizar();
    // Si ya hay una descargada o bajando, no se vuelve a preguntar: se dice cómo va.
    if (estado.estado === 'lista' || estado.estado === 'descargando') return estado;
    try {
      const resultado = await autoUpdater.checkForUpdates();
      // Los eventos ya movieron el estado; si no hay evento de «disponible» es que está al día.
      if (!resultado || !resultado.isUpdateAvailable) return estado.estado === 'error' ? estado : poner({ estado: 'al-dia' });
      return estado;
    } catch (error) {
      return poner({ estado: 'error', mensaje: `No se pudo buscar la actualización: ${error.message}` });
    }
  }

  function instalar() {
    if (!autoUpdater) return sinActualizar();
    if (estado.estado !== 'lista') {
      return poner({ ...estado, mensaje: 'Todavía no hay una actualización lista para instalar.', estado: estado.estado });
    }
    // Instala en silencio y vuelve a abrir la app.
    autoUpdater.quitAndInstall(true, true);
    return estado;
  }

  let reloj = null;
  return {
    buscar,
    instalar,
    estado: () => estado,
    /** Revisa poco después de abrir y cada 4 horas. */
    programar() {
      if (!autoUpdater || reloj) return;
      setTimeout(() => void buscar(), PRIMERA_REVISION_MS).unref();
      reloj = setInterval(() => void buscar(), REVISAR_CADA_MS);
      reloj.unref();
    },
  };
}

module.exports = { crearActualizador, urlDelCanal, REVISAR_CADA_MS };
