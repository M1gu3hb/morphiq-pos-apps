import { test, expect } from '@playwright/test';
import { VERSION_FALSA } from '../herramientas/github-falso.mjs';

/**
 * De dónde sale la versión: sólo en local, con el GitHub falso (3211) y con GitHub caído (3212).
 */
test.skip(Boolean(process.env.BASE_URL), 'sólo en local');

const REAL = 'https://github.com/M1gu3hb/morphiq-pos-apps/releases/download';

test('sale una versión nueva en el canal: la página la ofrece sin desplegar nada', async ({ page, request }) => {
  await page.goto('http://127.0.0.1:3210/');
  await expect(page.locator('[data-plataforma="windows"]')).toContainText(`Versión ${VERSION_FALSA}, 20 ene 2027, 120 MB`);
  await expect(page.locator('[data-plataforma="android"]')).toContainText(`Versión ${VERSION_FALSA}, 20 ene 2027, 3.2 MB`);
  await expect(page.locator('.pie')).toContainText('a'.repeat(64));
  const windows = await request.get('http://127.0.0.1:3210/windows', { maxRedirects: 0 });
  expect(windows.headers().location).toBe(
    `http://127.0.0.1:3211/M1gu3hb/morphiq-pos-apps/releases/download/don-poncho-v${VERSION_FALSA}/POS-Don-Poncho-Setup-${VERSION_FALSA}.exe`,
  );
});

test('GitHub caído: la última versión conocida (la de la construcción), nunca en blanco', async ({ page, request }) => {
  const respuesta = await page.goto('http://127.0.0.1:3212/');
  expect(respuesta.status()).toBe(200);
  const windows = page.locator('[data-plataforma="windows"]');
  await expect(windows).toContainText(/Versión \d+\.\d+\.\d+, /);
  await expect(windows).not.toContainText(VERSION_FALSA);
  for (const [ruta, archivo] of [
    ['/windows', /POS-Don-Poncho-Setup-\d+\.\d+\.\d+\.exe$/],
    ['/android', /POS-Don-Poncho-\d+\.\d+\.\d+\.apk$/],
  ]) {
    const r = await request.get(`http://127.0.0.1:3212${ruta}`, { maxRedirects: 0 });
    expect(r.status()).toBe(302);
    expect(r.headers().location.startsWith(`${REAL}/don-poncho-v`)).toBe(true);
    expect(r.headers().location).toMatch(archivo);
  }
});
