import { crearApp } from './app.mjs';
import { crearFuente } from './releases.mjs';

/**
 * Arma la app con la configuración que dejó `construir.mjs` (`config.json` junto a la función).
 *
 * Fuera de Vercel, y sólo hacia localhost, las pruebas pueden cambiar a dónde se le pregunta a
 * GitHub y cada cuánto: DESCARGAS_GITHUB, DESCARGAS_GITHUB_API y DESCARGAS_VIGENCIA_MS. En Vercel
 * (variable VERCEL) no se leen.
 */

const SOLO_LOCAL = /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d{1,5})?$/;

export function ajustesDePrueba(entorno = process.env) {
  if (entorno.VERCEL) return {};
  const local = (valor) => (SOLO_LOCAL.test(valor ?? '') ? valor : undefined);
  const ajustes = {};
  if (local(entorno.DESCARGAS_GITHUB)) ajustes.github = entorno.DESCARGAS_GITHUB;
  if (local(entorno.DESCARGAS_GITHUB_API)) ajustes.api = entorno.DESCARGAS_GITHUB_API;
  const vigencia = Number(entorno.DESCARGAS_VIGENCIA_MS);
  if (Number.isInteger(vigencia) && vigencia > 0) {
    ajustes.vigenciaMs = vigencia;
    ajustes.reintentoMs = vigencia;
  }
  return ajustes;
}

export function montar(config, entorno = process.env) {
  const { cliente, estaticos, conocida } = config;
  const fuente = crearFuente({
    repo: cliente.repo,
    canal: cliente.canal,
    prefijo: cliente.prefijo,
    conocida,
    ...ajustesDePrueba(entorno),
  });
  return crearApp({ cliente, estaticos, fuente });
}
