import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shortcut, textToBlocks, splitBlock, mergeBlocks, clozeFrom, pageTitle, newBlock, parseTable, isTableText, TABLE_TEMPLATE } from '../../js/pages.js';

test('atajos: # título, ## subtítulo, - lista', () => {
  assert.deepEqual(shortcut('# Casos'), { type: 'h1', text: 'Casos' });
  assert.deepEqual(shortcut('## Locativo'), { type: 'h2', text: 'Locativo' });
  assert.deepEqual(shortcut('- evde'), { type: 'li', text: 'evde' });
  assert.equal(shortcut('#sin espacio'), null);
  assert.equal(shortcut('texto normal'), null);
});

test('texto pegado → bloques: títulos, listas y párrafos unidos', () => {
  const b = textToBlocks('# Turco\n\nEl locativo indica\ndónde está algo.\n\n- evde: en casa\n- okulda: en la escuela\n');
  assert.deepEqual(b.map(x => [x.type, x.text]), [
    ['h1', 'Turco'], ['p', 'El locativo indica dónde está algo.'], ['li', 'evde: en casa'], ['li', 'okulda: en la escuela'],
  ]);
  assert.equal(new Set(b.map(x => x.id)).size, 4);
});

test('partir y unir bloques conserva los ids del original', () => {
  const b = { id: 'b1', type: 'li', text: 'evde okulda' };
  const [a, c] = splitBlock(b, 4);
  assert.equal(a.id, 'b1');
  assert.equal(a.text, 'evde');
  assert.equal(c.text, ' okulda'.slice(0));
  assert.equal(c.type, 'li');
  assert.notEqual(c.id, 'b1');
  assert.equal(splitBlock({ id: 'h', type: 'h1', text: 'Título' }, 6)[1].type, 'p');
  const m = mergeBlocks({ id: 'b1', type: 'p', text: 'Hola ' }, { id: 'b2', type: 'p', text: 'mundo' });
  assert.deepEqual(m, { block: { id: 'b1', type: 'p', text: 'Hola mundo' }, caret: 5 });
});

test('hueco a partir de lo seleccionado', () => {
  assert.equal(clozeFrom('Evdeyim, evdesin', 'de'), 'Ev{{de}}yim, evdesin');
  assert.equal(clozeFrom('Evdeyim, evdesin', 'de', 11), 'Evdeyim, ev{{de}}sin');
  assert.equal(clozeFrom('Evdeyim', 'xyz'), null);
  assert.equal(clozeFrom('Evdeyim', '  '), null);
});

test('tablas en Markdown: cabecera, alineación, filas y barras escapadas', () => {
  const t = parseTable('| Caso | Sufijo | Ejemplo |\n| :--- | :---: | ---: |\n| Locativo | -de | ev**de** |\n| A\\|B | -e |');
  assert.deepEqual(t.head, ['Caso', 'Sufijo', 'Ejemplo']);
  assert.deepEqual(t.align, ['left', 'center', 'right']);
  assert.deepEqual(t.rows, [['Locativo', '-de', 'ev**de**'], ['A|B', '-e', '']]);
  assert.equal(parseTable('| sin separador |\n| fila |'), null);
  assert.equal(isTableText(TABLE_TEMPLATE), true);
});

test('texto pegado con una tabla: la tabla es un bloque', () => {
  const b = textToBlocks('Los casos:\n| Caso | Sufijo |\n|---|---|\n| Locativo | -de |\nY más texto');
  assert.deepEqual(b.map(x => x.type), ['p', 'table', 'p']);
  assert.equal(b[1].text, '| Caso | Sufijo |\n|---|---|\n| Locativo | -de |');
  assert.deepEqual(textToBlocks('| a | b |\n| c | d |').map(x => x.type), ['p']);   // sin separador no es tabla
});

test('título de la página', () => {
  assert.equal(pageTitle({ title: ' Casos ', blocks: [] }), 'Casos');
  assert.equal(pageTitle({ title: '', blocks: [newBlock('p', ''), newBlock('p', 'El **locativo**')] }), 'El locativo');
  assert.equal(pageTitle({ title: '', blocks: [] }), 'Sin título');
});
