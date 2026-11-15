#!/usr/bin/env node
/**
 * HUMO de las descargas: /windows y /android responden 302, y el archivo al que mandan existe (HEAD
 * 200, siguiendo los redirects de GitHub) con su tamaño.
 *
 *   BASE_URL=https://don-poncho-apps.vercel.app node herramientas/humo.mjs
 */
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3210';
const ESPERADO = {
  windows: /^https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/download\/[a-z0-9-]+-v\d+\.\d+\.\d+\/[A-Za-z0-9._-]+\.exe$/,
  android: /^https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/download\/[a-z0-9-]+-v\d+\.\d+\.\d+\/[A-Za-z0-9._-]+\.apk$/,
};

let fallas = 0;
for (const plataforma of ['windows', 'android']) {
  const ruta = `${BASE}/${plataforma}`;
  const redirect = await fetch(ruta, { redirect: 'manual' });
  const destino = redirect.headers.get('location');
  const bien302 = redirect.status === 302 && ESPERADO[plataforma].test(destino ?? '');
  console.log(`${bien302 ? 'ok ' : 'MAL'} ${ruta} -> ${redirect.status} ${destino}`);
  if (!bien302) {
    fallas += 1;
    continue;
  }
  const archivo = await fetch(destino, { method: 'HEAD', redirect: 'follow' });
  const tamano = Number(archivo.headers.get('content-length'));
  const bienArchivo = archivo.status === 200 && tamano > 0;
  console.log(`${bienArchivo ? 'ok ' : 'MAL'}   HEAD ${archivo.status}, ${tamano} bytes (${(tamano / 1048576).toFixed(1)} MB)`);
  if (!bienArchivo) fallas += 1;
}
process.exit(fallas ? 1 : 0);
