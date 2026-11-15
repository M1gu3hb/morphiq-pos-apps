/**
 * QUÉ APARATO ABRIÓ LA PÁGINA, por su user agent.
 *
 * Chrome ya no dice la versión real de Windows en el user agent (desde la 107 todos dicen
 * «Windows NT 10.0»), así que la página le pide también la pista `Sec-CH-UA-Platform-Version`: en
 * Windows 7, 8 y 8.1 vale «0.1.0», «0.2.0» y «0.3.0»; de Windows 10 en adelante, 1 o más.
 */

const WINDOWS_POR_NT = {
  '5.1': 'Windows XP',
  '5.2': 'Windows XP',
  '6.0': 'Windows Vista',
  '6.1': 'Windows 7',
  '6.2': 'Windows 8',
  '6.3': 'Windows 8.1',
};
const WINDOWS_POR_PISTA = { 1: 'Windows 7', 2: 'Windows 8', 3: 'Windows 8.1' };
const ANDROID_MINIMO = 6;

/** Las pistas llegan entre comillas: `"Windows"`, `"0.1.0"`. */
function limpiarPista(valor) {
  return typeof valor === 'string' ? valor.trim().replace(/^"|"$/g, '').trim() : '';
}

/** Basta con que una de las dos señales diga «viejo»: el user agent nunca dice una versión más vieja de la que es. */
function windows(ua, pistaVersion) {
  const pista = /^(\d+)\.(\d+)/.exec(pistaVersion);
  if (pista && Number(pista[1]) === 0) {
    return { tipo: 'windows', compatible: false, nombre: WINDOWS_POR_PISTA[Number(pista[2])] ?? null };
  }
  const nt = /Windows NT (\d+)\.(\d+)/i.exec(ua);
  if (nt && Number(nt[1]) < 10) {
    return { tipo: 'windows', compatible: false, nombre: WINDOWS_POR_NT[`${nt[1]}.${nt[2]}`] ?? null };
  }
  return { tipo: 'windows', compatible: true };
}

/** Igual que en Windows: si la pista o el user agent dicen una versión menor a la 6, no corre. */
function android(ua, pistaVersion) {
  const dePista = /^\d+(?:\.\d+)*/.exec(pistaVersion)?.[0];
  const deUa = /Android\s+(\d+(?:\.\d+)*)/i.exec(ua)?.[1];
  const conocidas = [dePista, deUa].filter(Boolean);
  if (conocidas.length === 0) return { tipo: 'android', compatible: true };
  const vieja = conocidas.find((version) => Number.parseInt(version, 10) < ANDROID_MINIMO);
  const mostrada = (vieja ?? conocidas[0]).replace(/(\.0)+$/, '');
  return { tipo: 'android', compatible: !vieja, nombre: `Android ${mostrada}` };
}

/**
 * @param {{ ua?: string, plataforma?: string, versionPlataforma?: string }} entrada
 *   `plataforma` y `versionPlataforma` son las cabeceras `Sec-CH-UA-Platform` y
 *   `Sec-CH-UA-Platform-Version`, si el navegador las mandó.
 * @returns {{ tipo: 'windows'|'android'|'iphone'|'otro', compatible: boolean, nombre?: string|null }}
 */
export function detectarAparato({ ua = '', plataforma = '', versionPlataforma = '' } = {}) {
  const texto = typeof ua === 'string' ? ua : '';
  const sistema = limpiarPista(plataforma).toLowerCase();
  const pista = limpiarPista(versionPlataforma);
  if (/iPhone|iPad|iPod/.test(texto)) return { tipo: 'iphone', compatible: false };
  if (/Android/i.test(texto) || sistema === 'android') return android(texto, sistema === 'android' ? pista : '');
  if (/Windows NT/i.test(texto) || sistema === 'windows') return windows(texto, sistema === 'windows' ? pista : '');
  return { tipo: 'otro', compatible: true };
}
