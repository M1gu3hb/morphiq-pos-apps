/** Cómo se escriben en la página los tamaños, las fechas y el texto que viene de fuera. */

export const ZONA_PREDETERMINADA = 'America/Mexico_City';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const KB = 1024;
const MB = 1024 * 1024;

const ENTIDADES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapar(texto) {
  return String(texto).replace(/[&<>"']/g, (caracter) => ENTIDADES[caracter]);
}

/** 121693856 → «116 MB»; 3203353 → «3.1 MB». Como lo cuenta Windows (base 1024). */
export function formatearTamano(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  if (bytes < KB) return `${bytes} bytes`;
  const [base, unidad] = bytes >= MB ? [MB, 'MB'] : [KB, 'KB'];
  const valor = bytes / base;
  const conDecimal = Math.round(valor * 10) / 10;
  return conDecimal >= 10 ? `${Math.round(valor)} ${unidad}` : `${conDecimal.toFixed(1)} ${unidad}`;
}

/** «2026-11-15T03:20:01Z» → «14 nov 2026»: la fecha en la hora del cliente, no en la de Greenwich. */
export function formatearFecha(iso, zona = ZONA_PREDETERMINADA) {
  if (!iso) return null;
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return null;
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: zona,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(fecha);
  const valor = (tipo) => partes.find((parte) => parte.type === tipo).value;
  return `${Number(valor('day'))} ${MESES[Number(valor('month')) - 1]} ${valor('year')}`;
}

export function zonaValida(zona) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zona }).format(0);
    return true;
  } catch {
    return false;
  }
}
