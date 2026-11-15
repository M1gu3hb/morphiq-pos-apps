#!/usr/bin/env node
/**
 * PREPARA UN CLIENTE: de `clientes/<id>.json` y `compartido/` salen las carpetas `generado/` de
 * cada app. Lo que cambia por cliente (nombre, ícono, URL, dominio) entra SÓLO por aquí.
 *
 *   node scripts/preparar-cliente.mjs don-poncho
 *
 * Deja:
 *   electron/generado/cliente.json   la ficha del cliente + `version` y `versionCode`
 *   electron/generado/icono.png      el ícono de 512 px
 *   electron/generado/pantallas/     Diagnóstico, Sin internet y Acerca de + `marca.js`
 *   android/generado/cliente.json    lo mismo
 *   android/generado/icono.png
 *   android/www/                     las pantallas + `marca.js` + `index.html` (webDir de Capacitor)
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leerJson = (ruta) => JSON.parse(readFileSync(ruta, 'utf8'));

const CAMPOS = ['id', 'nombre', 'nombreCorto', 'appId', 'url', 'dominio', 'colores', 'icono', 'logo', 'releases', 'firma'];

export function validarCliente(cliente) {
  const errores = [];
  for (const campo of CAMPOS) if (cliente[campo] === undefined) errores.push(`falta «${campo}»`);
  if (errores.length > 0) return errores;
  let url;
  try {
    url = new URL(cliente.url);
  } catch {
    return ['«url» no es una URL'];
  }
  if (url.protocol !== 'https:') errores.push('«url» debe ser https');
  if (url.hostname !== cliente.dominio) errores.push('«url» no es del «dominio» permitido');
  if (!/^[a-z0-9.-]+$/.test(cliente.dominio)) errores.push('«dominio» no es un nombre de host');
  if (/[*/:]/.test(cliente.dominio)) errores.push('«dominio» es un host exacto, sin comodines ni rutas');
  if (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/.test(cliente.appId)) errores.push('«appId» no es válido');
  return errores;
}

export function marcaJs(cliente, version) {
  const marca = {
    id: cliente.id,
    nombre: cliente.nombre,
    nombreCorto: cliente.nombreCorto,
    colores: cliente.colores,
    firma: cliente.firma,
    version: version.version,
    // A dónde pregunta «Sin internet» para saber si ya volvió la red.
    sonda: `${new URL(cliente.url).origin}/`,
  };
  return `window.MARCA = Object.freeze(${JSON.stringify(marca, null, 2)});\n`;
}

function preparar(id) {
  const ficha = join(RAIZ, 'clientes', `${id}.json`);
  if (!existsSync(ficha)) throw new Error(`No existe clientes/${id}.json`);
  const cliente = leerJson(ficha);
  const errores = validarCliente(cliente);
  if (errores.length > 0) throw new Error(`clientes/${id}.json: ${errores.join('; ')}`);

  const version = leerJson(join(RAIZ, 'version.json'));
  const completo = { ...cliente, version: version.version, versionCode: version.versionCode };
  const icono = join(RAIZ, 'clientes', cliente.icono);
  const logo = join(RAIZ, 'clientes', cliente.logo);
  const pantallas = join(RAIZ, 'compartido', 'pantallas');

  const destinos = [
    { generado: join(RAIZ, 'electron', 'generado'), paginas: join(RAIZ, 'electron', 'generado', 'pantallas') },
    { generado: join(RAIZ, 'android', 'generado'), paginas: join(RAIZ, 'android', 'www') },
  ];
  for (const { generado, paginas } of destinos) {
    rmSync(generado, { recursive: true, force: true });
    rmSync(paginas, { recursive: true, force: true });
    mkdirSync(generado, { recursive: true });
    mkdirSync(paginas, { recursive: true });
    writeFileSync(join(generado, 'cliente.json'), `${JSON.stringify(completo, null, 2)}\n`);
    cpSync(icono, join(generado, 'icono.png'));
    cpSync(pantallas, paginas, { recursive: true });
    cpSync(icono, join(paginas, 'icono.png'));
    cpSync(logo, join(paginas, 'logo.png'));
    writeFileSync(join(paginas, 'marca.js'), marcaJs(cliente, version));
  }
  // Capacitor exige un `index.html` en su webDir aunque la app cargue la URL de producción.
  cpSync(join(RAIZ, 'android', 'www', 'sin-internet.html'), join(RAIZ, 'android', 'www', 'index.html'));
  return completo;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const id = process.argv[2];
  if (!id) {
    console.error('Uso: node scripts/preparar-cliente.mjs <cliente>');
    process.exit(2);
  }
  try {
    const cliente = preparar(id);
    console.log(`Listo: ${cliente.nombre} ${cliente.version} (${cliente.dominio})`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
