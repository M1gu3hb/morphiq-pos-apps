'use strict';
/**
 * `MorphiqApp.archivos` (1.0.2): guardar el PDF de un corte en `Documentos\POS Don Poncho\Cortes\AAAA-MM\`
 * y abrir esa carpeta. Tres cerrojos: sólo PDF, sólo esa carpeta, sólo el origen de producción.
 * Todo con carpetas temporales y un `shell` de mentira: nada toca los Documentos reales.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { crearArchivos, estaDentro, MAX_BYTES } = require('../principal/archivos');
const { registrarPuente } = require('../principal/puente');
const { esOrigenDelCliente } = require('../principal/origen');

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n', 'latin1');
const b64 = (buffer) => Buffer.from(buffer).toString('base64');
const BUENO = { folio: 'DPC-0102', fecha: '2026-11-16', base64: b64(PDF) };

/** Un `Documentos` temporal, un `shell` falso y el módulo armado sobre ellos. */
function armar(extra = {}) {
  const documentos = fs.mkdtempSync(path.join(os.tmpdir(), 'morphiq-archivos-'));
  const abiertas = [];
  const shell = { openPath: async (ruta) => (abiertas.push(ruta), '') };
  const registros = [];
  const archivos = crearArchivos({ carpetaDocumentos: documentos, shell, registrar: (m) => registros.push(m), ...extra });
  const carpeta = path.join(documentos, 'POS Don Poncho', 'Cortes');
  const limpiar = () => fs.rmSync(documentos, { recursive: true, force: true });
  return { documentos, carpeta, archivos, abiertas, registros, limpiar };
}

/** Todo lo que hay bajo `base`, en rutas relativas con `/`. */
function arbol(base) {
  const salida = [];
  const recorrer = (carpeta) => {
    for (const entrada of fs.readdirSync(carpeta, { withFileTypes: true })) {
      const completa = path.join(carpeta, entrada.name);
      salida.push(path.relative(base, completa).split(path.sep).join('/'));
      if (entrada.isDirectory()) recorrer(completa);
    }
  };
  if (fs.existsSync(base)) recorrer(base);
  return salida.sort();
}

test('guardar: un PDF válido queda en Documentos\\POS Don Poncho\\Cortes\\AAAA-MM\\ con el nombre armado por la app', async () => {
  const t = armar();
  try {
    const r = await t.archivos.guardar(BUENO);
    const esperada = path.join(t.carpeta, '2026-11', 'Corte-DPC-0102-2026-11-16.pdf');
    assert.deepEqual([r.ok, r.estado, r.ruta, r.bytes], [true, 'guardado', esperada, PDF.length]);
    assert.deepEqual(fs.readFileSync(esperada), PDF);
    assert.deepEqual(arbol(t.documentos), ['POS Don Poncho', 'POS Don Poncho/Cortes', 'POS Don Poncho/Cortes/2026-11', 'POS Don Poncho/Cortes/2026-11/Corte-DPC-0102-2026-11-16.pdf']);
  } finally {
    t.limpiar();
  }
});

test('guardar: cada corte va a la carpeta de SU mes (y las carpetas que faltan se crean)', async () => {
  const t = armar();
  try {
    await t.archivos.guardar({ ...BUENO, folio: 'A-1', fecha: '2026-10-31' });
    await t.archivos.guardar({ ...BUENO, folio: 'A-2', fecha: '2026-11-01' });
    assert.deepEqual(
      arbol(path.join(t.carpeta)).filter((x) => x.endsWith('.pdf')),
      ['2026-10/Corte-A-1-2026-10-31.pdf', '2026-11/Corte-A-2-2026-11-01.pdf'],
    );
  } finally {
    t.limpiar();
  }
});

