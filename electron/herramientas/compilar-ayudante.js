'use strict';
/** Compila `ayudante/Ayudante.cs` a `compilado/ayudante.exe` con el csc.exe de .NET Framework 4 de Windows. */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const CSC = path.join(process.env.WINDIR || 'C:\Windows', 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe');
const FUENTE = path.join(RAIZ, 'ayudante', 'Ayudante.cs');
const SALIDA = path.join(RAIZ, 'compilado', 'ayudante.exe');

function compilarAyudante() {
  if (!fs.existsSync(CSC)) throw new Error(`No existe ${CSC}: hace falta .NET Framework 4 para compilar el ayudante.`);
  fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
  const salida = execFileSync(
    CSC,
    ['/nologo', '/target:exe', '/optimize+', '/platform:anycpu', `/out:${SALIDA}`, '/reference:System.dll', FUENTE],
    { encoding: 'utf8', windowsHide: true },
  );
  return { salida, ruta: SALIDA };
}

if (require.main === module) {
  try {
    const { ruta } = compilarAyudante();
    console.log(`Ayudante compilado: ${ruta}`);
  } catch (error) {
    console.error(error.stdout || error.message);
    process.exit(1);
  }
}

module.exports = { compilarAyudante, SALIDA };
