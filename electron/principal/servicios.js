'use strict';
/** Los métodos del contrato `window.MorphiqApp` v1, tal como los atiende el proceso principal. */
const os = require('node:os');
const { decidirModoLigero } = require('./modo-ligero');
const { validarTrabajo, validarDestino } = require('./impresion/validar');
const { ErrorDeUso } = require('./impresion/errores');
const { impresorasDelListado } = require('./diagnostico');

const BYTES_POR_MB = 1024 * 1024;
const MOTIVO_NO_USB = 'En Windows no hay USB directo: usa la impresora instalada (spooler).';
const MOTIVO_NO_BLUETOOTH = 'En Windows el Bluetooth se usa emparejando la impresora: aparece como impresora instalada o como puerto COM.';

/** Qué conexiones puede usar Windows y por qué no las demás. */
function conexionesDeWindows() {
  return [
    { conexion: 'spooler', disponible: true },
    { conexion: 'driver', disponible: true },
    { conexion: 'red', disponible: true },
    { conexion: 'serial', disponible: true },
    { conexion: 'usb', disponible: false, motivo: MOTIVO_NO_USB },
    { conexion: 'bluetooth', disponible: false, motivo: MOTIVO_NO_BLUETOOTH },
  ];
}

/** Opciones `{ destino? }` o `{ destino?, base64? }`: sólo esas llaves, ya validadas. */
function validarOpciones(opciones, { conBase64 = false } = {}) {
  if (opciones === undefined || opciones === null) return {};
  if (typeof opciones !== 'object' || Array.isArray(opciones)) throw new ErrorDeUso('Las opciones deben ser un objeto.');
  const limpias = {};
  if (opciones.destino !== undefined) limpias.destino = validarDestino(opciones.destino);
  if (conBase64 && opciones.base64 !== undefined) {
    if (typeof opciones.base64 !== 'string' || opciones.base64.length > 4096) throw new ErrorDeUso('«base64» debe ser texto corto.');
    limpias.base64 = opciones.base64;
  }
  return limpias;
}

/**
 * @param {{
 *   cliente: import('./contexto').Cliente,
 *   ajustes: { leer: () => Record<string, unknown>, guardar: (parche: object) => Record<string, unknown> },
 *   servicio: ReturnType<typeof import('./impresion/servicio').crearServicioDeImpresion>,
 *   ultimoTicket: { leer: () => { titulo: string, guardadoEn: string } | null },
 *   diagnostico: () => Promise<object>,
 *   ayudante: { ejecutar: Function },
 *   actualizador: { buscar: () => Promise<object>, instalar: () => object },
 *   ventana: { cargarPos: () => Promise<void>, cargarPantalla: (n: string) => Promise<void> },
 *   aplicarAjustes: (parche: object, nuevos: object) => void,
 *   registrar: (mensaje: string) => void,
 * }} deps
 */
function crearMetodos(deps) {
  const { cliente, ajustes, servicio, ultimoTicket, diagnostico, ayudante, actualizador, ventana, aplicarAjustes, registrar } = deps;

  const modoLigero = () =>
    decidirModoLigero({
      ramTotalMb: Math.round(os.totalmem() / BYTES_POR_MB),
      nucleos: os.cpus().length,
      manual: ajustes.leer().modoLigero,
    });

  const irA = (carga) => {
    carga().catch((error) => registrar(`No se pudo abrir la pantalla: ${error.message}`));
  };

  const metodos = {
    version: () => cliente.version,
    plataforma: () => 'windows',
    diagnostico,
    impresoras: async () => impresorasDelListado(await ayudante.ejecutar(['listar'], { esperaMs: 15_000 })),
    conexiones: () => conexionesDeWindows(),
    pedirPermiso: () => ({ concedido: true, mensaje: 'Windows no pide permiso para imprimir.' }),

    ajustes: () => ajustes.leer(),
    guardarAjustes: (parche) => {
      const nuevos = ajustes.guardar(parche);
      aplicarAjustes(parche, nuevos);
      return nuevos;
    },

    imprimir: (trabajo) => servicio.imprimir(validarTrabajo(trabajo)),
    abrirCajon: (opciones) => servicio.abrirCajon(validarOpciones(opciones, { conBase64: true })),
    paginaDePrueba: (opciones) => servicio.paginaDePrueba(validarOpciones(opciones).destino),
    estado: (opciones) => servicio.estado(validarOpciones(opciones).destino),
    reimprimirUltimo: () => servicio.reimprimirUltimo(),
    ultimoTicket: () => {
      const ticket = ultimoTicket.leer();
      return ticket ? { titulo: ticket.titulo, guardadoEn: ticket.guardadoEn } : null;
    },

    buscarActualizacion: () => actualizador.buscar(),
    instalarActualizacion: () => actualizador.instalar(),
    modoLigero,

    abrirPos: () => {
      if (!ajustes.leer().primerArranqueHecho) ajustes.guardar({ primerArranqueHecho: true });
      irA(() => ventana.cargarPos());
    },
    abrirDiagnostico: () => irA(() => ventana.cargarPantalla('diagnostico')),
  };
  return { metodos, modoLigero };
}

module.exports = { crearMetodos, conexionesDeWindows, validarOpciones };