test('guardar: lo que no es PDF se rechaza, no se escribe nada y no se crean carpetas', async () => {
  const t = armar();
  try {
    const intentos = [
      Buffer.from('hola, esto no es un PDF'),
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from(' %PDF-1.4 con un espacio antes'),
      Buffer.from('%PDF'),
      Buffer.from('%pdf-1.4 en minúsculas'),
      Buffer.alloc(0),
      Buffer.from('MZ\x90\x00 un ejecutable', 'latin1'),
    ];
    for (const contenido of intentos) {
      const r = await t.archivos.guardar({ ...BUENO, base64: b64(contenido) });
      assert.equal(r.ok, false, JSON.stringify(contenido.subarray(0, 12)));
      assert.ok(['NO_ES_PDF', 'ARGUMENTOS'].includes(r.codigo), r.codigo);
      assert.ok(typeof r.mensaje === 'string' && r.mensaje.length > 0);
    }
    assert.equal((await t.archivos.guardar({ ...BUENO, base64: b64(Buffer.from('hola')) })).codigo, 'NO_ES_PDF');
    assert.deepEqual(arbol(t.documentos), []);
  } finally {
    t.limpiar();
  }
});

test('guardar: un base64 que no es base64, o que no es texto, se rechaza', async () => {
  const t = armar();
  try {
    for (const base64 of ['***', '%PDF-1.4', 'AAA', 'AA==AA==', 12, null, undefined, {}, ['JVBERi0=']]) {
      const r = await t.archivos.guardar({ ...BUENO, base64 });
      assert.equal(r.ok, false, String(base64));
      assert.equal(r.codigo, 'ARGUMENTOS');
    }
    assert.deepEqual(arbol(t.documentos), []);
  } finally {
    t.limpiar();
  }
});

test('guardar: el nombre no viene libre: un folio con ..\\, /, C:\\, nombres reservados o demasiado largo se rechaza', async () => {
  const t = armar();
  try {
    const folios = [
      '..\\..\\Windows\\x',
      '../../x',
      '..',
      '.',
      'a/b',
      'a\\b',
      'C:\\x',
      'C:',
      '\\\\servidor\\recurso',
      'CON',
      'con',
      'NUL',
      'Prn',
      'AUX',
      'COM1',
      'lpt9',
      'a'.repeat(25),
      '1'.repeat(200),
      '',
      ' ',
      'A B',
      'A.pdf',
      'A:1',
      'A*1',
      'A?1',
      'A<1',
      'A\u0000B',
      'A\nB',
      '-A',
      'A-',
      'A--1',
      'A-B-C-D',
      'Ñandú',
      'sin folio',
      7,
      null,
      undefined,
      {},
    ];
    for (const folio of folios) {
      const r = await t.archivos.guardar({ ...BUENO, folio });
      assert.equal(r.ok, false, `folio ${JSON.stringify(folio)}`);
      assert.equal(r.codigo, 'ARGUMENTOS', `folio ${JSON.stringify(folio)}`);
    }
    assert.deepEqual(arbol(t.documentos), []);
    // Y lo que sí es un folio de la página (serie y número) pasa.
    for (const folio of ['CC-2', 'DPC-0102', 'CT-15', '42', 'A'.repeat(24)]) {
      assert.equal((await t.archivos.guardar({ ...BUENO, folio })).ok, true, folio);
    }
  } finally {
    t.limpiar();
  }
});

test('guardar: la fecha tiene que ser AAAA-MM-DD y existir en el calendario', async () => {
  const t = armar();
  try {
    const fechas = ['2026-13-01', '2026-00-10', '2026-02-30', '2026-11-31', '2026-11-00', '2026/11/16', '16-11-2026', '20261116', '2026-11-16T10:00', '2026-11-16\\..', '..\\..-11-16', '1999-12-31', '2101-01-01', '', ' 2026-11-16', 20261116, null, undefined];
    for (const fecha of fechas) {
      const r = await t.archivos.guardar({ ...BUENO, fecha });
      assert.equal(r.ok, false, `fecha ${JSON.stringify(fecha)}`);
      assert.equal(r.codigo, 'ARGUMENTOS', `fecha ${JSON.stringify(fecha)}`);
    }
    assert.equal((await t.archivos.guardar({ ...BUENO, fecha: '2028-02-29' })).ok, true, 'bisiesto');
    assert.deepEqual(arbol(t.documentos).filter((x) => x.endsWith('.pdf')), ['POS Don Poncho/Cortes/2028-02/Corte-DPC-0102-2028-02-29.pdf']);
  } finally {
    t.limpiar();
  }
});

