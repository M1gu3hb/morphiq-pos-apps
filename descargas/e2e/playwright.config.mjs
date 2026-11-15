import { defineConfig } from '@playwright/test';

/**
 * En local (antes: CLIENTE=don-poncho npm run build) levanta tres servidores:
 *   3211  un GitHub falso con la versión 9.9.9
 *   3210  la página leyendo el GitHub falso
 *   3212  la página con GitHub caído (un puerto donde no escucha nadie)
 *
 * Contra producción: BASE_URL=https://don-poncho-apps.vercel.app npm run e2e
 * (sólo corren las pruebas que no dependen del GitHub falso).
 */
const PRODUCCION = process.env.BASE_URL;
const CAIDO = 'http://127.0.0.1:9';

const servidor = (puerto, github) => ({
  command: 'node herramientas/servidor-local.mjs',
  cwd: '..',
  url: `http://127.0.0.1:${puerto}/robots.txt`,
  reuseExistingServer: false,
  env: { PUERTO: String(puerto), DESCARGAS_GITHUB: github, DESCARGAS_GITHUB_API: github },
});

export default defineConfig({
  testDir: '.',
  outputDir: '../test-results',
  timeout: 30000,
  retries: 0,
  workers: 2,
  reporter: [['list']],
  use: {
    baseURL: PRODUCCION ?? 'http://127.0.0.1:3210',
    browserName: 'chromium',
    acceptDownloads: true,
  },
  webServer: PRODUCCION
    ? undefined
    : [
        {
          command: 'node herramientas/github-falso.mjs',
          cwd: '..',
          url: 'http://127.0.0.1:3211/M1gu3hb/morphiq-pos-apps/releases/download/canal-don-poncho/latest.yml',
          reuseExistingServer: false,
          env: { PUERTO: '3211' },
        },
        servidor(3210, 'http://127.0.0.1:3211'),
        servidor(3212, CAIDO),
      ],
});
