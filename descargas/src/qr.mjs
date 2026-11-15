import qrcode from 'qrcode-generator';
import { escapar } from './formato.mjs';

const MARGEN_MODULOS = 4;
const LADO_DESEADO_PX = 220;

/**
 * Un código QR como SVG en línea: un solo <path> con una tira por cada racha de módulos oscuros,
 * sin JavaScript ni imágenes. El lado es múltiplo exacto de los módulos para que se vea nítido.
 */
export function qrSvg(texto, { oscuro, claro, titulo }) {
  const qr = qrcode(0, 'M');
  qr.addData(texto);
  qr.make();
  const modulos = qr.getModuleCount();
  const total = modulos + MARGEN_MODULOS * 2;
  const lado = Math.max(1, Math.floor(LADO_DESEADO_PX / total)) * total;

  let trazo = '';
  for (let fila = 0; fila < modulos; fila += 1) {
    let columna = 0;
    while (columna < modulos) {
      if (!qr.isDark(fila, columna)) {
        columna += 1;
        continue;
      }
      const inicio = columna;
      while (columna < modulos && qr.isDark(fila, columna)) columna += 1;
      const largo = columna - inicio;
      trazo += `M${inicio + MARGEN_MODULOS} ${fila + MARGEN_MODULOS}h${largo}v1h-${largo}z`;
    }
  }

  return (
    `<svg class="qr-codigo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" ` +
    `width="${lado}" height="${lado}" role="img" aria-labelledby="qr-titulo" shape-rendering="crispEdges">` +
    `<title id="qr-titulo">${escapar(titulo)}</title>` +
    `<rect width="${total}" height="${total}" fill="${claro}"/>` +
    `<path fill="${oscuro}" d="${trazo}"/></svg>`
  );
}