test('guardar: sólo se aceptan folio, fecha y base64; una ruta, un nombre o un destino que traiga la página se rechazan', async () => {
  const t = armar();
  try {
    for (const extra of [{ ruta: 'C:\\Windows\\x.pdf' }, { nombre: 'x.pdf' }, { carpeta: '..' }, { destino: 'C:\\' }, { tipo: 'cierre' }]) {
      const r = await t.archivos.guardar({ ...BUENO, ...extra });
      assert.equal(r.ok, false, JSON.stringify(extra));
      assert.equal(r.codigo, 'ARGUMENTOS');
    }
    for (const datos of [undefined, null, 'x', 5, [], [BUENO], () => BUENO]) {
      const r = await t.archivos.guardar(datos);
      assert.equal(r.ok, false);
      assert.equal(r.codigo, 'ARGUMENTOS');
    }
    assert.deepEqual(arbol(t.documentos), []);
  } finally {
    t.limpiar();
  }
});

test('guardar: el tope de tamaño — el máximo pasa, un byte más no, y un texto enorme ni se decodifica', async () => {
  const t = armar();
  try {
    const justo = Buffer.concat([PDF, Buffer.alloc(MAX_BYTES - PDF.length, 0x20)]);
    assert.equal(justo.length, MAX_BYTES);
    const bien = await t.archivos.guardar({ ...BUENO, base64: b64(justo) });
    assert.equal(bien.ok, true);
    assert.equal(fs.statSync(bien.ruta).size, MAX_BYTES);
    fs.rmSync(path.dirname(bien.ruta), { recursive: true, force: true });

    const pasado = Buffer.concat([justo, Buffer.from([0x20])]);
    const mal = await t.archivos.guardar({ ...BUENO, base64: b64(pasado) });
    assert.deepEqual([mal.ok, mal.codigo], [false, 'MUY_GRANDE']);

    const gigante = await t.archivos.guardar({ ...BUENO, base64: 'A'.repeat(MAX_BYTES * 2) });
    assert.deepEqual([gigante.ok, gigante.codigo], [false, 'MUY_GRANDE']);
    // El tope se mira ANTES de revisar o decodificar el texto: uno enorme con basura dice «grande», no «inválido».
    const basura = await t.archivos.guardar({ ...BUENO, base64: '*'.repeat(MAX_BYTES * 2) });
    assert.deepEqual([basura.ok, basura.codigo], [false, 'MUY_GRANDE']);
    assert.deepEqual(arbol(t.carpeta).filter((x) => x.endsWith('.pdf')), []);
  } finally {
    t.limpiar();
  }
});

