'use strict';
/**
 * DP-D125: la impresión por red sólo va a direcciones de la red local. Se acepta ÚNICAMENTE un
 * literal IPv4 o IPv6 (jamás un nombre de host: nunca se consulta un DNS) que sea:
 *  - IPv4 privada (10/8, 172.16/12, 192.168/16), de enlace local (169.254/16) o loopback (127/8);
 *  - IPv6 de enlace local (fe80::/10, con o sin zona `%wlan0`), ULA (fc00::/7) o loopback (::1);
 *  - IPv4 mapeada en IPv6 (`::ffff:a.b.c.d`), que se juzga por la IPv4 que lleva dentro.
 *
 * El análisis es ESTRICTO a propósito: cuatro números decimales sin ceros a la izquierda (`010.0.0.1`
 * es octal para algunas librerías), sin formas cortas (`127.1`), hexadecimales (`0x7f.1`) ni enteros
 * (`2130706433`). Lo que se valida es lo mismo que luego se le da al socket (el literal ya limpio),
 * así que no hay dos lecturas distintas de la misma dirección.
 *
 * Es el mismo criterio que `DireccionPrivada.kt` de la app de Android: las dos rechazan lo mismo.
 */
const { ErrorDeImpresion } = require('./errores');

const OCTETOS = 4;
const GRUPOS_IPV6 = 8;
const MAX_LARGO = 64;
const MAX_DIGITOS_OCTETO = 3;
const MAX_DIGITOS_GRUPO = 4;
const ZONA = /^[A-Za-z0-9_.-]{1,32}$/;
const DIGITOS = /^[0-9]+$/;
const HEXADECIMAL = /^[0-9a-fA-F]+$/;
const CARACTERES_IPV6 = /^[0-9a-fA-F:.]+$/;

/** @typedef {'PERMITIDA' | 'PUBLICA' | 'NO_ES_LITERAL' | 'VACIA'} Veredicto */

const MOTIVOS = {
  VACIA: 'Falta la dirección de la impresora de red',
  NO_ES_LITERAL: 'La impresora de red se indica con su dirección IP completa (por ejemplo 192.168.1.50), no con un nombre',
  PUBLICA: 'Sólo se imprime en red hacia direcciones de tu red local (como 192.168.x.x o 10.x.x.x)',
};

/** Cuatro octetos decimales sin ceros a la izquierda, o `null` si el texto no es exactamente eso. */
function ipv4(texto) {
  const partes = texto.split('.');
  if (partes.length !== OCTETOS) return null;
  const octetos = [];
  for (const parte of partes) {
    if (parte.length === 0 || parte.length > MAX_DIGITOS_OCTETO || !DIGITOS.test(parte)) return null;
    if (parte.length > 1 && parte[0] === '0') return null;
    const valor = Number(parte);
    if (valor > 255) return null;
    octetos.push(valor);
  }
  return octetos;
}

function esPrivadaIpv4([a, b]) {
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

function grupo(texto) {
  if (texto.length === 0 || texto.length > MAX_DIGITOS_GRUPO || !HEXADECIMAL.test(texto)) return null;
  return parseInt(texto, 16);
}

/** Los grupos de un lado de `::`; `null` si alguno está mal escrito. */
function leerLado(lado) {
  if (lado === '') return [];
  const grupos = lado.split(':').map(grupo);
  return grupos.includes(null) ? null : grupos;
}

function expandir(texto) {
  const doble = texto.indexOf('::');
  if (doble !== texto.lastIndexOf('::')) return null;
  if (doble < 0) {
    const grupos = leerLado(texto);
    return grupos && grupos.length === GRUPOS_IPV6 ? grupos : null;
  }
  const izquierda = leerLado(texto.slice(0, doble));
  const derecha = leerLado(texto.slice(doble + 2));
  if (!izquierda || !derecha || izquierda.length + derecha.length > GRUPOS_IPV6 - 1) return null;
  const faltan = GRUPOS_IPV6 - izquierda.length - derecha.length;
  return [...izquierda, ...new Array(faltan).fill(0), ...derecha];
}

/** Los 8 grupos de 16 bits de un literal IPv6, o `null` si el texto no es un IPv6 bien escrito. */
function gruposIpv6(direccion) {
  if (!direccion.includes(':') || direccion.includes(':::') || !CARACTERES_IPV6.test(direccion)) return null;
  // Una cola con IPv4 (`::ffff:1.2.3.4`) vale por dos grupos: se lee aparte y se sustituye por `0:0`.
  const corte = direccion.lastIndexOf(':');
  const cola = direccion.slice(corte + 1);
  let v4 = null;
  if (cola.includes('.')) {
    v4 = ipv4(cola);
    if (!v4) return null;
  }
  const grupos = expandir(v4 ? `${direccion.slice(0, corte + 1)}0:0` : direccion);
  if (grupos && v4) {
    grupos[6] = (v4[0] << 8) | v4[1];
    grupos[7] = (v4[2] << 8) | v4[3];
  }
  return grupos;
}

function esPrivadaIpv6(g, enlaceLocal) {
  const ceros = g.slice(0, 7).every((x) => x === 0);
  if (ceros && g[7] === 1) return true;
  if ((g[0] & 0xfe00) === 0xfc00) return true;
  if (enlaceLocal) return true;
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
    return esPrivadaIpv4([g[6] >> 8, g[6] & 0xff, g[7] >> 8, g[7] & 0xff]);
  }
  return false;
}

function evaluarIpv6(texto) {
  const [direccion, zona] = texto.split(/%(.*)/s);
  if (zona !== undefined && !ZONA.test(zona)) return { veredicto: 'NO_ES_LITERAL' };
  const grupos = gruposIpv6(direccion);
  if (!grupos) return { veredicto: 'NO_ES_LITERAL' };
  const enlaceLocal = (grupos[0] & 0xffc0) === 0xfe80;
  // Una zona sólo tiene sentido en fe80::/10; en cualquier otra dirección es una trampa.
  if (zona !== undefined && !enlaceLocal) return { veredicto: 'NO_ES_LITERAL' };
  return esPrivadaIpv6(grupos, enlaceLocal) ? { veredicto: 'PERMITIDA', literal: texto } : { veredicto: 'PUBLICA' };
}

/**
 * @param {unknown} texto lo que dijo la página (o el perfil guardado)
 * @returns {{ veredicto: Veredicto, literal?: string }} `literal` (sin espacios ni corchetes) sólo si es `PERMITIDA`
 */
function evaluarDireccion(texto) {
  let limpio = typeof texto === 'string' ? texto.trim() : '';
  if (limpio === '') return { veredicto: 'VACIA' };
  if (limpio.length > MAX_LARGO) return { veredicto: 'NO_ES_LITERAL' };
  if (limpio.startsWith('[') && limpio.endsWith(']')) limpio = limpio.slice(1, -1);
  const octetos = ipv4(limpio);
  if (octetos) return esPrivadaIpv4(octetos) ? { veredicto: 'PERMITIDA', literal: limpio } : { veredicto: 'PUBLICA' };
  return evaluarIpv6(limpio);
}

/**
 * El literal permitido, listo para el socket; si no, `ErrorDeImpresion` `NO_SOPORTADO` con el motivo.
 * @param {unknown} texto
 * @returns {string}
 */
function exigirDireccionPrivada(texto) {
  const { veredicto, literal } = evaluarDireccion(texto);
  if (literal === undefined) throw new ErrorDeImpresion('NO_SOPORTADO', MOTIVOS[veredicto]);
  return literal;
}

module.exports = { evaluarDireccion, exigirDireccionPrivada, MOTIVOS };
