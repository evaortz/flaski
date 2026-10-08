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
  // Cada columna llena su mitad de la página (40 letras ≈ 220 puntos)
  const L = n => `Izquierda ${n} con texto de una columna larga`.padEnd(40, '.'), R = n => `Derecha ${n} con texto de otra columna larga`.padEnd(40, '.');
  const cols = pageLines(page([1, 2, 3].flatMap((n, i) => [it(L(n), 50, 700 - i * 14), it(R(n), 320, 700 - i * 14)])));
  assert.deepEqual(cols.map(l => l.text.split(' ').slice(0, 2).join(' ')), ['Izquierda 1', 'Izquierda 2', 'Izquierda 3', 'Derecha 1', 'Derecha 2', 'Derecha 3']);
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

test('tablas: columnas alineadas → tabla en Markdown, con celdas de varias líneas', () => {
  // Caso | Sufijo | Ejemplo, a la izquierda de cada columna; «Dativo» tiene un ejemplo en dos líneas
  const row = (y, a, b, c) => [it(a, 50, y), it(b, 200, y), it(c, 330, y)].filter(x => x.str);
  const p = page([
    it('Los casos', 50, 780, 16),
    ...row(740, 'Caso', 'Sufijo', 'Ejemplo'),
    ...row(724, 'Locativo', '-de / -da', 'evde'),
    ...row(708, 'Dativo', '-e / -a', 'eve (a casa),'),
    it('okula', 330, 695),
    ...row(679, 'Ablativo', '-den / -dan', 'evden'),
    it('Después de la tabla sigue el texto normal.', 50, 640),
  ]);
  const { blocks } = pdfToBlocks([p]);
  assert.deepEqual(blocks.map(b => b.type), ['h2', 'table', 'p']);
  blocks.shift();
  assert.equal(blocks[0].text, [
    '| Caso | Sufijo | Ejemplo |', '| --- | --- | --- |',
    '| Locativo | -de / -da | evde |', '| Dativo | -e / -a | eve (a casa), okula |', '| Ablativo | -den / -dan | evden |',
  ].join('\n'));
});

test('tablas: una lista con tabulador o un párrafo no son tablas', () => {
  const p = page([
    it('•', 60, 700), it('primera cosa', 90, 700),
    it('•', 60, 686), it('segunda cosa', 90, 686),
    it('Un párrafo normal con palabras', 50, 650), it('seguidas.', 50 + 30 * 5.5 + 3, 650),
  ]);
  assert.deepEqual(pdfToBlocks([p]).blocks.map(b => [b.type, b.text]), [['li', 'primera cosa'], ['li', 'segunda cosa'], ['p', 'Un párrafo normal con palabras seguidas.']]);
});
