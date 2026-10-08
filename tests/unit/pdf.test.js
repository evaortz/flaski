import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pdfToBlocks, pageLines, cleanTitle } from '../../js/pdf.js';

// Una línea de texto como la da pdf.js: varios trozos seguidos en la misma altura
const W = 595, H = 842;
const it = (str, x, y, h = 11, bold = false) => ({ str, x, y, w: str.length * h * 0.5, h, bold });
const page = items => ({ width: W, height: H, items });

test('líneas: junta los trozos de una línea y lee primero la columna izquierda', () => {
  const lines = pageLines(page([it('Hola', 50, 700), it('mundo', 50 + 4 * 5.5 + 3, 700), it('Segunda', 50, 686)]));
  assert.deepEqual(lines.map(l => l.text), ['Hola mundo', 'Segunda']);
  const cols = pageLines(page([
    it('Izquierda uno', 50, 700), it('Derecha uno', 320, 700), it('Izquierda dos', 50, 686), it('Derecha dos', 320, 686),
    it('Izquierda tres', 50, 672), it('Derecha tres', 320, 672),
  ]));
  assert.deepEqual(cols.map(l => l.text), ['Izquierda uno', 'Izquierda dos', 'Izquierda tres', 'Derecha uno', 'Derecha dos', 'Derecha tres']);
});

test('PDF → bloques: títulos por tamaño o negrita, párrafos unidos, listas, guiones y sin números de página', () => {
  const p1 = page([
    it('Los casos del turco', 50, 780, 22),
    it('1. El locativo', 50, 740, 16),
    it('El locativo indica dónde está algo. Se forma', 50, 715),
    it('con el sufijo -de o -da según la armo-', 50, 702),
    it('nía vocálica.', 50, 689),
    it('Ejemplos', 50, 660, 11, true),
    it('• evde: en casa', 60, 640),
    it('• okulda: en la escuela, que', 60, 627),
    it('está lejos', 70, 614),
    it('1', W / 2, 30),
  ]);
  const p2 = page([
    it('Otro párrafo en la página siguiente que', 50, 780),
    it('sigue aquí.', 50, 767),
    it('2', W / 2, 30),
  ]);
  const { blocks, title } = pdfToBlocks([p1, p2]);
  assert.equal(title, 'Los casos del turco');
  assert.deepEqual(blocks.map(b => [b.type, b.text]), [
    ['h2', '1. El locativo'],
    ['p', 'El locativo indica dónde está algo. Se forma con el sufijo -de o -da según la armonía vocálica.'],
    ['h3', 'Ejemplos'],
    ['li', 'evde: en casa'],
    ['li', 'okulda: en la escuela, que está lejos'],
    ['p', 'Otro párrafo en la página siguiente que sigue aquí.'],
  ]);
});

test('cabeceras repetidas fuera y páginas escaneadas como imagen', () => {
  const pg = (n, text) => page([it('Apuntes de turco · Tema 3', 50, 815, 9), it(text, 50, 700), it(`Página ${n} de 4`, 250, 25, 9)]);
  const scanned = { width: W, height: H, items: [], image: true };
  const { blocks } = pdfToBlocks([pg(1, 'Uno.'), pg(2, 'Dos.'), scanned, pg(4, 'Cuatro.')]);
  assert.deepEqual(blocks.map(b => [b.type, b.text, b.image]), [['p', 'Uno.', undefined], ['p', 'Dos.', undefined], ['img', 'Página 3', 2], ['p', 'Cuatro.', undefined]]);
});

test('títulos de los metadatos', () => {
  assert.equal(cleanTitle('Microsoft Word - Tema 1.docx'), 'Tema 1');
  assert.equal(cleanTitle('untitled'), '');
  assert.equal(cleanTitle(undefined), '');
});
