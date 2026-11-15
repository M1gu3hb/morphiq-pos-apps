/**
 * DE DÓNDE SALE LA VERSIÓN MÁS NUEVA, sin token y sin desplegar nada cuando sale una nueva:
 *
 *   1. El canal (`canal-<cliente>`), lo mismo que leen las apps instaladas: `latest.yml` (Windows) y
 *      `android.json` dicen la versión y el archivo. El archivo se ofrece del release
 *      `<cliente>-vX.Y.Z`, y antes se comprueba con un HEAD que exista.
 *   2. Si el canal falla: la release `<cliente>-v*` más nueva, por la API pública de GitHub.
 *   3. Si GitHub falla: la última que se conoce (la de la memoria o la que se tomó al construir).
 *
 * A GitHub se le pregunta cuando mucho cada 5 minutos; si algo falló, se vuelve a intentar al minuto.
 * Las huellas salen de `SHA256SUMS.txt` del release de cada versión.
 */

export const VIGENCIA_MS = 5 * 60 * 1000;
export const REINTENTO_MS = 60 * 1000;
const ESPERA_MAXIMA_MS = 4000;
const RELEASES_POR_PAGINA = 100;

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
const NOMBRE_SEGURO = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SHA256 = /^[a-f0-9]{64}$/;
const PLATAFORMAS = ['windows', 'android'];
const ARCHIVO_POR_PLATAFORMA = { windows: /\.exe$/i, android: /\.apk$/i };

