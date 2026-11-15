'use strict';
/**
 * El servicio de impresión: recibe un `Trabajo` ya validado y lo entrega por la conexión de su
 * destino (spooler, driver, red o serie) dentro de la cola por impresora.
 */
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { crearCola } = require('./cola');
const { bytesDeDocumentoCrudo, validarDestino } = require('./validar');
const { paginaDePrueba, bytesDeCajon, renglonDeReimpresion } = require('./bytes');
const { enviarPorRed, PUERTO_POR_OMISION } = require('./red');
const { estadoPorRed } = require('./estado-red');
const { ErrorDeImpresion, traducirError } = require('./errores');
const { exigirDireccionPrivada } = require('./direccion');
const { crearVerificadorDeImpresoras } = require('./instaladas');

const BAUDIOS_POR_OMISION = 9600;
const ESPERA_POR_OMISION_MS = 10_000;
const BLOQUE_POR_OMISION = 4096;

/** La llave de la cola: un destino = una impresora. */
function claveDeDestino(d) {
  switch (d.conexion) {
    case 'red':
      return `red:${d.host.toLowerCase()}:${d.puerto ?? PUERTO_POR_OMISION}`;
    case 'serial':
      return `serial:${d.puertoSerie.toUpperCase()}`;
    // El driver y el spooler hablan con la misma cola de Windows: se ordenan juntos.
    case 'spooler':
    case 'driver':
      return `windows:${d.nombre.toLowerCase()}`;
    default:
      return `${d.conexion}:${d.nombre ?? d.direccion ?? ''}`;
  }
}

/** Una frase para la página de prueba: por dónde sale. */
function describirDestino(d) {
  switch (d.conexion) {
    case 'red':
      return `red ${d.host}:${d.puerto ?? PUERTO_POR_OMISION}`;
    case 'serial':
      return `serie ${d.puertoSerie}`;
    default:
      return `${d.conexion} ${d.nombre ?? ''}`.trim();
  }
}

function sinSoporte(conexion) {
  const motivos = {
    usb: 'En Windows no hay USB directo: usa la impresora instalada (spooler).',
    bluetooth: 'En Windows el Bluetooth se usa emparejando la impresora: aparece como impresora instalada o como puerto COM.',
  };
  return new ErrorDeImpresion('NO_SOPORTADO', motivos[conexion] ?? `La conexión «${conexion}» no existe en Windows.`);
}

/**
 * @param {{
 *   ayudante: { ejecutar: Function },
 *   imprimirPorDriver: Function,
 *   carpetaTemporal: string,
 *   ajustes: () => { perfil: { destino?: object, cajon?: { base64: string } | null } | null, verificarSpooler?: boolean },
 *   ultimoTicket: { guardar: Function, leer: Function },
 *   cliente: { nombre: string },
 *   emitir: (evento: string, datos: unknown) => void,
 *   enviarPorRed?: typeof enviarPorRed,
 *   estadoPorRed?: typeof estadoPorRed,
 *   verificador?: { exigirInstalada: (nombre: string) => Promise<void> },
 *   ahora?: () => Date,
 * }} dependencias
 */
