import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, cardsFromCSV, cardsToCSV } from '../../js/csv.js';

test('detecta el separador: coma, punto y coma y tabulador', () => {
  assert.deepEqual(parseCSV('a,b\nc,d'), [['a', 'b'], ['c', 'd']]);
  assert.deepEqual(parseCSV('a;b\nc;d'), [['a', 'b'], ['c', 'd']]);
  assert.deepEqual(parseCSV('a\tb\nc\td'), [['a', 'b'], ['c', 'd']]);
});

test('comillas: separadores, saltos de línea y comillas dobles dentro', () => {
  const rows = parseCSV('"a;1";"línea 1\nlínea 2";"dice ""hola"""\r\nx;y;z');
  assert.deepEqual(rows, [['a;1', 'línea 1\nlínea 2', 'dice "hola"'], ['x', 'y', 'z']]);
});

test('reconoce la cabecera por nombre, en cualquier orden y sin tildes', () => {
  const { cards, hadHeader } = cardsFromCSV('Traducción,Palabra,Ejemplo\ncasa,ev,evdeyim');
  assert.equal(hadHeader, true);
  assert.deepEqual(cards, [{ front: 'ev', back: 'casa', note: 'evdeyim' }]);
});

test('sin cabecera: pregunta, respuesta, nota; salta filas incompletas', () => {
  const r = cardsFromCSV('ev;casa\nsolo\nkapı;puerta;nota');
  assert.equal(r.hadHeader, false);
  assert.equal(r.skipped, 1);
  assert.deepEqual(r.cards.map(c => c.front), ['ev', 'kapı']);
});

test('exportaciones de Anki como texto', () => {
  const r = cardsFromCSV('#separator:tab\n#html:false\nev\tcasa\n');
  assert.deepEqual(r.cards, [{ front: 'ev', back: 'casa', note: '' }]);
});

test('archivo vacío o sin tarjetas da un error claro', () => {
  assert.throws(() => cardsFromCSV(''), /vacío/);
  assert.throws(() => cardsFromCSV('a\nb'), /No se encontraron tarjetas/);
});

test('ida y vuelta: exportar e importar conserva todo, con BOM para Excel', () => {
  const cards = [
    { front: 'çiçek', back: 'flor; "planta"', note: 'línea 1\nlínea 2' },
    { front: 'espacio', back: 'ğ ı ş ö ü', note: '' },
  ];
  const csv = cardsToCSV(cards);
  assert.ok(csv.startsWith('﻿'));
  assert.deepEqual(cardsFromCSV(csv).cards, cards);
});