export function compararVersiones(a, b) {
  const pa = SEMVER.exec(a).slice(1).map(Number);
  const pb = SEMVER.exec(b).slice(1).map(Number);
  for (let i = 0; i < 3; i += 1) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

/** Lo que usamos de `latest.yml` (electron-builder): versión, archivo, tamaño y fecha. */
export function leerLatestYml(texto) {
  const valor = (clave) => {
    const linea = new RegExp(`^${clave}:[ \\t]*(.+)$`, 'm').exec(texto);
    return linea ? linea[1].trim().replace(/^['"]|['"]$/g, '') : null;
  };
  const tamano = /^\s+size:[ \t]*(\d+)\s*$/m.exec(texto);
  return {
    version: valor('version'),
    archivo: valor('path'),
    fecha: valor('releaseDate'),
    tamano: tamano ? Number(tamano[1]) : null,
  };
}

/** `SHA256SUMS.txt` (formato de sha256sum): «<huella> *<archivo>» por línea. */
export function leerSumas(texto) {
  const sumas = new Map();
  for (const linea of texto.split(/\r?\n/)) {
    const partes = /^([a-fA-F0-9]{64})\s+\*?(\S.*?)\s*$/.exec(linea);
    if (partes) sumas.set(partes[2], partes[1].toLowerCase());
  }
  return sumas;
}

function aIso(fecha) {
  if (!fecha) return null;
  const valor = new Date(fecha);
  return Number.isNaN(valor.getTime()) ? null : valor.toISOString();
}

/** Primero el instalador («Setup»), por si un release trae más de un .exe. */
function preferirInstalador(a, b) {
  return Number(/setup/i.test(b.name)) - Number(/setup/i.test(a.name));
}

/**
 * @param {object} opciones
 * @param {string} opciones.repo      «dueño/repo»
 * @param {string} opciones.canal     la etiqueta del canal, «canal-don-poncho»
 * @param {string} opciones.prefijo   el de las etiquetas de versión, «don-poncho-v»
 * @param {object|null} [opciones.conocida] la última que se conoce (la de la construcción)
 */
export function crearFuente({
  repo,
  canal,
  prefijo,
  conocida = null,
  fetch: pedir = globalThis.fetch,
  ahora = Date.now,
  github = 'https://github.com',
  api = 'https://api.github.com',
  vigenciaMs = VIGENCIA_MS,
  reintentoMs = REINTENTO_MS,
  avisar = (mensaje) => console.warn(mensaje),
}) {
  let ultima = conocida;
  // La que se tomó al construir se refresca en la primera visita.
  let proximaConsulta = 0;
  let enCurso = null;

  const enRelease = (etiqueta, archivo) => `${github}/${repo}/releases/download/${etiqueta}/${encodeURIComponent(archivo)}`;

  function solicitar(url, opciones = {}) {
    return pedir(url, {
      ...opciones,
      redirect: 'follow',
      signal: AbortSignal.timeout(ESPERA_MAXIMA_MS),
      headers: { 'User-Agent': 'morphiq-descargas', ...opciones.headers },
    });
  }

  async function texto(url) {
    const respuesta = await solicitar(url);
    if (!respuesta.ok) {
      await respuesta.body?.cancel();
      throw new Error(`${respuesta.status} en ${url}`);
    }
    return respuesta.text();
  }

  async function cabeza(url) {
    const respuesta = await solicitar(url, { method: 'HEAD' });
    if (!respuesta.ok) throw new Error(`${respuesta.status} en ${url}`);
    const tamano = Number(respuesta.headers.get('content-length'));
    return { tamano: tamano > 0 ? tamano : null, modificado: respuesta.headers.get('last-modified') };
  }

  function lectorDeSumas() {
    const porEtiqueta = new Map();
    return (etiqueta) => {
      if (!porEtiqueta.has(etiqueta)) {
        porEtiqueta.set(
          etiqueta,
          texto(enRelease(etiqueta, 'SHA256SUMS.txt'))
            .then(leerSumas)
            .catch((error) => {
              avisar(`descargas: sin SHA256SUMS.txt de ${etiqueta} (${error.message})`);
              return new Map();
            }),
        );
      }
      return porEtiqueta.get(etiqueta);
    };
  }

  async function archivoDelCanal({ version, archivo, fecha, tamano, sha256 }, sumasDe) {
    if (!SEMVER.test(version ?? '')) throw new Error(`el canal trae una versión inválida: ${version}`);
    if (!NOMBRE_SEGURO.test(archivo ?? '')) throw new Error(`el canal trae un archivo inválido: ${archivo}`);
    const etiqueta = `${prefijo}${version}`;
    const url = enRelease(etiqueta, archivo);
    const [real, sumas] = await Promise.all([cabeza(url), sumasDe(etiqueta)]);
    return {
      version,
      archivo,
      url,
      etiqueta,
      tamano: real.tamano ?? tamano ?? null,
      fecha: aIso(real.modificado) ?? aIso(fecha),
      sha256: sumas.get(archivo) ?? (SHA256.test(sha256 ?? '') ? sha256 : null),
      origen: 'canal',
    };
  }

  async function delCanal(sumasDe) {
    const base = `${github}/${repo}/releases/download/${canal}`;
    const [windows, android] = await Promise.allSettled([
      texto(`${base}/latest.yml`).then((yml) => archivoDelCanal(leerLatestYml(yml), sumasDe)),
      texto(`${base}/android.json`).then((json) => {
        const ficha = JSON.parse(json);
        return archivoDelCanal({ version: ficha.version, archivo: ficha.apk, sha256: ficha.sha256 }, sumasDe);
      }),
    ]);
    const errores = [windows, android].filter((r) => r.status === 'rejected').map((r) => r.reason.message);
    return {
      windows: windows.status === 'fulfilled' ? windows.value : null,
      android: android.status === 'fulfilled' ? android.value : null,
      errores,
    };
  }

  async function deLaApi(sumasDe) {
    const respuesta = await solicitar(`${api}/repos/${repo}/releases?per_page=${RELEASES_POR_PAGINA}`, {
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    });
    if (!respuesta.ok) {
      await respuesta.body?.cancel();
      throw new Error(`la API de GitHub respondió ${respuesta.status}`);
    }
    const lista = await respuesta.json();
    if (!Array.isArray(lista)) throw new Error('la API de GitHub respondió algo inesperado');
    const versionDe = (release) => release.tag_name.slice(prefijo.length);
    const candidatas = lista
      .filter(
        (release) =>
          release &&
          !release.draft &&
          !release.prerelease &&
          typeof release.tag_name === 'string' &&
          release.tag_name.startsWith(prefijo) &&
          SEMVER.test(versionDe(release)),
      )
      .sort((a, b) => compararVersiones(versionDe(b), versionDe(a)));

    async function laMasNueva(plataforma) {
      for (const release of candidatas) {
        const activo = (release.assets ?? [])
          .filter((a) => ARCHIVO_POR_PLATAFORMA[plataforma].test(a.name) && NOMBRE_SEGURO.test(a.name))
          .sort(preferirInstalador)[0];
        if (!activo) continue;
        const sumas = await sumasDe(release.tag_name);
        const resumen = /^sha256:([a-f0-9]{64})$/.exec(activo.digest ?? '');
        return {
          version: versionDe(release),
          archivo: activo.name,
          url: enRelease(release.tag_name, activo.name),
          etiqueta: release.tag_name,
          tamano: Number(activo.size) > 0 ? Number(activo.size) : null,
          fecha: aIso(release.published_at),
          sha256: sumas.get(activo.name) ?? resumen?.[1] ?? null,
          origen: 'api',
        };
      }
      return null;
    }

    return { windows: await laMasNueva('windows'), android: await laMasNueva('android') };
  }

  async function refrescar() {
    const sumasDe = lectorDeSumas();
    const canalLeido = await delCanal(sumasDe);
    const errores = [...canalLeido.errores];
    const nueva = { windows: canalLeido.windows, android: canalLeido.android };

    if (PLATAFORMAS.some((p) => !nueva[p])) {
      try {
        const deApi = await deLaApi(sumasDe);
        for (const p of PLATAFORMAS) nueva[p] ??= deApi[p];
      } catch (error) {
        errores.push(error.message);
      }
    }
    for (const p of PLATAFORMAS) {
      if (!nueva[p] && ultima?.[p]) nueva[p] = { ...ultima[p], origen: 'conocida' };
    }
    if (errores.length > 0) avisar(`descargas: GitHub no respondió bien (${errores.join('; ')})`);

    proximaConsulta = ahora() + (errores.length > 0 ? reintentoMs : vigenciaMs);
    if (!nueva.windows && !nueva.android) return ultima;
    ultima = { ...nueva, obtenidaEn: new Date(ahora()).toISOString() };
    return ultima;
  }

  /** La versión vigente. Nunca falla: si GitHub no responde, da la última que conoce (o null). */
  function obtener() {
    if (ultima && ahora() < proximaConsulta) return Promise.resolve(ultima);
    enCurso ??= refrescar()
      .catch((error) => {
        avisar(`descargas: no se pudo leer la versión (${error.message})`);
        proximaConsulta = ahora() + reintentoMs;
        return ultima;
      })
      .finally(() => {
        enCurso = null;
      });
    return enCurso;
  }

  return { obtener };
}
