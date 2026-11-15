'use strict';
/**
 * La política de navegación y de permisos. Sólo el dominio del cliente y las pantallas internas
 * navegan dentro de la app; todo lo demás se bloquea o, sin pantalla completa, se manda al
 * navegador del sistema si es https.
 */
const { esOrigenDelCliente, origenPermitido } = require('./origen');

/** Permisos que se conceden, y sólo al origen del cliente. */
const PERMISOS_CONCEDIDOS = new Set(['media', 'fullscreen', 'clipboard-sanitized-write']);

/** ¿Una petición de `media` es sólo de cámara? (el POS escanea QR; el micrófono no se concede) */
function pideSoloVideo(detalles) {
  const tipos = detalles && Array.isArray(detalles.mediaTypes) ? detalles.mediaTypes : [];
  return tipos.length > 0 && tipos.every((t) => t === 'video');
}

/** Decide un permiso. Módulo puro para poder probarlo. */
function permisoConcedido({ permiso, urlSolicitante, detalles, dominio }) {
  if (!PERMISOS_CONCEDIDOS.has(permiso)) return false;
  if (!esOrigenDelCliente(urlSolicitante, dominio)) return false;
  return permiso === 'media' ? pideSoloVideo(detalles) : true;
}

/** @returns {'dentro' | 'afuera' | 'bloqueado'} qué hacer con un destino de navegación */
function decidirDestino({ url, contexto, pantallaCompleta }) {
  if (origenPermitido(url, contexto)) return 'dentro';
  let u;
  try {
    u = new URL(url);
  } catch {
    // Un destino que no es URL no se abre en ningún lado.
    return 'bloqueado';
  }
  if (pantallaCompleta) return 'bloqueado';
  return u.protocol === 'https:' ? 'afuera' : 'bloqueado';
}

/**
 * Aplica la política a un `webContents`: sin webviews, sin ventanas nuevas, sin navegar fuera.
 * @param {import('electron').WebContents} contenidos
 * @param {{
 *   contexto: { dominio: string, carpetaPantallas: string },
 *   esPantallaCompleta: () => boolean,
 *   abrirAfuera: (url: string) => void,
 *   irA: (contenidos: import('electron').WebContents, url: string) => void,
 *   registrar: (mensaje: string) => void,
 * }} deps
 */
function aplicarPoliticaDeNavegacion(contenidos, deps) {
  const { contexto, esPantallaCompleta, abrirAfuera, irA, registrar } = deps;

  const resolver = (url) => {
    const decision = decidirDestino({ url, contexto, pantallaCompleta: esPantallaCompleta() });
    if (decision === 'afuera') abrirAfuera(url);
    else if (decision === 'bloqueado') registrar(`Navegación bloqueada: ${String(url).slice(0, 200)}`);
    return decision;
  };

  contenidos.on('will-attach-webview', (evento) => evento.preventDefault());
  contenidos.setWindowOpenHandler(({ url }) => {
    // Una sola ventana: lo permitido se carga en ESTA ventana; lo demás sale o se bloquea.
    if (resolver(url) === 'dentro' && esOrigenDelCliente(url, contexto.dominio)) irA(contenidos, url);
    return { action: 'deny' };
  });
  const alNavegar = (evento, url) => {
    if (resolver(url) !== 'dentro') evento.preventDefault();
  };
  contenidos.on('will-navigate', alNavegar);
  contenidos.on('will-redirect', alNavegar);
}

/** Pone los manejadores de permisos en una sesión (permisos pedidos y consultados). */
function aplicarPermisos(sesion, dominio) {
  sesion.setPermissionRequestHandler((contenidos, permiso, responder, detalles) => {
    const url = (detalles && detalles.requestingUrl) || contenidos.getURL();
    responder(permisoConcedido({ permiso, urlSolicitante: url, detalles, dominio }));
  });
  sesion.setPermissionCheckHandler((contenidos, permiso, origen, detalles) => {
    const url = (detalles && detalles.requestingUrl) || origen;
    return permisoConcedido({ permiso, urlSolicitante: url, detalles: { mediaTypes: [detalles && detalles.mediaType].filter(Boolean) }, dominio });
  });
  sesion.setDevicePermissionHandler(() => false);
}

/** La ventana oculta de impresión sólo puede pedir datos:, archivos locales y el dominio del cliente. */
function aislarSesionDeImpresion(sesion, dominio) {
  sesion.webRequest.onBeforeRequest((peticion, responder) => {
    const url = peticion.url;
    const permitida = url.startsWith('data:') || url.startsWith('file:') || url.startsWith('blob:') || esOrigenDelCliente(url, dominio);
    responder({ cancel: !permitida });
  });
}

module.exports = {
  aplicarPoliticaDeNavegacion,
  aplicarPermisos,
  aislarSesionDeImpresion,
  decidirDestino,
  permisoConcedido,
  PERMISOS_CONCEDIDOS,
};
