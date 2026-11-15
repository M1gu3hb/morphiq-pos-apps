'use strict';
/**
 * La cola por impresora: un trabajo a la vez, en orden, por cada destino. Recuerda los últimos 50
 * ids ENTREGADOS; uno repetido responde `duplicado` sin imprimir. Un trabajo que falló se puede
 * reintentar con el mismo id. Módulo puro: quien envía de verdad se inyecta.
 */
const { traducirError } = require('./errores');

const IDS_RECORDADOS = 50;

/**
 * @param {{
 *   entregar: (trabajo: object, copia: number) => Promise<{ bytes?: number }>,
 *   ahora?: () => number,
 *   maxIds?: number,
 * }} opciones
 */
function crearCola({ entregar, ahora = Date.now, maxIds = IDS_RECORDADOS }) {
  /** @type {Map<string, Promise<unknown>>} el final de la cadena de cada impresora */
  const cadenas = new Map();
  /** @type {Set<string>} ids entregados, del más viejo al más nuevo */
  const entregados = new Set();

  function recordar(id) {
    entregados.delete(id);
    entregados.add(id);
    while (entregados.size > maxIds) entregados.delete(entregados.values().next().value);
  }

  async function correr(trabajo) {
    const inicio = ahora();
    if (entregados.has(trabajo.id)) {
      return { ok: true, id: trabajo.id, estado: 'duplicado', bytes: 0, ms: 0 };
    }
    const copias = trabajo.copias ?? 1;
    let bytes = 0;
    try {
      for (let copia = 1; copia <= copias; copia += 1) {
        const enviado = await entregar(trabajo, copia);
        bytes += enviado.bytes ?? 0;
      }
    } catch (error) {
      const { codigo, mensaje } = traducirError(error);
      return { ok: false, id: trabajo.id, estado: 'error', codigo, mensaje, bytes, ms: ahora() - inicio };
    }
    recordar(trabajo.id);
    return { ok: true, id: trabajo.id, estado: 'enviado', bytes, ms: ahora() - inicio };
  }

  return {
    /** @param {string} clave el destino @param {{ id: string, copias?: number }} trabajo */
    encolar(clave, trabajo) {
      const anterior = cadenas.get(clave) ?? Promise.resolve();
      // `correr` nunca rechaza: un trabajo que falla no frena a los que siguen.
      const siguiente = anterior.then(() => correr(trabajo));
      cadenas.set(clave, siguiente);
      siguiente.then(() => {
        if (cadenas.get(clave) === siguiente) cadenas.delete(clave);
      });
      return siguiente;
    },
    fueEntregado: (id) => entregados.has(id),
    pendientes: () => cadenas.size,
  };
}

module.exports = { crearCola, IDS_RECORDADOS };
