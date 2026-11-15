'use strict';
/** Lectura y escritura atómica de JSON (archivo temporal + renombrar). */
const fs = require('node:fs');
const path = require('node:path');

/**
 * @param {string} ruta
 * @returns {{ existe: boolean, valor: unknown, error?: string }}
 * Un archivo que no existe no es un error; uno que no se puede leer sí se informa.
 */
function leerJson(ruta) {
  let texto;
  try {
    texto = fs.readFileSync(ruta, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') return { existe: false, valor: undefined };
    return { existe: true, valor: undefined, error: `No se pudo leer ${path.basename(ruta)}: ${error.message}` };
  }
  try {
    return { existe: true, valor: JSON.parse(texto) };
  } catch (error) {
    return { existe: true, valor: undefined, error: `${path.basename(ruta)} está dañado: ${error.message}` };
  }
}

/** Escribe `valor` completo o nada: si algo falla a medias, el archivo anterior queda intacto. */
function escribirJsonAtomico(ruta, valor) {
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  const temporal = `${ruta}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporal, `${JSON.stringify(valor, null, 2)}\n`, 'utf8');
    fs.renameSync(temporal, ruta);
  } catch (error) {
    fs.rmSync(temporal, { force: true });
    throw error;
  }
}

module.exports = { leerJson, escribirJsonAtomico };
