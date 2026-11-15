'use strict';
/** «El último ticket» del aparato: una copia local para reimprimir aunque no haya internet. */
const { leerJson, escribirJsonAtomico } = require('../archivo-json');

/**
 * @param {string} ruta archivo `ultimo-ticket.json` dentro de `userData`
 * @param {() => Date} [ahora]
 */
function crearUltimoTicket(ruta, ahora = () => new Date()) {
  return {
    /** @param {{ titulo: string, documento: { tipo: 'crudo', base64: string, bloqueBytes?: number, pausaMs?: number } }} ticket */
    guardar(ticket) {
      escribirJsonAtomico(ruta, { titulo: ticket.titulo, guardadoEn: ahora().toISOString(), documento: ticket.documento });
    },
    /** @returns {{ titulo: string, guardadoEn: string, documento: object } | null} */
    leer() {
      const leido = leerJson(ruta);
      if (leido.error) throw new Error(leido.error);
      const v = leido.valor;
      if (!v || typeof v !== 'object' || typeof v.titulo !== 'string' || typeof v.guardadoEn !== 'string' || !v.documento) return null;
      return v;
    },
  };
}

module.exports = { crearUltimoTicket };
