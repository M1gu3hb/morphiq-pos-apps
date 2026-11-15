'use strict';
/** Un registro de texto en `userData` (se rota al pasar de medio MB) y en la consola. */
const fs = require('node:fs');
const path = require('node:path');

const MAX_BYTES = 512 * 1024;

/** @param {string} ruta archivo del registro */
function crearRegistro(ruta) {
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  return function registrar(mensaje) {
    const linea = `${new Date().toISOString()} ${mensaje}\n`;
    console.warn(`[morphiq] ${mensaje}`);
    try {
      if (fs.existsSync(ruta) && fs.statSync(ruta).size > MAX_BYTES) fs.renameSync(ruta, `${ruta}.1`);
      fs.appendFileSync(ruta, linea, 'utf8');
    } catch (error) {
      // El registro nunca debe tumbar la app: se avisa en la consola y se sigue.
      console.error(`[morphiq] no se pudo escribir el registro: ${error.message}`);
    }
  };
}

module.exports = { crearRegistro };
