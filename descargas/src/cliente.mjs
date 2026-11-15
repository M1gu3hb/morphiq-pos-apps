import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ZONA_PREDETERMINADA, zonaValida } from './formato.mjs';

/**
 * La ficha del cliente (`clientes/<id>.json`, la misma de las apps) y lo que la página toma de ella.
 * Lo que cambia por cliente entra SÓLO por aquí: otra ficha, otra página.
 */

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const ETIQUETA = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const RUTA_RELATIVA = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_.-]+)*\.png$/;

export function validarFicha(ficha) {
  const errores = [];
  const exigir = (condicion, mensaje) => {
    if (!condicion) errores.push(mensaje);
  };
  exigir(ID.test(ficha?.id ?? ''), '«id» debe ser minúsculas, números y guiones');
  exigir(typeof ficha?.nombre === 'string' && ficha.nombre.trim() !== '', 'falta «nombre»');
  exigir(typeof ficha?.firma === 'string' && ficha.firma.trim() !== '', 'falta «firma»');
  for (const color of ['fondo', 'texto', 'acento']) {
    exigir(COLOR.test(ficha?.colores?.[color] ?? ''), `«colores.${color}» debe ser #rrggbb`);
  }
  exigir(RUTA_RELATIVA.test(ficha?.logo ?? ''), '«logo» debe ser un .png dentro de clientes/');
  exigir(RUTA_RELATIVA.test(ficha?.icono ?? ''), '«icono» debe ser un .png dentro de clientes/');
  exigir(REPO.test(ficha?.releases?.repo ?? ''), '«releases.repo» debe ser «dueño/repo»');
  exigir(ETIQUETA.test(ficha?.releases?.canal ?? ''), '«releases.canal» no es una etiqueta válida');
  let url = null;
  try {
    url = new URL(ficha?.url);
  } catch {
    errores.push('«url» no es una URL');
  }
  if (url) exigir(url.protocol === 'https:', '«url» debe ser https');
  if (ficha?.zonaHoraria !== undefined) exigir(zonaValida(ficha.zonaHoraria), '«zonaHoraria» no existe');
  return errores;
}

/** Lee y valida `clientes/<id>.json` desde la raíz del repo. */
export function leerFicha(raizRepo, id) {
  if (!ID.test(id ?? '')) throw new Error(`El cliente «${id}» no es un id válido (p. ej. «don-poncho»).`);
  const ruta = join(raizRepo, 'clientes', `${id}.json`);
  if (!existsSync(ruta)) throw new Error(`No existe clientes/${id}.json`);
  const ficha = JSON.parse(readFileSync(ruta, 'utf8'));
  const errores = validarFicha(ficha);
  if (ficha.id !== id) errores.push(`el «id» de la ficha (${ficha.id}) no es «${id}»`);
  if (errores.length > 0) throw new Error(`clientes/${id}.json: ${errores.join('; ')}`);
  return ficha;
}

/** Lo que necesita la página en tiempo de ejecución: nada de rutas locales ni del appId. */
export function datosDePagina(ficha) {
  return {
    id: ficha.id,
    nombre: ficha.nombre,
    nombreCorto: ficha.nombreCorto || ficha.nombre,
    url: ficha.url,
    colores: { fondo: ficha.colores.fondo, texto: ficha.colores.texto, acento: ficha.colores.acento },
    firma: ficha.firma,
    repo: ficha.releases.repo,
    canal: ficha.releases.canal,
    prefijo: `${ficha.id}-v`,
    zonaHoraria: ficha.zonaHoraria ?? ZONA_PREDETERMINADA,
  };
}
