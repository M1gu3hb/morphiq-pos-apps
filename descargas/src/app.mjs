import { createHash } from 'node:crypto';
import { detectarAparato } from './aparato.mjs';
import { hojaDeEstilos, paginaDeAviso, paginaDeDescargas } from './pagina.mjs';
import { qrSvg } from './qr.mjs';

/**
 * LAS RUTAS. Independiente de Vercel: recibe { metodo, ruta, cabeceras } y devuelve
 * { estado, cabeceras, cuerpo }.
 *
 *   /           la página (resalta el botón del aparato que la abrió)
 *   /windows    302 al .exe de la versión más nueva
 *   /android    302 al .apk de la versión más nueva
 *   /robots.txt no se indexa nada
 */

const HOST = /^[A-Za-z0-9.-]+(?::\d{1,5})?$/;
const PISTAS = 'Sec-CH-UA-Platform-Version';
/** Un QR por host (la dirección corta, la del despliegue...): pocos, pero con tope. */
const QRS_EN_MEMORIA = 20;

function primero(valor) {
  const texto = Array.isArray(valor) ? valor[0] : valor;
  return typeof texto === 'string' ? texto.split(',')[0].trim() : '';
}

/** «https://sitio/android» para el QR, con el host por el que llegó la visita. */
function direccionAndroid(cabeceras) {
  const host = primero(cabeceras['x-forwarded-host']) || primero(cabeceras.host);
  if (!HOST.test(host)) return null;
  const protocolo = primero(cabeceras['x-forwarded-proto']) === 'http' ? 'http' : 'https';
  return { url: `${protocolo}://${host}/android`, legible: `${host}/android` };
}

export function crearApp({ cliente, estaticos, fuente, avisar = (m, e) => console.error(m, e) }) {
  const estilos = hojaDeEstilos(cliente.colores);
  const huellaEstilos = createHash('sha256').update(estilos).digest('base64');
  const seguridad = {
    // 'unsafe-inline' sólo lo usan los navegadores de CSP 1 (Chrome < 40, WebView de Android 5.0),
    // que no entienden la huella; los demás lo ignoran porque hay huella.
    'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline' 'sha256-${huellaEstilos}'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'X-Robots-Tag': 'noindex, nofollow',
  };
  const qrs = new Map();
  const base = { cliente, estilos, estaticos };

  const html = (estado, cuerpo, extra = {}) => ({
    estado,
    cabeceras: { ...seguridad, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', ...extra },
    cuerpo,
  });

  const aviso = (estado, titulo, mensaje) =>
    html(estado, paginaDeAviso({ ...base, titulo, mensaje }), { 'Cache-Control': 'no-store' });

  function qrPara(url) {
    if (!qrs.has(url)) {
      if (qrs.size >= QRS_EN_MEMORIA) qrs.clear();
      qrs.set(
        url,
        qrSvg(url, {
          oscuro: cliente.colores.fondo,
          claro: cliente.colores.texto,
          titulo: `Código QR para bajar la app de Android: ${url}`,
        }),
      );
    }
    return qrs.get(url);
  }

  async function pagina(cabeceras) {
    const versiones = await fuente.obtener();
    const aparato = detectarAparato({
      // El user agent lleva comas («KHTML, like Gecko»): va entero.
      ua: typeof cabeceras['user-agent'] === 'string' ? cabeceras['user-agent'] : '',
      plataforma: primero(cabeceras['sec-ch-ua-platform']),
      versionPlataforma: primero(cabeceras['sec-ch-ua-platform-version']),
    });
    const destino = direccionAndroid(cabeceras);
    const cuerpo = paginaDeDescargas({
      ...base,
      versiones,
      aparato,
      qr: destino ? qrPara(destino.url) : null,
      direccionQr: destino?.legible ?? null,
    });
    return html(200, cuerpo, {
      'Cache-Control': 'private, no-cache',
      Vary: 'User-Agent, Sec-CH-UA-Platform, Sec-CH-UA-Platform-Version',
      'Accept-CH': PISTAS,
      'Critical-CH': PISTAS,
    });
  }

  async function descarga(plataforma, sistema) {
    const versiones = await fuente.obtener();
    const archivo = versiones?.[plataforma];
    if (!archivo) {
      return aviso(503, `Sin versión para ${sistema}`, `Todavía no hay versión de ${sistema} para descargar.`);
    }
    return {
      estado: 302,
      cabeceras: { ...seguridad, Location: archivo.url, 'Cache-Control': 'no-store' },
      cuerpo: '',
    };
  }

  return async function responder({ metodo, ruta, cabeceras = {} }) {
    if (metodo !== 'GET' && metodo !== 'HEAD') {
      return {
        estado: 405,
        cabeceras: { ...seguridad, Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' },
        cuerpo: 'Sólo GET y HEAD.',
      };
    }
    const limpia = (ruta || '/').replace(/\/+$/, '').toLowerCase() || '/';
    try {
      switch (limpia) {
        case '/':
          return await pagina(cabeceras);
        case '/windows':
          return await descarga('windows', 'Windows');
        case '/android':
          return await descarga('android', 'Android');
        case '/robots.txt':
          return {
            estado: 200,
            cabeceras: { ...seguridad, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
            cuerpo: 'User-agent: *\nDisallow: /\n',
          };
        case '/favicon.ico':
          return {
            estado: 302,
            cabeceras: { ...seguridad, Location: estaticos.icono.ruta, 'Cache-Control': 'public, max-age=86400' },
            cuerpo: '',
          };
        default:
          return aviso(404, 'Esa página no existe', 'La dirección no lleva a ninguna descarga.');
      }
    } catch (error) {
      avisar('descargas: error inesperado', error);
      return aviso(500, 'Algo falló', 'Algo falló al preparar la página. Vuelve a intentar en un momento.');
    }
  };
}