test('guardar: dos veces el mismo corte no duplica ni revienta (igual → «ya-estaba»; cambiado → «reemplazado»)', async () => {
  const t = armar();
  try {
    const primera = await t.archivos.guardar(BUENO);
    const mtime = fs.statSync(primera.ruta).mtimeMs;
    const segunda = await t.archivos.guardar(BUENO);
    assert.deepEqual([segunda.ok, segunda.estado, segunda.ruta], [true, 'ya-estaba', primera.ruta]);
    assert.equal(fs.statSync(primera.ruta).mtimeMs, mtime, 'lo igual no se reescribe');

    const otro = Buffer.concat([PDF, Buffer.from('% generado otra vez\n')]);
    const tercera = await t.archivos.guardar({ ...BUENO, base64: b64(otro) });
    assert.deepEqual([tercera.ok, tercera.estado, tercera.ruta], [true, 'reemplazado', primera.ruta]);
    assert.deepEqual(fs.readFileSync(primera.ruta), otro);

    assert.deepEqual(arbol(t.documentos).filter((x) => x.endsWith('.pdf') || x.includes('.tmp')), ['POS Don Poncho/Cortes/2026-11/Corte-DPC-0102-2026-11-16.pdf']);
    // Dos guardados a la vez del mismo corte tampoco se pisan ni dejan temporales.
    const [a, b] = await Promise.all([t.archivos.guardar(BUENO), t.archivos.guardar({ ...BUENO, base64: b64(PDF) })]);
    assert.deepEqual([a.ok, b.ok], [true, true]);
    assert.deepEqual(fs.readdirSync(path.dirname(primera.ruta)), ['Corte-DPC-0102-2026-11-16.pdf']);
  } finally {
    t.limpiar();
  }
});

test('guardar: si el destino quedara FUERA de la carpeta de cortes, no se escribe (defensa aunque el nombre se armara mal)', async () => {
  const hostiles = ['..\\fuera.pdf', '../fuera.pdf', '..\\..\\..\\Windows\\fuera.pdf', 'C:\\fuera.pdf', '\\\\servidor\\x\\fuera.pdf', '/etc/fuera.pdf'];
  for (const hostil of hostiles) {
    const t = armar({ armarNombre: () => hostil });
    try {
      const r = await t.archivos.guardar(BUENO);
      assert.deepEqual([r.ok, r.codigo], [false, 'FUERA_DE_CARPETA'], hostil);
      assert.deepEqual(arbol(t.documentos).filter((x) => x.endsWith('.pdf')), [], hostil);
      assert.equal(fs.existsSync(path.join(path.dirname(t.documentos), 'fuera.pdf')), false);
    } finally {
      t.limpiar();
    }
  }
});

test('estaDentro: sólo lo que de verdad está bajo la carpeta (no hermanas con el mismo prefijo, ni ..)', () => {
  const base = path.resolve('C:\\Users\\x\\Documents\\POS Don Poncho\\Cortes');
  assert.equal(estaDentro(base, path.join(base, '2026-11', 'a.pdf')), true);
  assert.equal(estaDentro(base, path.join(base, 'a.pdf')), true);
  assert.equal(estaDentro(base, base), false, 'la carpeta misma no es un archivo');
  assert.equal(estaDentro(base, path.resolve(base, '..', 'a.pdf')), false);
  assert.equal(estaDentro(base, path.resolve(base, '..\\Cortes-otros\\a.pdf')), false);
  assert.equal(estaDentro(base, `${base}-otros\\a.pdf`), false);
  assert.equal(estaDentro(base, path.resolve('D:\\Cortes\\a.pdf')), false);
  assert.equal(estaDentro(base, path.resolve(base, '2026-11', '..', '..', 'a.pdf')), false);
});

test('guardar: nunca lanza; un disco que falla vuelve como resultado con un motivo en español', async () => {
  const t = armar();
  try {
    // Documentos ES un archivo: no se puede crear nada debajo.
    const archivoComoCarpeta = path.join(t.documentos, 'no-es-carpeta');
    fs.writeFileSync(archivoComoCarpeta, 'x');
    const roto = crearArchivos({ carpetaDocumentos: archivoComoCarpeta, shell: { openPath: async () => '' }, registrar: (m) => t.registros.push(m) });
    const r = await roto.guardar(BUENO);
    assert.deepEqual([r.ok, r.codigo], [false, 'NO_SE_PUDO']);
    assert.match(r.mensaje, /[a-záéíóú]/i);
    assert.equal(t.registros.length > 0, true, 'el fallo se anota para el diagnóstico, no se traga');

    // Un lector de PDF tiene abierto el archivo: el guardado falla con un resultado y NO deja temporales.
    const ok = await t.archivos.guardar(BUENO);
    const fsFalso = { ...fs.promises, rename: async () => { throw Object.assign(new Error("EBUSY: resource busy or locked"), { code: "EBUSY" }); } };
    const ocupado = armar({ fs: fsFalso });
    try {
      await ocupado.archivos.guardar(BUENO).then((x) => assert.equal(x.ok, false));
      assert.deepEqual(arbol(ocupado.documentos).filter((x) => x.includes('.tmp') || x.endsWith('.pdf')), []);
    } finally {
      ocupado.limpiar();
    }
    assert.deepEqual(fs.readFileSync(ok.ruta), PDF);
  } finally {
    t.limpiar();
  }
});

