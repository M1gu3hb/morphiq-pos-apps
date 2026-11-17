'use strict';
/**
 * Preload: expone `window.MorphiqApp` (contrato v1) SÓLO si el proceso principal confirma que la
 * página es el POS del cliente o una pantalla interna. Con `sandbox: true` este archivo sólo puede
 * pedir `electron`. Cada método viaja por IPC y el principal vuelve a revisar el origen.
 *
 * Un rechazo es un objeto `{ name, codigo, message }` con el código (`ORIGEN`, `ARGUMENTOS`,
 * `DESCONOCIDO`) y NO un `Error`: `contextBridge` tira el `name` y las propiedades propias de un
 * `Error` (sólo deja el `message`), pero conserva las de un objeto plano. (`escuchar` es síncrono: ahí
 * un argumento inválido lanza un `Error` normal y sólo llega el `message`.)
 */
const { contextBridge, ipcRenderer } = require('electron');

const PREFIJO = 'morphiq:';
const CANAL_EXPUESTO = `${PREFIJO}expuesto`;
const CANAL_EVENTO = `${PREFIJO}evento`;
function rechazo(codigo, mensaje) {
  return { name: codigo, codigo, message: mensaje };
}

const EVENTOS = ['progreso', 'actualizacion', 'modo-ligero'];
const METODOS = [
  'version', 'plataforma', 'diagnostico', 'impresoras', 'conexiones', 'pedirPermiso', 'ajustes', 'guardarAjustes',
  'imprimir', 'abrirCajon', 'paginaDePrueba', 'estado', 'reimprimirUltimo', 'ultimoTicket',
  'buscarActualizacion', 'instalarActualizacion', 'modoLigero', 'abrirPos', 'abrirDiagnostico',
];
/** Lo que esta app sabe hacer además del contrato base (una 1.0.1 no trae esta lista): `archivos` = 1.0.2. */
const CAPACIDADES = ['archivos'];

function seExpone() {
  try {
    return ipcRenderer.sendSync(CANAL_EXPUESTO) === true;
  } catch (error) {
    console.error('MorphiqApp: no se pudo preguntar si esta página puede usar el puente.', error);
    return false;
  }
}

async function llamar(metodo, argumentos) {
  const sobre = await ipcRenderer.invoke(`${PREFIJO}${metodo}`, ...argumentos);
  if (sobre && sobre.ok === true) return sobre.valor;
  const detalle = sobre && sobre.error ? sobre.error : { codigo: 'DESCONOCIDO', mensaje: 'Respuesta inválida de la app.' };
  throw rechazo(detalle.codigo, detalle.mensaje);
}

function crearPuente() {
  /** @type {Map<string, Set<(datos: unknown) => void>>} */
  const oyentes = new Map(EVENTOS.map((e) => [e, new Set()]));
  ipcRenderer.on(CANAL_EVENTO, (_evento, nombre, datos) => {
    const lista = oyentes.get(nombre);
    if (!lista) return;
    for (const alLlegar of [...lista]) {
      try {
        alLlegar(datos);
      } catch (error) {
        console.error(`MorphiqApp: un oyente de «${nombre}» falló.`, error);
      }
    }
  });

  const puente = { contrato: 1 };
  for (const metodo of METODOS) puente[metodo] = (...argumentos) => llamar(metodo, argumentos);
  puente.capacidades = Object.freeze([...CAPACIDADES]);
  // `abrirCarpeta` no reenvía argumentos: ni siquiera viajan por el IPC.
  puente.archivos = Object.freeze({
    guardar: (datos) => llamar('archivos.guardar', [datos]),
    abrirCarpeta: () => llamar('archivos.abrirCarpeta', []),
  });
  puente.escuchar = (evento, alLlegar) => {
    if (!oyentes.has(evento) || typeof alLlegar !== 'function') {
      throw rechazo('ARGUMENTOS', `Evento desconocido: ${String(evento)}`);
    }
    oyentes.get(evento).add(alLlegar);
    return () => {
      oyentes.get(evento).delete(alLlegar);
    };
  };
  return Object.freeze(puente);
}

if (seExpone()) contextBridge.exposeInMainWorld('MorphiqApp', crearPuente());
