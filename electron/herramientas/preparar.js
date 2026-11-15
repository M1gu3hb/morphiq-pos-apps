'use strict';
/** Prepara el cliente (`CLIENTE`, `don-poncho` por omisión) con el script de la raíz del repo. */
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const CLIENTE = process.env.CLIENTE || 'don-poncho';
const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'preparar-cliente.mjs');

function preparar(cliente = CLIENTE) {
  return execFileSync(process.execPath, [SCRIPT, cliente], { encoding: 'utf8' }).trim();
}

if (require.main === module) {
  try {
    console.log(preparar());
  } catch (error) {
    console.error(error.stderr || error.message);
    process.exit(1);
  }
}

module.exports = { preparar };
