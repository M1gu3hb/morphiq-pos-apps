import { escapar, formatearFecha, formatearTamano } from './formato.mjs';
import { paleta } from './colores.mjs';

/**
 * LA PÁGINA, ya hecha desde el servidor: HTML y un CSS en línea, sin JavaScript, sin fuentes
 * externas y sin animaciones. Pensada para Chrome viejo: nada de variables CSS, `grid`, `gap`,
 * `clamp()` ni `:focus-visible`. Las descargas son enlaces normales, así que bajan aunque el
 * JavaScript esté apagado.
 */

const LETRA = "'Segoe UI', Roboto, 'Noto Sans', 'Helvetica Neue', Arial, sans-serif";
const MONO = "Consolas, 'Roboto Mono', 'Courier New', monospace";

export function hojaDeEstilos(colores) {
  const c = paleta(colores);
  return [
    '*{box-sizing:border-box}',
    `html{background:${c.fondo};-webkit-text-size-adjust:100%;text-size-adjust:100%}`,
    `body{margin:0;background:${c.fondo};color:${c.texto};font-family:${LETRA};font-size:18px;line-height:1.5}`,
    `a{color:${c.texto}}`,
    `a:focus{outline:3px solid ${c.texto};outline-offset:3px}`,
    '.pagina{max-width:720px;margin:0 auto;padding:20px 16px 28px}',
    `.cabecera{text-align:center;padding:0 0 18px;margin:0 0 22px;border-bottom:2px solid ${c.acento}}`,
    '.cabecera img{display:block;width:180px;max-width:60%;height:auto;margin:0 auto 10px}',
    'h1{margin:0;font-size:30px;line-height:1.15;letter-spacing:-0.01em}',
    `.bajada{margin:4px 0 0;color:${c.tenue};font-size:18px}`,
    `.aviso{margin:0 0 18px;padding:14px 16px;border:2px solid ${c.acento};border-radius:10px;background:${c.avisoFondo};font-size:19px;line-height:1.4}`,
    '.aviso p{margin:0}',
    '.aviso p+p{margin-top:10px}',
    '.aviso a{font-weight:700}',
    '.descargas{margin:0 0 30px}',
    `.boton{display:block;min-height:64px;margin:0 0 14px;padding:16px 18px;border:2px solid ${c.borde};border-radius:10px;background:${c.superficie};color:${c.texto};text-decoration:none}`,
    `.boton:hover{border-color:${c.texto}}`,
    `.boton:focus{outline:3px solid ${c.texto};outline-offset:3px}`,
    `.boton:active{background:${c.superficieActiva}}`,
    '.boton-titulo{display:block;font-size:22px;font-weight:700;line-height:1.25}',
    `.boton-datos{display:block;margin-top:4px;font-size:16px;color:${c.tenue}}`,
    `.boton-marca{display:inline-block;margin:0 0 8px;padding:2px 8px;border-radius:6px;background:${c.texto};color:${c.fondo};font-size:14px;font-weight:700;line-height:1.4}`,
    `.boton-este{border-color:${c.acento}}`,
    `.boton-principal{background:${c.acento};border-color:${c.acento};color:${c.sobreAcento}}`,
    `.boton-principal .boton-datos{color:${c.sobreAcento}}`,
    `.boton-principal:hover{background:${c.acentoHundido};border-color:${c.texto}}`,
    `.boton-principal:active{background:${c.acentoHundido}}`,
    `.boton-sin-version{color:${c.tenue}}`,
    `.qr{margin:0 0 30px;padding:18px;border:1px solid ${c.borde};border-radius:10px;text-align:center}`,
    '.qr-codigo{display:block;max-width:100%;height:auto;margin:0 auto 12px}',
    'h2{margin:0 0 6px;font-size:22px;line-height:1.25}',
    '.qr p{margin:0}',
    `.direccion{margin-top:6px;font-family:${MONO};font-size:16px;color:${c.tenue};word-wrap:break-word}`,
    '.pasos{margin:0 0 30px}',
    '.paso{margin:14px 0 0}',
    'h3{margin:0 0 4px;font-size:19px}',
    '.paso ol{margin:0;padding-left:26px}',
    '.paso li{margin:0 0 6px}',
    `.pie{padding-top:16px;border-top:1px solid ${c.borde};color:${c.tenue};font-size:15px}`,
    '.pie p{margin:0 0 10px}',
    `.huella{font-size:13px;line-height:1.4;color:${c.tenueMas}}`,
    `.huella code{display:block;font-family:${MONO};word-wrap:break-word;word-break:break-all}`,
    `.firma{margin-top:18px;font-size:13px;color:${c.tenueMas}}`,
    '@media (min-width:640px){',
    '.pagina{padding:28px 24px 32px}',
    'h1{font-size:34px}',
    '.qr{display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-align:center;-webkit-align-items:center;align-items:center;text-align:left}',
    '.qr-codigo{margin:0 22px 0 0;-webkit-flex-shrink:0;flex-shrink:0}',
    '}',
  ].join('\n');
}

