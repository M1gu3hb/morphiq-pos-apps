'use strict';
/**
 * DP-D125: por el spooler o por el driver sólo se imprime en una impresora que Windows tenga en SU lista
 * (la de `ayudante listar`: locales y conexiones ya instaladas). Una compartida `\\equipo\impresora`
 * instalada está en la lista y vale; un nombre UNC inventado no, porque abrirlo haría que Windows se
 * conectara a otro equipo. Si la lista no se puede leer, NO se imprime «a ciegas».
 */
const { ErrorDeImpresion, traducirError } = require('./errores');

/** Cuánto vale una lista leída: lo justo para no lanzar un proceso por cada ticket. */
const VIGENCIA_DE_LA_LISTA_MS = 30_000;
const ESPERA_DE_LA_LISTA_MS = 15_000;

/** Windows no distingue mayúsculas en los nombres de impresora. */
const llave = (nombre) => String(nombre).trim().toLowerCase();

/**
 * @param {{ ayudante: { ejecutar: Function }, ahora?: () => number }} dependencias
 * @returns {{ exigirInstalada: (nombre: string) => Promise<void> }} rechaza con `ErrorDeImpresion`
 */
function crearVerificadorDeImpresoras({ ayudante, ahora = Date.now }) {
  let nombres = new Set();
  let leidaEn = -Infinity;

  async function leerLista() {
    const listado = await ayudante.ejecutar(['listar'], { esperaMs: ESPERA_DE_LA_LISTA_MS });
    nombres = new Set((listado.impresoras ?? []).map((p) => llave(p.nombre)));
    leidaEn = ahora();
  }

  async function exigirInstalada(nombre) {
    const buscada = llave(nombre);
    if (ahora() - leidaEn < VIGENCIA_DE_LA_LISTA_MS && nombres.has(buscada)) return;
    // Lo que no está en la lista vigente se vuelve a preguntar: pudieron instalar la impresora hace un momento.
    try {
      await leerLista();
    } catch (error) {
      const { mensaje } = traducirError(error);
      throw new ErrorDeImpresion(
        'DESCONOCIDO',
        `No se pudo leer la lista de impresoras de Windows (${mensaje}); por seguridad no se imprime sin comprobar que «${nombre}» esté instalada`,
      );
    }
    if (!nombres.has(buscada)) {
      throw new ErrorDeImpresion('DESCONECTADA', `La impresora «${nombre}» no está instalada en este equipo`);
    }
  }

  return { exigirInstalada };
}

module.exports = { crearVerificadorDeImpresoras, VIGENCIA_DE_LA_LISTA_MS };
