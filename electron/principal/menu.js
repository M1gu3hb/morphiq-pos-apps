'use strict';
/** El menú del dueño (Ctrl+Shift+M): no hay barra de menú visible, sólo este menú emergente. */

/**
 * @param {{
 *   Menu: typeof import('electron').Menu,
 *   ventana: ReturnType<typeof import('./ventana').crearGestorDeVentana>,
 *   ajustes: { leer: () => { pantallaCompleta?: boolean }, guardar: (parche: object) => object },
 *   buscarActualizacion: () => Promise<void>,
 *   salir: () => void,
 * }} deps
 */
function crearMenuDelDuenio({ Menu, ventana, ajustes, buscarActualizacion, salir }) {
  function plantilla() {
    const completa = ajustes.leer().pantallaCompleta !== false;
    return [
      { label: 'Diagnóstico', click: () => void ventana.cargarPantalla('diagnostico') },
      { label: 'Buscar actualización', click: () => void buscarActualizacion() },
      {
        label: 'Pantalla completa',
        type: 'checkbox',
        checked: completa,
        click: (item) => {
          ajustes.guardar({ pantallaCompleta: item.checked });
          ventana.ponerPantallaCompleta(item.checked);
        },
      },
      { label: 'Recargar', click: () => ventana.recargar() },
      { label: 'Acerca de', click: () => void ventana.cargarPantalla('acerca') },
      { type: 'separator' },
      { label: 'Salir', click: salir },
    ];
  }

  return {
    plantilla,
    /** Abre el menú emergente sobre la ventana. */
    abrir() {
      const actual = ventana.ventana();
      if (!actual || actual.isDestroyed()) return;
      Menu.buildFromTemplate(plantilla()).popup({ window: actual });
    },
  };
}

module.exports = { crearMenuDelDuenio };
