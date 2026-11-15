'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { getCurrentFuseWire, FuseV1Options } = require('@electron/fuses');
const { FUSES_DESEADOS, voltearFuses, afterPack } = require('../herramientas/fuses');

const ELECTRON_EXE = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe');
/** `getCurrentFuseWire` devuelve el byte del fuse: 49 («1») encendido, 48 («0») apagado. */
const ENCENDIDO = 49;
const estado = (cable, fuse) => cable[fuse] === ENCENDIDO;

test('fuses: lo que se pide (RunAsNode, NODE_OPTIONS e inspect apagados; sólo asar encendido)', () => {
  assert.equal(FUSES_DESEADOS[FuseV1Options.RunAsNode], false);
  assert.equal(FUSES_DESEADOS[FuseV1Options.EnableNodeOptionsEnvironmentVariable], false);
  assert.equal(FUSES_DESEADOS[FuseV1Options.EnableNodeCliInspectArguments], false);
  assert.equal(FUSES_DESEADOS[FuseV1Options.OnlyLoadAppFromAsar], true);
});

test('fuses: sobre una copia del electron.exe real se voltean sólo esos y no se toca el original', { skip: !fs.existsSync(ELECTRON_EXE) }, async () => {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'morphiq-fuses-'));
  const copia = path.join(carpeta, 'app.exe');
  try {
    fs.copyFileSync(ELECTRON_EXE, copia);
    const antes = await getCurrentFuseWire(copia);
    await voltearFuses(copia);
    const despues = await getCurrentFuseWire(copia);
    assert.deepEqual(
      [FuseV1Options.RunAsNode, FuseV1Options.EnableNodeOptionsEnvironmentVariable, FuseV1Options.EnableNodeCliInspectArguments, FuseV1Options.OnlyLoadAppFromAsar].map((f) => estado(despues, f)),
      [false, false, false, true],
    );
    for (const fuse of [FuseV1Options.EnableCookieEncryption, FuseV1Options.EnableEmbeddedAsarIntegrityValidation, FuseV1Options.GrantFileProtocolExtraPrivileges]) {
      assert.equal(despues[fuse], antes[fuse], `el fuse ${fuse} no se pidió y no debe cambiar`);
    }
    assert.equal(estado(await getCurrentFuseWire(ELECTRON_EXE), FuseV1Options.RunAsNode), true, 'el electron.exe de node_modules sigue intacto');
  } finally {
    fs.rmSync(carpeta, { recursive: true, force: true });
  }
});

test('afterPack: ignora otras plataformas y la variante legado', async () => {
  const contexto = (plataforma) => ({ electronPlatformName: plataforma, appOutDir: '/no/existe', packager: { appInfo: { productFilename: 'X' } } });
  await afterPack(contexto('darwin'));
  const antes = process.env.MORPHIQ_LEGADO;
  process.env.MORPHIQ_LEGADO = '1';
  try {
    await afterPack(contexto('win32'));
  } finally {
    if (antes === undefined) delete process.env.MORPHIQ_LEGADO;
    else process.env.MORPHIQ_LEGADO = antes;
  }
  await assert.rejects(afterPack(contexto('win32')), 'en Windows normal sí intenta voltear (y falla porque no hay .exe)');
});