function crearServicioDeImpresion(dependencias) {
  const { ayudante, imprimirPorDriver, carpetaTemporal, ajustes, ultimoTicket, cliente, emitir } = dependencias;
  const porRed = dependencias.enviarPorRed ?? enviarPorRed;
  const estadoRed = dependencias.estadoPorRed ?? estadoPorRed;
  const ahora = dependencias.ahora ?? (() => new Date());
  // Por spooler y por driver sólo se imprime en lo que Windows tiene instalado (DP-D125).
  const { exigirInstalada } = dependencias.verificador ?? crearVerificadorDeImpresoras({ ayudante });

  /** Escribe los bytes a un archivo temporal, corre `fn(ruta)` y lo borra SIEMPRE. */
  async function conArchivoTemporal(bytes, fn) {
    fs.mkdirSync(carpetaTemporal, { recursive: true });
    const ruta = path.join(carpetaTemporal, `${randomUUID()}.bin`);
    fs.writeFileSync(ruta, bytes);
    try {
      return await fn(ruta);
    } finally {
      fs.rmSync(ruta, { force: true });
    }
  }

  /** Entrega UNA copia de un documento por la conexión del destino. */
  async function entregarCopia({ id, destino, documento, esperaMs }) {
    const alProgreso = (enviados, total) => emitir('progreso', { id, enviados, total });
    if (documento.tipo === 'html') {
      if (destino.conexion !== 'driver') {
        throw new ErrorDeImpresion('NO_SOPORTADO', 'Los documentos html sólo se imprimen con la conexión «driver».');
      }
      await exigirInstalada(destino.nombre);
      return imprimirPorDriver({ nombre: destino.nombre, html: documento.html, anchoMm: documento.anchoMm, esperaMs });
    }
    if (destino.conexion === 'driver') {
      throw new ErrorDeImpresion('NO_SOPORTADO', 'El driver de Windows sólo imprime documentos html.');
    }
    if (destino.conexion === 'usb' || destino.conexion === 'bluetooth') throw sinSoporte(destino.conexion);
    const bytes = bytesDeDocumentoCrudo(documento);
    const bloqueBytes = documento.bloqueBytes ?? BLOQUE_POR_OMISION;
    const pausaMs = documento.pausaMs ?? 0;
    if (destino.conexion === 'red') {
      // Lo que se valida es lo mismo que se le da al socket: el literal ya limpio.
      return porRed({ host: exigirDireccionPrivada(destino.host), puerto: destino.puerto, datos: bytes, bloqueBytes, pausaMs, esperaMs, alProgreso });
    }
    if (destino.conexion === 'spooler') await exigirInstalada(destino.nombre);
    const verificarEstado = ajustes().verificarSpooler !== false;
    const comun = [String(bloqueBytes), String(pausaMs)];
    return conArchivoTemporal(bytes, async (ruta) => {
      const argumentos =
        destino.conexion === 'serial'
          ? ['serie', destino.puertoSerie.toUpperCase(), String(destino.baudios ?? BAUDIOS_POR_OMISION), ruta, ...comun]
          : ['crudo', destino.nombre, ruta, ...comun];
      await ayudante.ejecutar(argumentos, { esperaMs, alAvance: alProgreso, verificarEstado });
      return { bytes: bytes.length };
    });
  }

  const cola = crearCola({
    entregar: (trabajo, copia) => entregarCopia({ ...trabajo, copia }),
  });

  /** El destino del trabajo, o el del perfil guardado, o `SIN_PERFIL`. */
  function destinoDe(destino) {
    if (destino) return destino;
    const delPerfil = ajustes().perfil?.destino;
    if (!delPerfil) throw new ErrorDeImpresion('SIN_PERFIL', 'Falta elegir la impresora en este aparato');
    try {
      // El perfil lo guardó la página: se vuelve a validar antes de usarlo.
      return validarDestino(delPerfil);
    } catch {
      throw new ErrorDeImpresion('SIN_PERFIL', 'La impresora guardada en este aparato no es válida');
    }
  }

  /** Mete un trabajo ya armado a la cola; un destino que falta se vuelve resultado de error. */
  function encolar(trabajo, destino) {
    let resuelto;
    try {
      resuelto = destinoDe(destino);
    } catch (error) {
      return Promise.resolve(resultadoDeError(trabajo.id, error));
    }
    return cola.encolar(claveDeDestino(resuelto), { ...trabajo, destino: resuelto });
  }

  function resultadoDeError(id, error) {
    const { codigo, mensaje } = traducirError(error);
    return { ok: false, id, estado: 'error', codigo, mensaje };
  }

  const crudo = (bytes) => ({ tipo: 'crudo', base64: bytes.toString('base64') });

  return {
    claveDeDestino,
    /** @param {object} trabajo un `Trabajo` ya validado */
    imprimir(trabajo) {
      if (trabajo.recordar) ultimoTicket.guardar(trabajo.recordar);
      return encolar({ id: trabajo.id, documento: trabajo.documento, copias: trabajo.copias, esperaMs: trabajo.esperaMs }, trabajo.destino);
    },
    paginaDePrueba(destinoDado) {
      let destino;
      try {
        destino = destinoDe(destinoDado);
      } catch (error) {
        return Promise.resolve(resultadoDeError(`prueba-${randomUUID()}`, error));
      }
      const bytes = paginaDePrueba({ cliente: cliente.nombre, conexion: describirDestino(destino), fecha: ahora() });
      return encolar({ id: `prueba-${randomUUID()}`, documento: crudo(bytes), copias: 1, esperaMs: ESPERA_POR_OMISION_MS }, destino);
    },
    abrirCajon({ destino, base64 } = {}) {
      const base = base64 ?? ajustes().perfil?.cajon?.base64;
      return encolar({ id: `cajon-${randomUUID()}`, documento: crudo(bytesDeCajon(base)), copias: 1, esperaMs: ESPERA_POR_OMISION_MS }, destino);
    },
    /** Reimprime el último ticket guardado con su renglón de «REIMPRESIÓN». */
    reimprimirUltimo() {
      const ticket = ultimoTicket.leer();
      if (!ticket) {
        return Promise.resolve({ ok: false, id: '', estado: 'error', codigo: 'DESCONOCIDO', mensaje: 'Todavía no hay un ticket guardado' });
      }
      const original = bytesDeDocumentoCrudo(ticket.documento);
      const bytes = Buffer.concat([renglonDeReimpresion(ahora()), original]);
      return encolar(
        {
          id: `reimpresion-${randomUUID()}`,
          documento: { ...ticket.documento, base64: bytes.toString('base64') },
          copias: 1,
          esperaMs: ESPERA_POR_OMISION_MS,
        },
        undefined,
      );
    },
    async estado(destinoDado) {
      let destino;
      try {
        destino = destinoDe(destinoDado);
      } catch (error) {
        return { soportado: false, mensaje: traducirError(error).mensaje };
      }
      if (destino.conexion === 'red') return estadoRed({ host: destino.host, puerto: destino.puerto });
      if (destino.conexion === 'spooler' || destino.conexion === 'driver') {
        try {
          await exigirInstalada(destino.nombre);
          const r = await ayudante.ejecutar(['estado', destino.nombre], { esperaMs: 8000 });
          return { soportado: true, enLinea: !r.fueraDeLinea, sinPapel: r.sinPapel, tapaAbierta: r.tapaAbierta };
        } catch (error) {
          return { soportado: true, enLinea: false, mensaje: traducirError(error).mensaje };
        }
      }
      if (destino.conexion === 'serial') return { soportado: false, mensaje: 'Por puerto serie no se puede preguntar el estado.' };
      return { soportado: false, mensaje: sinSoporte(destino.conexion).message };
    },
    describirDestino,
  };
}

module.exports = { crearServicioDeImpresion, claveDeDestino, describirDestino };
