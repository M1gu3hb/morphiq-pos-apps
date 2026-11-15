/**
 * Los tonos de la página salen de los tres colores de la ficha (fondo, texto y acento): los
 * intermedios se mezclan, y el texto sobre el acento es el que más contraste le haga.
 */

function aRgb(hex) {
  const valor = Number.parseInt(hex.slice(1), 16);
  return [(valor >> 16) & 255, (valor >> 8) & 255, valor & 255];
}

function aHex(rgb) {
  return `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}

/** `mezclar(a, b, 0.25)`: un cuarto del camino de a hacia b. */
export function mezclar(a, b, proporcion) {
  const [ra, rb] = [aRgb(a), aRgb(b)];
  return aHex(ra.map((c, i) => c + (rb[i] - c) * proporcion));
}

function luminancia(hex) {
  const [r, g, b] = aRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contraste(a, b) {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (oscuro + 0.05);
}

export function paleta({ fondo, texto, acento }) {
  return {
    fondo,
    texto,
    acento,
    tenue: mezclar(texto, fondo, 0.2),
    tenueMas: mezclar(texto, fondo, 0.35),
    superficie: mezclar(fondo, texto, 0.05),
    superficieActiva: mezclar(fondo, texto, 0.1),
    borde: mezclar(fondo, texto, 0.3),
    acentoHundido: mezclar(acento, fondo, 0.18),
    avisoFondo: mezclar(fondo, acento, 0.14),
    sobreAcento: contraste(texto, acento) >= contraste(fondo, acento) ? texto : fondo,
  };
}
