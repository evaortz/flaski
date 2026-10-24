// Modo local de pruebas: solo con «?local» y solo en este ordenador
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLocalTest, localTest, LOCAL_KEY, MEDIA_DB } from '../../js/modo.js';

const at = url => { const u = new URL(url); return { hostname: u.hostname, search: u.search }; };

test('se activa con ?local en localhost, 127.0.0.1 y [::1]', () => {
  for (const url of ['http://localhost:8000/?local', 'http://127.0.0.1:8123/?local=1', 'http://[::1]:8000/?x=1&local', 'http://LOCALHOST/?local'])
    assert.equal(isLocalTest(at(url)), true, url);
});

test('nunca fuera de localhost, ni sin ?local', () => {
  for (const url of ['https://flaski.netlify.app/?local', 'https://localhost.example.com/?local', 'http://192.168.1.10:8000/?local',
    'http://localhost:8000/', 'http://localhost:8000/?locale=es', 'http://localhost:8000/#local'])
    assert.equal(isLocalTest(at(url)), false, url);
  assert.equal(isLocalTest(undefined), false);
});

test('fuera del navegador no está activo y usa las claves de siempre', () => {
  assert.equal(localTest, false);
  assert.equal(LOCAL_KEY, 'flaski-local-v1');
  assert.equal(MEDIA_DB, 'flaski-media');
});
