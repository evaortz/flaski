import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shortcut, textToBlocks, splitBlock, mergeBlocks, clozeFrom, pageTitle, newBlock, parseTable, isTableText, TABLE_TEMPLATE, cardsStatus, sectionIds, pageToMarkdown, pageSnippet } from '../../js/pages.js';

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

test('estado de un grupo de tarjetas', () => {
  const NOW = 1e12, DAY = 864e5;
  const ok = { interval: 10, lapses: 0, due: NOW + DAY }, due = { interval: 3, lapses: 0, due: NOW - 1 };
  const relearning = { interval: 0, lapses: 1, due: NOW + 60e3 }, leech = { interval: 4, lapses: 3, due: NOW + DAY };
  assert.equal(cardsStatus([], NOW), null);
  assert.equal(cardsStatus([null, null], NOW), 'new');
  assert.equal(cardsStatus([ok, ok], NOW), 'ok');
  assert.equal(cardsStatus([ok, null], NOW), 'new');
  assert.equal(cardsStatus([ok, due, null], NOW), 'due');
  assert.equal(cardsStatus([ok, due, relearning], NOW), 'weak');
  assert.equal(cardsStatus([leech], NOW), 'weak');
  assert.equal(cardsStatus([{ interval: 0, lapses: 0, reps: 0, due: NOW + 60e3 }], NOW), 'weak');   // nueva fallada
});

test('apartados: un título y lo que cuelga de él', () => {
  const blocks = [
    { id: 'a', type: 'h1' }, { id: 'b', type: 'p' }, { id: 'c', type: 'h2' }, { id: 'd', type: 'li' },
    { id: 'e', type: 'h2' }, { id: 'f', type: 'table' }, { id: 'g', type: 'h1' }, { id: 'h', type: 'p' },
  ];
  assert.deepEqual(sectionIds(blocks, 'a'), ['a', 'b', 'c', 'd', 'e', 'f']);
  assert.deepEqual(sectionIds(blocks, 'c'), ['c', 'd']);
  assert.deepEqual(sectionIds(blocks, 'e'), ['e', 'f']);
  assert.deepEqual(sectionIds(blocks, 'b'), ['b']);
  assert.deepEqual(sectionIds(blocks, 'x'), []);
});

test('exportar a Markdown y volver a importar da lo mismo', () => {
  const blocks = textToBlocks('## Locativo\n\nIndica **dónde**.\n\n- evde\n- okulda\n\n| Caso | Sufijo |\n|---|---|\n| Loc | -de |');
  const md = pageToMarkdown({ title: 'Casos', blocks });
  assert.equal(md, '# Casos\n\n## Locativo\n\nIndica **dónde**.\n\n- evde\n- okulda\n\n| Caso | Sufijo |\n|---|---|\n| Loc | -de |\n');
  // Como al pegarlo en «Pegar apuntes»: el primer título es el del apunte y el resto queda igual
  const back = textToBlocks(md);
  const title = back.shift();
  assert.deepEqual([title.type, title.text], ['h1', 'Casos']);
  assert.deepEqual(back.map(b => [b.type, b.text]), blocks.map(b => [b.type, b.text]));
});

test('vista previa de una página', () => {
  assert.equal(pageSnippet({ blocks: [{ type: 'h1', text: 'Título' }, { type: 'p', text: 'El **locativo** es Ev{{de::lugar}}yim' }] }), 'El locativo es Evdeyim');
  assert.equal(pageSnippet({ blocks: [] }), '');
});

test('título de la página', () => {
  assert.equal(pageTitle({ title: ' Casos ', blocks: [] }), 'Casos');
  assert.equal(pageTitle({ title: '', blocks: [newBlock('p', ''), newBlock('p', 'El **locativo**')] }), 'El locativo');
  assert.equal(pageTitle({ title: '', blocks: [] }), 'Sin título');
});