const PLATAFORMAS = {
  windows: { titulo: 'Descargar para Windows (.exe)', sistema: 'Windows' },
  android: { titulo: 'Descargar para Android (.apk)', sistema: 'Android' },
};

function datosDelArchivo(archivo, zona) {
  return [
    `Versión ${archivo.version}`,
    formatearFecha(archivo.fecha, zona),
    formatearTamano(archivo.tamano),
  ]
    .filter(Boolean)
    .join(', ');
}

function boton(plataforma, archivo, aparato, zona) {
  const { titulo, sistema } = PLATAFORMAS[plataforma];
  if (!archivo) {
    return (
      `<div class="boton boton-sin-version" data-plataforma="${plataforma}">` +
      `<span class="boton-titulo">${escapar(sistema)}</span>` +
      '<span class="boton-datos">Todavía no hay versión para descargar.</span></div>'
    );
  }
  const esEste = aparato.tipo === plataforma;
  const clases = ['boton'];
  let marca = '';
  if (esEste && aparato.compatible) {
    clases.push('boton-este', 'boton-principal');
    marca = 'Para este aparato';
  } else if (esEste) {
    clases.push('boton-este');
    marca = `No corre en este ${sistema}`;
  }
  return (
    `<a class="${clases.join(' ')}" href="/${plataforma}" data-plataforma="${plataforma}"${esEste ? ' data-este="si"' : ''}>` +
    (marca ? `<span class="boton-marca">${escapar(marca)}</span>` : '') +
    `<span class="boton-titulo">${escapar(titulo)}</span>` +
    `<span class="boton-datos">${escapar(datosDelArchivo(archivo, zona))}</span>` +
    '</a>'
  );
}

function aviso(aparato, cliente) {
  if (aparato.tipo === 'iphone') {
    return (
      '<div class="aviso" role="note" data-aviso="iphone">' +
      '<p>En iPhone no se instala: abre el POS en Safari y usa “Agregar a inicio”.</p>' +
      `<p><a href="${escapar(cliente.url)}">Abrir el POS</a></p></div>`
    );
  }
  if (aparato.compatible) return '';
  const tiene = aparato.nombre ? `Este aparato tiene ${aparato.nombre}. ` : '';
  const mensaje =
    aparato.tipo === 'windows' ? 'Esta app necesita Windows 10 o más nuevo.' : 'Necesita Android 6 o más nuevo.';
  return `<div class="aviso" role="note" data-aviso="${aparato.tipo}-viejo"><p>${escapar(tiene + mensaje)}</p></div>`;
}

function huellas(versiones) {
  const lineas = ['windows', 'android']
    .map((p) => versiones?.[p])
    .filter((archivo) => archivo?.sha256)
    .map(
      (archivo) =>
        `<p class="huella">SHA-256 de ${escapar(archivo.archivo)}<code>${escapar(archivo.sha256)}</code></p>`,
    );
  return lineas.join('');
}

function documento({ cliente, estilos, estaticos, titulo, cuerpo }) {
  return (
    '<!DOCTYPE html>\n<html lang="es-MX">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<meta name="robots" content="noindex, nofollow">\n' +
    `<meta name="theme-color" content="${cliente.colores.fondo}">\n` +
    `<title>${escapar(titulo)}</title>\n` +
    `<link rel="icon" type="image/png" href="${estaticos.icono.ruta}">\n` +
    `<style>${estilos}</style>\n</head>\n<body>\n<main class="pagina">\n${cuerpo}\n</main>\n</body>\n</html>\n`
  );
}

