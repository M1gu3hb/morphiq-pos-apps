#!/usr/bin/env node
/**
 * UN GITHUB DE MENTIRA para las pruebas: un canal y un release con una versión que no existe en el
 * de verdad (la 9.9.9), para comprobar que la página ofrece la nueva sin desplegar nada.
 *
 *   PUERTO=3211 node herramientas/github-falso.mjs
 */
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

export const REPO = 'M1gu3hb/morphiq-pos-apps';
export const VERSION_FALSA = '9.9.9';
const PREFIJO = 'don-poncho-v';
const EXE = `POS-Don-Poncho-Setup-${VERSION_FALSA}.exe`;
const APK = `POS-Don-Poncho-${VERSION_FALSA}.apk`;
const HUELLA_EXE = 'a'.repeat(64);
const HUELLA_APK = 'b'.repeat(64);
export const TAMANOS = { [EXE]: 125829120, [APK]: 3355443 };

const RELEASE = `/${REPO}/releases/download/${PREFIJO}${VERSION_FALSA}`;
const CANAL = `/${REPO}/releases/download/canal-don-poncho`;

const textos = {
  [`${CANAL}/latest.yml`]: [
    `version: ${VERSION_FALSA}`,
    'files:',
    `  - url: ${EXE}`,
    '    sha512: no-importa',
    `    size: ${TAMANOS[EXE]}`,
    `path: ${EXE}`,
    'sha512: no-importa',
    "releaseDate: '2027-01-20T18:00:00.000Z'",
    '',
  ].join('\n'),
  [`${CANAL}/android.json`]: JSON.stringify({ versionCode: 99, version: VERSION_FALSA, apk: APK, sha256: HUELLA_APK }),
  [`${RELEASE}/SHA256SUMS.txt`]: `${HUELLA_EXE} *${EXE}\n${HUELLA_APK} *${APK}\n`,
};

export function iniciarGithubFalso(puerto = 0) {
  const servidor = createServer((req, res) => {
    const { pathname } = new URL(req.url ?? '/', 'http://local');
    if (textos[pathname] !== undefined) {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(textos[pathname]);
      return;
    }
    const archivo = pathname.startsWith(`${RELEASE}/`) ? pathname.slice(RELEASE.length + 1) : null;
    if (archivo && TAMANOS[archivo]) {
      // HEAD dice el tamaño «real»; GET entrega un archivo diminuto (las pruebas sólo ven que baje).
      const contenido = Buffer.from(`archivo de prueba ${archivo}\n`);
      res.writeHead(200, {
        'Content-Length': req.method === 'HEAD' ? TAMANOS[archivo] : contenido.length,
        'Last-Modified': 'Wed, 20 Jan 2027 18:05:00 GMT',
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename=${archivo}`,
      });
      res.end(req.method === 'HEAD' ? undefined : contenido);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });
  return new Promise((resolver) => {
    servidor.listen(puerto, '127.0.0.1', () => {
      resolver({ url: `http://127.0.0.1:${servidor.address().port}`, cerrar: () => servidor.close() });
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { url } = await iniciarGithubFalso(Number(process.env.PUERTO ?? 3211));
  console.log(`GitHub falso en ${url}`);
}
