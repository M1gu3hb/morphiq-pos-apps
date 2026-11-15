'use strict';
/** La impresión por driver con la ventana oculta SIN JavaScript. Ventana falsa: no se abre ni se imprime nada. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { crearImpresorPorDriver, medirAltoEnPixeles } = require('../principal/impresion/driver');

/** Una `BrowserWindow` falsa que anota todo; `executeJavaScript` explota para probar que no se usa. */
function entornoDeVentana({ alto = 800, fallaMedicion = null, resultadoDeImpresion = [true, ''] } = {}) {
  const carpetaTemporal = fs.mkdtempSync(path.join(os.tmpdir(), 'morphiq-driver-'));
  const visto = { opciones: null, archivo: null, impresion: null, depurador: [], destruida: false };
  class VentanaFalsa {
    constructor(opciones) {
      visto.opciones = opciones;
      this.webContents = {
        executeJavaScript: () => {
          throw new Error('executeJavaScript no debe usarse con JavaScript apagado');
        },
        debugger: {
          attach: (version) => visto.depurador.push(['attach', version]),
          sendCommand: async (comando) => {
            visto.depurador.push([comando]);
            if (fallaMedicion) throw fallaMedicion;
            return { cssContentSize: { height: alto }, contentSize: { height: alto * 2 } };
          },
          detach: () => visto.depurador.push(['detach']),
        },
        print: (opcionesDeImpresion, devolver) => {
          visto.impresion = opcionesDeImpresion;
          devolver(...resultadoDeImpresion);
        },
      };
    }
    async loadFile(archivo) {
      visto.archivo = archivo;
      assert.ok(fs.existsSync(archivo), 'el HTML ya está escrito cuando se carga');
      visto.contenido = fs.readFileSync(archivo, 'utf8');
    }
    isDestroyed() {
      return visto.destruida;
    }
    destroy() {
      visto.destruida = true;
    }
  }
  const imprimir = crearImpresorPorDriver({ BrowserWindow: VentanaFalsa, carpetaTemporal });
  return { imprimir, visto, carpetaTemporal, limpiar: () => fs.rmSync(carpetaTemporal, { recursive: true, force: true }) };
}

test('driver: la ventana oculta tiene JavaScript APAGADO y sigue aislada', async () => {
  const e = entornoDeVentana();
  try {
    await e.imprimir({ nombre: 'POS-58', html: '<p>ticket</p>', anchoMm: 58, esperaMs: 2000 });
    const p = e.visto.opciones.webPreferences;
    assert.equal(p.javascript, false);
    assert.deepEqual(
      [e.visto.opciones.show, p.sandbox, p.contextIsolation, p.nodeIntegration, p.webviewTag, p.devTools, p.webSecurity],
      [false, true, true, false, false, false, true],
    );
    assert.equal(p.partition, 'morphiq-impresion');
  } finally {
    e.limpiar();
  }
});

test('driver: el alto se mide por el protocolo de depuración (no ejecuta JS) y llega al print silencioso', async () => {
  const e = entornoDeVentana({ alto: 1234 });
  try {
    const r = await e.imprimir({ nombre: '\\\\caja\\POS-58', html: '<p>ticket</p>', anchoMm: 58, esperaMs: 2000 });
    assert.equal(r.bytes, Buffer.byteLength('<p>ticket</p>'));
    assert.deepEqual(e.visto.depurador, [['attach', '1.3'], ['Page.getLayoutMetrics'], ['detach']]);
    const { silent, deviceName, pageSize } = e.visto.impresion;
    assert.deepEqual([silent, deviceName, pageSize.width, pageSize.height], [true, '\\\\caja\\POS-58', 58_000, Math.ceil(1234 * (25400 / 96))]);
  } finally {
    e.limpiar();
  }
});

test('driver: si falla la medición se suelta el depurador, se destruye la ventana y se borra el HTML', async () => {
  const e = entornoDeVentana({ fallaMedicion: new Error('sin diseño') });
  try {
    await assert.rejects(e.imprimir({ nombre: 'POS-58', html: '<p>x</p>', anchoMm: 58, esperaMs: 2000 }), /sin diseño/);
    assert.deepEqual(e.visto.depurador.at(-1), ['detach']);
    assert.equal(e.visto.destruida, true);
    assert.equal(e.visto.impresion, null, 'no se imprimió');
    assert.deepEqual(fs.readdirSync(e.carpetaTemporal), []);
  } finally {
    e.limpiar();
  }
});

test('driver: los motivos de Chromium se dicen en español', async () => {
  const e = entornoDeVentana({ resultadoDeImpresion: [false, 'Invalid deviceName provided'] });
  try {
    await assert.rejects(
      e.imprimir({ nombre: 'X', html: '<p>x</p>', anchoMm: 58, esperaMs: 2000 }),
      (error) => error.codigo === 'DESCONECTADA' && error.message === 'No se encontró la impresora',
    );
  } finally {
    e.limpiar();
  }
});

test('medirAltoEnPixeles: usa el alto en píxeles CSS y, si no viene, el del contenido', async () => {
  const con = (respuesta) => ({ debugger: { attach() {}, detach() {}, sendCommand: async () => respuesta } });
  assert.equal(await medirAltoEnPixeles(con({ cssContentSize: { height: 10 }, contentSize: { height: 20 } })), 10);
  assert.equal(await medirAltoEnPixeles(con({ contentSize: { height: 20 } })), 20);
});