function cabecera(cliente, estaticos, bajada) {
  const { logo } = estaticos;
  return (
    '<header class="cabecera">' +
    `<img src="${logo.ruta}" width="${logo.ancho}" height="${logo.alto}" alt="${escapar(cliente.nombreCorto)}">` +
    `<h1>${escapar(cliente.nombre)}</h1>` +
    `<p class="bajada">${escapar(bajada)}</p></header>`
  );
}

/**
 * @param {object} p
 * @param {object} p.cliente     datosDePagina(ficha)
 * @param {string} p.estilos     hojaDeEstilos(...)
 * @param {object} p.estaticos   { logo: { ruta, ancho, alto }, icono: { ruta } }
 * @param {object|null} p.versiones  lo que dio la fuente: { windows, android }
 * @param {object} p.aparato     detectarAparato(...)
 * @param {string|null} p.qr     el SVG del código, o null
 * @param {string|null} p.direccionQr  «sitio/android», para leerla
 */
export function paginaDeDescargas({ cliente, estilos, estaticos, versiones, aparato, qr, direccionQr }) {
  const zona = cliente.zonaHoraria;
  const orden = aparato.tipo === 'android' ? ['android', 'windows'] : ['windows', 'android'];
  const botones = orden.map((p) => boton(p, versiones?.[p] ?? null, aparato, zona)).join('');
  const sinNada = !versiones?.windows && !versiones?.android;
  const releases = `https://github.com/${cliente.repo}/releases`;

  const partes = [
    cabecera(cliente, estaticos, 'La app del punto de venta, para Windows y Android.'),
    aviso(aparato, cliente),
    sinNada
      ? `<div class="aviso" role="note"><p>Ahora no pudimos leer las versiones. Bájalas de <a href="${releases}">los Releases</a>.</p></div>`
      : '',
    `<section class="descargas" aria-label="Descargas">${botones}</section>`,
  ];

  if (qr && versiones?.android) {
    partes.push(
      `<section class="qr">${qr}<div>` +
        '<h2>Pásala a un teléfono</h2>' +
        '<p>Escanea el código con la cámara de un teléfono Android y se baja la app.</p>' +
        `<p class="direccion">${escapar(direccionQr)}</p></div></section>`,
    );
  }

  partes.push(
    '<section class="pasos" aria-labelledby="pasos-titulo"><h2 id="pasos-titulo">Cómo se instala</h2>' +
      '<div class="paso"><h3>Windows</h3><ol>' +
      '<li>Abre el archivo que bajaste.</li>' +
      '<li>Si sale «Windows protegió su PC», toca «Más información» y luego «Ejecutar de todas formas».</li>' +
      '<li>Se instala sola y se abre. Las actualizaciones llegan solas.</li>' +
      '</ol></div>' +
      '<div class="paso"><h3>Android</h3><ol>' +
      '<li>Abre el archivo que bajaste.</li>' +
      '<li>Si Android pregunta por «apps desconocidas», toca «Ajustes», enciende «Permitir desde esta fuente» y regresa.</li>' +
      '<li>Toca «Instalar». Cuando la app avise que hay actualización, toca «Actualizar» y luego «Instalar».</li>' +
      '</ol></div></section>',
    `<footer class="pie">${huellas(versiones)}` +
      `<p><a href="${releases}">Versiones anteriores</a></p>` +
      `<p class="firma">${escapar(cliente.firma)}</p></footer>`,
  );

  return documento({ cliente, estilos, estaticos, titulo: `Descargar ${cliente.nombre}`, cuerpo: partes.join('\n') });
}

/** 404 y «todavía no hay versión»: con salida a la página principal, nunca en blanco. */
export function paginaDeAviso({ cliente, estilos, estaticos, titulo, mensaje }) {
  const cuerpo =
    cabecera(cliente, estaticos, titulo) +
    `\n<div class="aviso" role="note"><p>${escapar(mensaje)}</p>` +
    '<p><a href="/">Ir a las descargas</a></p></div>' +
    `\n<footer class="pie"><p class="firma">${escapar(cliente.firma)}</p></footer>`;
  return documento({ cliente, estilos, estaticos, titulo: `${titulo} · ${cliente.nombre}`, cuerpo });
}
