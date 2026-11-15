import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { UA } from '../pruebas/agentes.mjs';

/**
 * La página en los aparatos reales que la van a abrir. Corre en local (GitHub falso) y contra
 * producción (BASE_URL). Las capturas quedan en `capturas/`.
 */
const PRODUCCION = Boolean(process.env.BASE_URL);
const CAPTURAS = new URL('../capturas/', import.meta.url);
const VERSION = /Versión \d+\.\d+\.\d+, \d{1,2} [a-z]{3} \d{4}, [\d.]+ (MB|KB)/;
mkdirSync(CAPTURAS, { recursive: true });
const captura = (nombre) => fileURLToPath(new URL(`${PRODUCCION ? 'produccion' : 'local'}-${nombre}.png`, CAPTURAS));

const boton = (page, plataforma) => page.locator(`[data-plataforma="${plataforma}"]`);

async function sinDesbordeHorizontal(page) {
  const [ancho, visible] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(ancho).toBeLessThanOrEqual(visible);
}

const APARATOS = [
  { nombre: 'windows-10', ua: UA.windows10, este: 'windows', relleno: true, aviso: null, viewport: { width: 1024, height: 768 } },
  { nombre: 'windows-7', ua: UA.windows7, este: 'windows', relleno: false, aviso: 'Esta app necesita Windows 10 o más nuevo', viewport: { width: 1024, height: 768 } },
  { nombre: 'android-12', ua: UA.android12, este: 'android', relleno: true, aviso: null, viewport: { width: 360, height: 740 } },
  { nombre: 'android-5', ua: UA.android5, este: 'android', relleno: false, aviso: 'Necesita Android 6 o más nuevo', viewport: { width: 360, height: 740 } },
  { nombre: 'iphone', ua: UA.iphone, este: null, relleno: false, aviso: 'En iPhone no se instala: abre el POS en Safari y usa “Agregar a inicio”', viewport: { width: 390, height: 844 } },
];

for (const aparato of APARATOS) {
  test.describe(`aparato ${aparato.nombre}`, () => {
    test.use({ userAgent: aparato.ua, viewport: aparato.viewport });

    test('resalta su botón y da su aviso', async ({ page }) => {
      await page.goto('/');
      for (const plataforma of ['windows', 'android']) {
        const elBoton = boton(page, plataforma);
        await expect(elBoton).toBeVisible();
        await expect(elBoton).toContainText(VERSION);
        if (plataforma === aparato.este) await expect(elBoton).toHaveAttribute('data-este', 'si');
        else await expect(elBoton).not.toHaveAttribute('data-este');
        if (plataforma === aparato.este && aparato.relleno) await expect(elBoton).toHaveClass(/boton-principal/);
        else await expect(elBoton).not.toHaveClass(/boton-principal/);
      }
      if (aparato.este && aparato.relleno) await expect(boton(page, aparato.este)).toContainText('Para este aparato');
      if (aparato.este && !aparato.relleno) await expect(boton(page, aparato.este)).toContainText('No corre en este');
      const avisos = page.locator('.aviso');
      if (aparato.aviso) {
        await expect(avisos).toHaveCount(1);
        await expect(avisos).toContainText(aparato.aviso);
      } else {
        await expect(avisos).toHaveCount(0);
      }
      if (aparato.nombre === 'iphone') {
        await expect(page.getByRole('link', { name: 'Abrir el POS' })).toHaveAttribute('href', /^https:\/\/pos-don-poncho\.vercel\.app\//);
      }
      await sinDesbordeHorizontal(page);
      await page.screenshot({ path: captura(aparato.nombre), fullPage: true });
    });
  });
}

test.describe('Windows 7 con Chrome nuevo (su user agent dice NT 10.0)', () => {
  test.use({
    userAgent: UA.windows10,
    extraHTTPHeaders: { 'sec-ch-ua-platform': '"Windows"', 'sec-ch-ua-platform-version': '"0.1.0"' },
  });
  test('la pista de versión lo delata', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.aviso')).toContainText('Este aparato tiene Windows 7. Esta app necesita Windows 10 o más nuevo.');
  });
});

