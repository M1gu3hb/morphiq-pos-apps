'use strict';
/** Modo ligero: automático por RAM y núcleos, o manual con `ajustes.modoLigero`. Módulo puro. */

/** RAM total (en MB) a partir de la cual el aparato se considera justo. 4 GB. */
const RAM_LIGERA_MB = 4096;
/** Núcleos a partir de los cuales el aparato se considera justo. */
const NUCLEOS_LIGEROS = 2;

/**
 * @param {{ ramTotalMb: number, nucleos: number, manual: boolean | null | undefined }} datos
 * @returns {{ activo: boolean, origen: 'auto' | 'manual', motivo: string }}
 */
function decidirModoLigero({ ramTotalMb, nucleos, manual }) {
  if (manual === true) return { activo: true, origen: 'manual', motivo: 'Lo encendieron en los ajustes' };
  if (manual === false) return { activo: false, origen: 'manual', motivo: 'Lo apagaron en los ajustes' };
  const poca = ramTotalMb <= RAM_LIGERA_MB;
  const pocos = nucleos <= NUCLEOS_LIGEROS;
  if (poca && pocos) return { activo: true, origen: 'auto', motivo: `Poca RAM (${gb(ramTotalMb)}) y ${nucleos} núcleos` };
  if (poca) return { activo: true, origen: 'auto', motivo: `Poca RAM (${gb(ramTotalMb)})` };
  if (pocos) return { activo: true, origen: 'auto', motivo: `Sólo ${nucleos} núcleos` };
  return { activo: false, origen: 'auto', motivo: 'El aparato tiene de sobra' };
}

function gb(mb) {
  return `${(mb / 1024).toFixed(1)} GB`;
}

module.exports = { decidirModoLigero, RAM_LIGERA_MB, NUCLEOS_LIGEROS };