test('abrirCarpeta: abre ESA carpeta de cortes (la crea si falta) y no acepta otra ruta', async () => {
  const t = armar();
  try {
    assert.equal(t.archivos.abrirCarpeta.length, 0, 'sin parámetro de ruta');
    const r = await t.archivos.abrirCarpeta();
    assert.deepEqual([r.ok, r.ruta], [true, t.carpeta]);
    assert.deepEqual(t.abiertas, [t.carpeta]);
    assert.equal(fs.statSync(t.carpeta).isDirectory(), true);

    // Aunque la página insista con una ruta (por el puente le llegan los argumentos tal cual), se ignora.
    for (const ruta of ['C:\\Windows', '..\\..', 'cmd.exe', { ruta: 'C:\\' }, ['C:\\']]) {
      await t.archivos.abrirCarpeta(ruta);
    }
    assert.deepEqual(t.abiertas, Array(6).fill(t.carpeta));
  } finally {
    t.limpiar();
  }
});

test('abrirCarpeta: si el Explorador no abre, o el shell lanza, vuelve un resultado; nunca lanza', async () => {
  const mal = armar({ shell: { openPath: async () => 'No se pudo abrir' } });
  const lanza = armar({ shell: { openPath: async () => { throw new Error('boom'); } } });
  try {
    const a = await mal.archivos.abrirCarpeta();
    assert.deepEqual([a.ok, a.codigo], [false, 'NO_SE_PUDO']);
    const b = await lanza.archivos.abrirCarpeta();
    assert.deepEqual([b.ok, b.codigo], [false, 'NO_SE_PUDO']);
    assert.equal(lanza.registros.length, 1);
  } finally {
    mal.limpiar();
    lanza.limpiar();
  }
});

// --- el tercer cerrojo: sólo el origen de producción ---------------------------------------------------

function ipcFalso() {
  const manejadores = new Map();
  return {
    handle: (canal, f) => manejadores.set(canal, f),
    removeHandler: (canal) => manejadores.delete(canal),
    on: () => {},
    removeAllListeners: () => {},
    invocar: (canal, url, ...args) => manejadores.get(canal)({ senderFrame: url === undefined ? null : { url } }, ...args),
  };
}

test('origen: archivos.guardar y archivos.abrirCarpeta sólo desde el origen de producción; otro origen (o pantalla interna) → ORIGEN sin ejecutar nada', async () => {
  const DOMINIO = 'pos-don-poncho.vercel.app';
  const t = armar();
  try {
    const ipc = ipcFalso();
    registrarPuente({
      ipcMain: ipc,
      permitido: () => true, // el puente en general lo dejaría pasar (p. ej. una pantalla interna)…
      reglas: { 'archivos.guardar': (url) => esOrigenDelCliente(url, DOMINIO), 'archivos.abrirCarpeta': (url) => esOrigenDelCliente(url, DOMINIO) },
      metodos: { 'archivos.guardar': (d) => t.archivos.guardar(d), 'archivos.abrirCarpeta': () => t.archivos.abrirCarpeta() },
      registrar: () => {},
    });
    const ajenas = [`https://${DOMINIO}.evil.com/`, `http://${DOMINIO}/`, 'https://otro.vercel.app/', `https://evil.com/?u=${DOMINIO}`, 'file:///C:/Users/x/pantallas/diagnostico.html', 'about:blank', '', undefined];
    for (const url of ajenas) {
      for (const canal of ['morphiq:archivos.guardar', 'morphiq:archivos.abrirCarpeta']) {
        const r = await ipc.invocar(canal, url, BUENO);
        assert.deepEqual([r.ok, r.error?.codigo], [false, 'ORIGEN'], `${canal} desde ${url}`);
      }
    }
    assert.deepEqual(arbol(t.documentos), [], 'ni un archivo ni una carpeta');
    assert.deepEqual(t.abiertas, []);

    const bueno = await ipc.invocar('morphiq:archivos.guardar', `https://${DOMINIO}/n/don-poncho/registros`, BUENO);
    assert.deepEqual([bueno.ok, bueno.valor.ok, bueno.valor.estado], [true, true, 'guardado']);
    const abrir = await ipc.invocar('morphiq:archivos.abrirCarpeta', `https://${DOMINIO}/`);
    assert.deepEqual([abrir.ok, abrir.valor.ok], [true, true]);
  } finally {
    t.limpiar();
  }
});