for (const [nombre, viewport] of [
  ['telefono-360', { width: 360, height: 740 }],
  ['pc-1024x768', { width: 1024, height: 768 }],
]) {
  test.describe(`pantalla ${nombre}`, () => {
    test.use({ viewport });
    test('cabe, los botones miden 56 px o más y se ven sin bajar', async ({ page }) => {
      await page.goto('/');
      await sinDesbordeHorizontal(page);
      for (const plataforma of ['windows', 'android']) {
        const caja = await boton(page, plataforma).boundingBox();
        expect(caja.height).toBeGreaterThanOrEqual(56);
        expect(caja.x).toBeGreaterThanOrEqual(0);
        expect(caja.x + caja.width).toBeLessThanOrEqual(viewport.width);
      }
      // En la PC los dos botones caben en la primera pantalla; en el teléfono, al menos el primero.
      const primero = await page.locator('.descargas .boton').first().boundingBox();
      expect(primero.y + primero.height).toBeLessThanOrEqual(viewport.height);
      if (viewport.width >= 1024) {
        const ultimo = await page.locator('.descargas .boton').last().boundingBox();
        expect(ultimo.y + ultimo.height).toBeLessThanOrEqual(viewport.height);
      }
      await expect(page.locator('svg.qr-codigo')).toBeVisible();
      await page.screenshot({ path: captura(nombre), fullPage: true });
      await page.screenshot({ path: captura(`${nombre}-primera-pantalla`) });
    });
  });
}

test.describe('JavaScript apagado', () => {
  test.use({ javaScriptEnabled: false, userAgent: UA.android12, viewport: { width: 360, height: 740 } });
  test('la página sale completa y la descarga baja con un clic', async ({ page }) => {
    await page.goto('/');
    await expect(boton(page, 'android')).toContainText(VERSION);
    await expect(page.locator('svg.qr-codigo')).toBeVisible();
    const [descarga] = await Promise.all([page.waitForEvent('download'), boton(page, 'android').click()]);
    expect(descarga.suggestedFilename()).toMatch(/^POS-Don-Poncho-\d+\.\d+\.\d+\.apk$/);
    await descarga.cancel();
    await page.screenshot({ path: captura('sin-javascript') });
  });
});

test('la página entera (HTML, logo e ícono) pesa menos de 100 KB', async ({ page }) => {
  const bytes = [];
  page.on('response', async (respuesta) => {
    if (respuesta.request().resourceType() === 'document' && respuesta.status() !== 200) return;
    bytes.push((await respuesta.body().catch(() => Buffer.alloc(0))).length);
  });
  await page.goto('/', { waitUntil: 'networkidle' });
  const total = bytes.reduce((a, b) => a + b, 0);
  expect(bytes.length).toBeGreaterThanOrEqual(2);
  expect(total).toBeLessThan(100 * 1024);
  console.log(`  peso total: ${(total / 1024).toFixed(1)} KB en ${bytes.length} respuestas`);
});

test('noindex y robots.txt', async ({ page, request }) => {
  const respuesta = await page.goto('/');
  expect(respuesta.headers()['x-robots-tag']).toBe('noindex, nofollow');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  expect(await (await request.get('/robots.txt')).text()).toBe('User-agent: *\nDisallow: /\n');
});

test('/windows y /android: 302 al archivo del release de su versión', async ({ request }) => {
  for (const [ruta, archivo] of [
    ['/windows', /\/releases\/download\/don-poncho-v(\d+\.\d+\.\d+)\/POS-Don-Poncho-Setup-\1\.exe$/],
    ['/android', /\/releases\/download\/don-poncho-v(\d+\.\d+\.\d+)\/POS-Don-Poncho-\1\.apk$/],
  ]) {
    const respuesta = await request.get(ruta, { maxRedirects: 0 });
    expect(respuesta.status()).toBe(302);
    expect(respuesta.headers().location).toMatch(archivo);
  }
});
