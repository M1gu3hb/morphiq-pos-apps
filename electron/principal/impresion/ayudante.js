'use strict';
/**
 * Corre el ayudante de C#: primero `ayudante.exe`; si no arranca (falta .NET 4) o no habla nuestro
 * idioma, el respaldo `powershell -NoProfile -File ayudante.ps1` que compila el mismo `Ayudante.cs`.
 * Los argumentos van a `spawn` SIN shell, así que el nombre de la impresora nunca se interpreta.
 */
const childProcess = require('node:child_process');
const { ErrorDeImpresion, mensajeDeTiempo, codigoValido } = require('./errores');

const ESPERA_POR_OMISION_MS = 15_000;

/**
 * Corre un proceso, junta sus líneas JSON y devuelve la última con `ok`.
 * @returns {Promise<{ resultado: object | null, codigoDeSalida: number | null, falloAlArrancar: boolean }>}
 */
function correrProceso({ spawn, programa, argumentos, esperaMs, alAvance, env }) {
  return new Promise((resolver, rechazar) => {
    let hijo;
    try {
      hijo = spawn(programa, argumentos, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env });
    } catch (error) {
      resolver({ resultado: null, codigoDeSalida: null, fallo: error, fallaAlArrancar: true });
      return;
    }
    let resultado = null;
    let resto = '';
    let vencido = false;
    const plazo = setTimeout(() => {
      vencido = true;
      hijo.kill();
    }, esperaMs);

    const alLinea = (linea) => {
      if (linea.trim() === '') return;
      let dato;
      try {
        dato = JSON.parse(linea);
      } catch {
        // Una línea que no es JSON (ruido de PowerShell, por ejemplo) no es del ayudante: se ignora.
        return;
      }
      if (dato && typeof dato.ok === 'boolean') resultado = dato;
      else if (dato && typeof dato.enviados === 'number' && alAvance) alAvance(dato.enviados, dato.total);
    };
    hijo.stdout.on('data', (trozo) => {
      resto += trozo.toString('utf8');
      const lineas = resto.split(/\r?\n/);
      resto = lineas.pop() ?? '';
      lineas.forEach(alLinea);
    });
    // stderr se vacía para que el proceso no se bloquee; lo que importa viaja en el JSON de stdout.
    hijo.stderr.resume();
    hijo.once('error', (error) => {
      clearTimeout(plazo);
      resolver({ resultado: null, codigoDeSalida: null, fallo: error, fallaAlArrancar: true });
    });
    hijo.once('close', (codigo) => {
      clearTimeout(plazo);
      alLinea(resto);
      if (vencido) rechazar(new ErrorDeImpresion('TIEMPO', mensajeDeTiempo(esperaMs)));
      else resolver({ resultado, codigoDeSalida: codigo, fallaAlArrancar: false });
    });
  });
}

/** El `.exe` ejecutó bien si salió con 0 o con 1 y dejó un JSON suyo; todo lo demás es «no arrancó». */
function exeFunciono({ resultado, codigoDeSalida, fallaAlArrancar }) {
  return !fallaAlArrancar && resultado !== null && (codigoDeSalida === 0 || codigoDeSalida === 1);
}

/**
 * @param {{
 *   rutaExe: string, rutaPs1: string, spawn?: typeof childProcess.spawn, powershell?: string,
 * }} rutas
 */
function crearEjecutorDeAyudante({ rutaExe, rutaPs1, spawn = childProcess.spawn, powershell = 'powershell.exe' }) {
  let usarRespaldo = false;

  /**
   * @param {string[]} argumentos subcomando y sus argumentos
   * @param {{ esperaMs?: number, alAvance?: (enviados: number, total: number) => void, verificarEstado?: boolean }} [opciones]
   * @returns {Promise<object>} el JSON `ok: true` del ayudante; rechaza con `ErrorDeImpresion`
   */
  async function ejecutar(argumentos, opciones = {}) {
    const { esperaMs = ESPERA_POR_OMISION_MS, alAvance, verificarEstado = true } = opciones;
    const env = { ...process.env, MORPHIQ_VERIFICAR_ESTADO: verificarEstado ? '1' : '0' };
    let corrida = null;
    if (!usarRespaldo) {
      corrida = await correrProceso({ spawn, programa: rutaExe, argumentos, esperaMs, alAvance, env });
      if (!exeFunciono(corrida)) usarRespaldo = true;
    }
    if (usarRespaldo) {
      const banderas = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', rutaPs1];
      corrida = await correrProceso({ spawn, programa: powershell, argumentos: [...banderas, ...argumentos], esperaMs, alAvance, env });
    }
    const { resultado, fallo } = corrida;
    if (resultado === null) {
      const motivo = fallo ? fallo.message : 'no contestó';
      throw new ErrorDeImpresion('DESCONOCIDO', `El ayudante de impresión ${motivo}`);
    }
    if (!resultado.ok) throw new ErrorDeImpresion(codigoValido(resultado.codigo), resultado.mensaje ?? 'No se pudo imprimir');
    return resultado;
  }

  return { ejecutar, usandoRespaldo: () => usarRespaldo };
}

module.exports = { crearEjecutorDeAyudante, correrProceso, exeFunciono, ESPERA_POR_OMISION_MS };
