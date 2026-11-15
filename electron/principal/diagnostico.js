'use strict';
/** El diagnóstico del aparato: sólo datos leídos; lo que no se pueda leer va en `avisos`. */
const os = require('node:os');
const childProcess = require('node:child_process');

const BITS_DE_ARQUITECTURA = { x64: 64, arm64: 64, ia32: 32, arm: 32 };
const WINDOWS_11_DESDE_BUILD = 22000;
const BYTES_POR_MB = 1024 * 1024;

/** Lee un valor de texto del registro con `reg.exe` (rápido y sin PowerShell). `null` si no se pudo. */
function leerRegistro(clave, valor, ejecutar = childProcess.execFile) {
  return new Promise((resolver) => {
    ejecutar('reg.exe', ['query', clave, '/v', valor], { windowsHide: true, timeout: 4000 }, (error, salida) => {
      if (error) return resolver(null);
      const linea = String(salida).split(/\r?\n/).find((l) => l.trim().startsWith(valor));
      const partes = linea ? linea.trim().split(/\s{2,}|\t/) : [];
      resolver(partes.length >= 3 ? partes.slice(2).join(' ').trim() : null);
    });
  });
}

/** «Windows 10 Home Single Language»; el registro sigue diciendo «Windows 10» en Windows 11, se corrige por el build. */
function nombreDeWindows(productName, build) {
  if (!productName) return 'Windows';
  return Number(build) >= WINDOWS_11_DESDE_BUILD ? productName.replace('Windows 10', 'Windows 11') : productName;
}

function bitsDelSistema(arquitectura, entorno = process.env) {
  // Un proceso de 32 bits en Windows de 64 ve PROCESSOR_ARCHITEW6432.
  if (arquitectura === 'ia32' && entorno.PROCESSOR_ARCHITEW6432) return 64;
  return BITS_DE_ARQUITECTURA[arquitectura] ?? 64;
}

/** Las impresoras instaladas, con la forma del contrato. */
function impresorasDelListado(listado) {
  return (listado.impresoras ?? []).map((p) => ({
    id: `spooler:${p.nombre}`,
    nombre: p.nombre,
    destino: { conexion: 'spooler', nombre: p.nombre },
    detalle: [p.puerto, p.driver].filter(Boolean).join(' · '),
    predeterminada: Boolean(p.predeterminada),
  }));
}

/**
 * @param {{
 *   cliente: import('./contexto').Cliente, screen: import('electron').Screen,
 *   ayudante: { ejecutar: Function }, modoLigero: () => object, avisosPrevios?: string[],
 *   leerRegistro?: typeof leerRegistro,
 * }} deps
 * @returns {() => Promise<object>} un `Diagnostico`
 */
function crearDiagnostico({ cliente, screen, ayudante, modoLigero, avisosPrevios = [], leerRegistro: leer = leerRegistro }) {
  return async function diagnostico() {
    const avisos = [...avisosPrevios];
    const VERSION = 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion';
    const BIOS = 'HKLM\\HARDWARE\\DESCRIPTION\\System\\BIOS';
    const [producto, build, fabricante, modelo, listado] = await Promise.all([
      leer(VERSION, 'ProductName'),
      leer(VERSION, 'CurrentBuildNumber'),
      leer(BIOS, 'SystemManufacturer'),
      leer(BIOS, 'SystemProductName'),
      ayudante.ejecutar(['listar'], { esperaMs: 15_000 }).catch((error) => {
        avisos.push(`Impresoras: ${error.message}`);
        return { impresoras: [] };
      }),
    ]);
    if (!producto) avisos.push('Sistema: no se pudo leer la edición de Windows.');
    if (!fabricante && !modelo) avisos.push('Equipo: no se pudo leer el fabricante ni el modelo.');

    const cpus = os.cpus();
    if (cpus.length === 0) avisos.push('Procesador: Windows no dijo cuál es.');
    const pantalla = screen.getPrimaryDisplay();
    const escala = pantalla.scaleFactor || 1;

    return {
      app: { nombre: cliente.nombre, version: cliente.version, cliente: cliente.id },
      plataforma: 'windows',
      sistema: {
        nombre: nombreDeWindows(producto, build),
        version: os.release(),
        bits: bitsDelSistema(process.arch),
        ...(fabricante ? { marca: fabricante } : {}),
        ...(modelo ? { modelo } : {}),
      },
      memoria: { totalMb: Math.round(os.totalmem() / BYTES_POR_MB), libreMb: Math.round(os.freemem() / BYTES_POR_MB) },
      procesador: {
        nombre: cpus.length > 0 ? cpus[0].model.trim() : 'Desconocido',
        nucleos: cpus.length,
        arquitectura: process.arch,
      },
      pantalla: {
        anchoPx: Math.round(pantalla.size.width * escala),
        altoPx: Math.round(pantalla.size.height * escala),
        escala,
        tactil: pantalla.touchSupport === 'available',
      },
      navegador: { nombre: 'Chromium', version: process.versions.chrome },
      impresoras: impresorasDelListado(listado),
      modoLigero: modoLigero(),
      avisos,
    };
  };
}

module.exports = { crearDiagnostico, impresorasDelListado, leerRegistro, nombreDeWindows, bitsDelSistema };
