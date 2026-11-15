'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { origenPermitido, esOrigenDelCliente, esPantallaInterna } = require('../principal/origen');

const DOMINIO = 'pos-don-poncho.vercel.app';
const CARPETA = path.resolve(__dirname, 'fixtures', 'pantallas');
const contexto = { dominio: DOMINIO, carpetaPantallas: CARPETA };
const pantalla = (nombre) => pathToFileURL(path.join(CARPETA, nombre)).href;

test('acepta el POS de producción en cualquier ruta, con query y con hash', () => {
  for (const url of [
    `https://${DOMINIO}`,
    `https://${DOMINIO}/`,
    `https://${DOMINIO}/n/don-poncho/login-pos`,
    `https://${DOMINIO}/a?x=1#h`,
    `HTTPS://POS-DON-PONCHO.VERCEL.APP/x`,
  ]) {
    assert.equal(origenPermitido(url, contexto), true, url);
  }
});

test('acepta archivos dentro de la carpeta de pantallas internas', () => {
  assert.equal(origenPermitido(pantalla('diagnostico.html'), contexto), true);
  assert.equal(origenPermitido(`${pantalla('sin-internet.html')}?x=1`, contexto), true);
});

test('rechaza las trampas de dominio', () => {
  const trampas = [
    `https://${DOMINIO}.evil.com`,
    `https://${DOMINIO}.evil.com/`,
    `https://evil.com/?u=${DOMINIO}`,
    `https://evil.com/${DOMINIO}`,
    `https://${DOMINIO}@evil.com/`,
    `https://evil.com@${DOMINIO}.evil.com/`,
    `https://x.${DOMINIO}/`,
    'https://otro-pos.vercel.app/',
    'https://vercel.app/',
    `https://${DOMINIO}:8443/`,
    `http://${DOMINIO}/`,
    `ftp://${DOMINIO}/`,
    `javascript:fetch('https://${DOMINIO}')`,
    `data:text/html,https://${DOMINIO}`,
    `blob:https://${DOMINIO}/abc`,
    `about:blank#${DOMINIO}`,
  ];
  for (const url of trampas) assert.equal(origenPermitido(url, contexto), false, url);
});

test('rechaza archivos fuera de la carpeta de pantallas', () => {
  const trampas = [
    pathToFileURL(path.resolve(__dirname, 'fixtures', 'otra', 'x.html')).href,
    pathToFileURL(path.resolve(CARPETA, '..', 'secreto.html')).href,
    `${pathToFileURL(CARPETA).href}/../secreto.html`,
    pathToFileURL(`${CARPETA}-hermana${path.sep}x.html`).href,
    pathToFileURL(CARPETA).href,
    'file:///C:/Windows/System32/drivers/etc/hosts',
    'file://servidor-raro/recurso/x.html',
  ];
  for (const url of trampas) assert.equal(origenPermitido(url, contexto), false, url);
});

test('rechaza URL vacía, inválida o que no es texto', () => {
  for (const url of ['', ' ', 'no es una url', '//pos-don-poncho.vercel.app', undefined, null, 42, {}]) {
    assert.equal(origenPermitido(url, contexto), false, String(url));
  }
});

test('sin dominio o sin carpeta configurados no deja pasar nada', () => {
  assert.equal(esOrigenDelCliente(`https://${DOMINIO}/`, ''), false);
  assert.equal(esOrigenDelCliente(`https://${DOMINIO}/`, undefined), false);
  assert.equal(esPantallaInterna(pantalla('x.html'), ''), false);
});