// --- el preload y el cableado ---------------------------------------------------------------------------

/** Carga el preload REAL con un `electron` de mentira y devuelve lo que expone y lo que mandó por IPC. */
function cargarPreload() {
  const Module = require('node:module');
  const archivo = require.resolve('../precarga/preload.js');
  const enviados = [];
  let expuesto = null;
  const electron = {
    contextBridge: { exposeInMainWorld: (nombre, valor) => (expuesto = { nombre, valor }) },
    ipcRenderer: {
      sendSync: () => true,
      on: () => {},
      invoke: async (canal, ...args) => (enviados.push([canal, ...args]), { ok: true, valor: { ok: true } }),
    },
  };
  const cargarOriginal = Module._load;
  Module._load = function (peticion, ...resto) {
    return peticion === 'electron' ? electron : cargarOriginal.call(this, peticion, ...resto);
  };
  try {
    delete require.cache[archivo];
    require(archivo);
  } finally {
    Module._load = cargarOriginal;
    delete require.cache[archivo];
  }
  return { expuesto, enviados };
}

test('preload: expone `archivos` con SÓLO guardar y abrirCarpeta, y anuncia la capacidad «archivos»', async () => {
  const { expuesto, enviados } = cargarPreload();
  const puente = expuesto.valor;
  assert.equal(expuesto.nombre, 'MorphiqApp');
  assert.deepEqual([...puente.capacidades], ['archivos']);
  assert.deepEqual(Object.keys(puente.archivos).sort(), ['abrirCarpeta', 'guardar']);
  assert.equal(Object.isFrozen(puente.archivos) && Object.isFrozen(puente.capacidades), true);

  await puente.archivos.guardar(BUENO);
  await puente.archivos.abrirCarpeta('C:\\Windows', { ruta: 'C:\\' });
  assert.deepEqual(enviados, [['morphiq:archivos.guardar', BUENO], ['morphiq:archivos.abrirCarpeta']], 'abrirCarpeta no manda argumentos por el IPC');
});

test('aplicacion: los dos métodos de archivos se registran con la regla «sólo origen de producción»', () => {
  const fuente = fs.readFileSync(path.join(__dirname, '..', 'principal', 'aplicacion.js'), 'utf8');
  assert.match(fuente, /soloProduccion = \(url\) => esOrigenDelCliente\(url, cliente\.dominio\)/, 'la regla usa la comprobación de origen que ya existía');
  assert.match(fuente, /reglas: \{ 'archivos\.guardar': soloProduccion, 'archivos\.abrirCarpeta': soloProduccion \}/);
  assert.match(fuente, /crearArchivos\(\{ carpetaDocumentos: app\.getPath\('documents'\)/, 'la carpeta sale de Documentos del usuario');
  assert.match(fuente, /registrarPuente\(\{[^}]*reglas/s, 'las reglas llegan a registrarPuente');
});
