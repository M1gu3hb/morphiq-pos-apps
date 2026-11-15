'use strict';
/** Estado de una impresora de red con `DLE EOT n` (n = 1, 2 y 4), leyendo un byte de respuesta cada vez. */
const { conectar, PUERTO_POR_OMISION } = require('./red');
const { exigirDireccionPrivada } = require('./direccion');
const { mensajeDeTiempo, traducirError, ErrorDeImpresion } = require('./errores');

const DLE_EOT = (n) => Buffer.from([0x10, 0x04, n]);
const ESPERA_POR_CONSULTA_MS = 1500;
/** Los tres bytes de estado comparten: bit0 = 0, bit1 = 1, bit4 = 1, bit7 = 0. */
const MASCARA_FIJA = 0x93;
const VALOR_FIJO = 0x12;

const BIT = (byte, mascara) => (byte & mascara) !== 0;

/**
 * Interpreta las tres respuestas.
 * @param {{ impresora: number, causaFueraDeLinea: number, papel: number }} b
 * @returns {{ soportado: true, enLinea: boolean, sinPapel: boolean, tapaAbierta: boolean, cajonAbierto: boolean }}
 */
function interpretarEstado(b) {
  return {
    soportado: true,
    // n=1: bit 3 = fuera de línea. bit 2 = señal del cajón (alta = abierto en los cajones más comunes).
    enLinea: !BIT(b.impresora, 0x08),
    cajonAbierto: BIT(b.impresora, 0x04),
    // n=2: bit 2 = tapa abierta.
    tapaAbierta: BIT(b.causaFueraDeLinea, 0x04),
    // n=4: bits 5 y 6 = sensor de papel agotado. (Bits 2 y 3 = poco papel: no es «sin papel».)
    sinPapel: BIT(b.papel, 0x60) || BIT(b.causaFueraDeLinea, 0x20),
  };
}

/** ¿El byte tiene la forma de una respuesta de estado de ESC/POS? */
function esRespuestaDeEstado(byte) {
  return (byte & MASCARA_FIJA) === VALOR_FIJO;
}

/**
 * @param {{ host: string, puerto?: number, esperaMs?: number }} opciones
 * @returns {Promise<object>} un `EstadoDeImpresora`; no rechaza: lo que falla se dice en `mensaje`
 */
async function estadoPorRed({ host, puerto = PUERTO_POR_OMISION, esperaMs = 5000 }) {
  let literal;
  try {
    literal = exigirDireccionPrivada(host);
  } catch (error) {
    // Una dirección que no es de la red local no se consulta: no está «fuera de línea», no se permite.
    return { soportado: false, mensaje: traducirError(error).mensaje };
  }
  let conexion;
  try {
    conexion = await conectar({ host: literal, puerto, esperaMs });
  } catch (error) {
    const { mensaje } = traducirError(error);
    return { soportado: true, enLinea: false, mensaje };
  }
  const { socket, soltar } = conexion;
  const llegados = [];
  let aviso = null;
  socket.on('data', (trozo) => llegados.push(...trozo));
  socket.on('error', (error) => {
    aviso = traducirError(error).mensaje;
  });

  const preguntar = async (n) => {
    const antes = llegados.length;
    socket.write(DLE_EOT(n));
    const limite = Date.now() + ESPERA_POR_CONSULTA_MS;
    while (llegados.length === antes && Date.now() < limite && !socket.destroyed) {
      await new Promise((listo) => setTimeout(listo, 20));
    }
    return llegados.length > antes ? llegados[antes] : null;
  };

  try {
    const impresora = await preguntar(1);
    if (impresora === null) {
      return { soportado: false, mensaje: aviso ?? 'La impresora no contestó a la consulta de estado' };
    }
    if (!esRespuestaDeEstado(impresora)) {
      return { soportado: false, mensaje: 'La impresora contestó algo que no es un estado ESC/POS' };
    }
    const causaFueraDeLinea = (await preguntar(2)) ?? 0x12;
    const papel = (await preguntar(4)) ?? 0x12;
    return interpretarEstado({ impresora, causaFueraDeLinea, papel });
  } catch (error) {
    throw new ErrorDeImpresion('DESCONOCIDO', traducirError(error).mensaje);
  } finally {
    soltar();
    socket.destroy();
  }
}

module.exports = { estadoPorRed, interpretarEstado, esRespuestaDeEstado, mensajeDeTiempo };
