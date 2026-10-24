import { test } from 'node:test';
import assert from 'node:assert/strict';
import { citedArticles, cardMapState, cellState, groupCards, artRange } from '../../js/mapa.js';

const nums = t => citedArticles(t).map(a => a.n);

test('artículos: el número termina ahí («art. 14» no es «art. 140»)', () => {
  assert.deepEqual(nums('Según el art. 140, los municipios…'), [140]);
  assert.deepEqual(nums('art. 14'), [14]);
  assert.deepEqual(nums('El artículo 1.1 de la Constitución'), [1]);
  assert.deepEqual(nums('Ver el artículo 14a'), []);
  assert.deepEqual(nums('Artículo 9.3'), [9]);
});

test('artículos: listas y rangos (un rango de más de 5, solo el primero)', () => {
  assert.deepEqual(nums('arts. 14 y 15'), [14, 15]);
  assert.deepEqual(nums('artículos 14 a 16'), [14, 15, 16]);
  assert.deepEqual(nums('artículos 14, 15 y 20'), [14, 15, 20]);
  assert.deepEqual(nums('arts. 10–14'), [10, 11, 12, 13, 14]);
  assert.deepEqual(nums('artículos 10 a 55'), [10]);
  assert.deepEqual(nums('art. 14 y el art. 14'), [14]);
});

test('artículos: la ley que va detrás', () => {
  assert.deepEqual(citedArticles('art. 14 de la Constitución'), [{ law: 'Constitución', n: 14 }]);
  assert.deepEqual(citedArticles('art. 14 CE'), [{ law: 'Constitución', n: 14 }]);
  assert.deepEqual(citedArticles('el art. 31 LOTC'), [{ law: 'LOTC', n: 31 }]);
  assert.deepEqual(citedArticles('art. 2 de la Ley Orgánica del Tribunal Constitucional'), [{ law: 'Ley Orgánica del Tribunal Constitucional', n: 2 }]);
  assert.deepEqual(citedArticles('art. 5 dice'), [{ law: '', n: 5 }]);
});

test('estado de una pregunta: «se te resiste» mira solo las 5 últimas respuestas', () => {
  const now = Date.now(), ok = { interval: 10, due: now + 864e5 };
  const ev = gs => gs.map(grade => ({ grade }));
  assert.equal(cardMapState(null), 'new');
  assert.equal(cardMapState(ok, ev([1, 3, 1, 3, 1])), 'resiste');
  assert.equal(cardMapState(ok, ev([1, 1, 1, 3, 3, 3, 3, 3])), 'sabes');   // tres fallos, pero antiguos
  assert.equal(cardMapState(ok, ev([3, 3, 1])), 'resiste');               // la última, «Otra vez»
  assert.equal(cardMapState(ok, ev([3, 2])), 'medias');
  assert.equal(cardMapState({ interval: 3, due: now - 1 }, ev([3])), 'medias');   // ya toca
  assert.equal(cardMapState(ok, ev([3, 4])), 'sabes');
});

test('estado de una casilla: el peor de las empezadas; con alguna sin empezar, como mucho «A medias»', () => {
  assert.equal(cellState(['new', 'new']), 'new');
  assert.equal(cellState(['sabes', 'sabes']), 'sabes');
  assert.equal(cellState(['sabes', 'new']), 'medias');
  assert.equal(cellState(['sabes', 'resiste', 'new']), 'resiste');
  assert.equal(cellState(['medias', 'sabes']), 'medias');
});

const card = (id, front, extra = {}) => ({ id, front, back: '', fields: {}, position: Number(id.slice(1)) || 0, ...extra });

test('casillas por artículo, con «Sin artículo» y dos artículos en una pregunta', () => {
  const cards = [card('c1', '¿Qué dice el art. 14 CE?'), card('c2', 'arts. 14 y 15 de la Constitución'), card('c3', '¿Quién?'), card('c4', 'art. 31 LOTC')];
  const m = groupCards(cards);
  assert.equal(m.mode, 'art');
  assert.deepEqual(m.sections.map(s => s.name), ['Constitución', 'LOTC', 'Sin artículo']);
  assert.deepEqual(m.sections[0].cells.map(c => [c.label, c.ids]), [['14', ['c1', 'c2']], ['15', ['c2']]]);
  assert.equal(artRange(m.sections[0].cells), 'arts. 14–15');
});

test('casillas por apartado del apunte', () => {
  const page = { id: 'p', title: 'Finanzas', blocks: [
    { id: 'b0', type: 'h1', text: 'Tema 1 · VAN' }, { id: 'b1', type: 'h2', text: 'Valor temporal' }, { id: 'b2', type: 'p', text: 'x' },
    { id: 'b3', type: 'h2', text: 'TIR' }, { id: 'b4', type: 'p', text: 'y' }] };
  const cards = [card('c1', 'a', { page_id: 'p', block_id: 'b2' }), card('c2', 'b', { page_id: 'p', block_id: 'b4' }), card('c3', 'c', { page_id: 'p', block_id: 'b1' })];
  const m = groupCards(cards, new Map([['p', page]]));
  assert.equal(m.mode, 'idea');
  assert.deepEqual(m.sections.map(s => s.name), ['Tema 1 · VAN']);
  assert.deepEqual(m.sections[0].cells.map(c => [c.label, c.ids]), [['Valor temporal', ['c1', 'c3']], ['TIR', ['c2']]]);
});

test('casillas por nota (hermanas) y sin mapa si casi todas son largas', () => {
  const m = groupCards([card('c1', 'ev', { note_id: 'n1', template: 't1', fields: { w: 'ev', t: 'casa' } }), card('c2', 'casa', { note_id: 'n1', template: 't2', fields: { w: 'ev', t: 'casa' } }), card('c3', 'su', { note_id: 'n2', template: 't1', fields: { w: 'su' } })]);
  assert.equal(m.mode, 'note');
  assert.deepEqual(m.sections[0].cells.map(c => [c.label, c.ids]), [['ev', ['c1', 'c2']], ['su', ['c3']]]);
  const long = 'Explica con detalle por qué ocurre esto en la economía de un país';
  assert.equal(groupCards([card('c1', long), card('c2', long + '?'), card('c3', 'corta')]), null);
  assert.equal(groupCards([card('c1', 'uno'), card('c2', 'dos')]).mode, 'card');
});

test('estado: con las dos últimas acertadas ya no se resiste (como mucho, «A medias»)', () => {
  const ok = { interval: 3, due: Date.now() + 864e5 };
  assert.equal(cardMapState(ok, [1, 1, 1, 3, 3].map(grade => ({ grade }))), 'medias');
  assert.equal(cardMapState(ok, [1, 1, 1, 3].map(grade => ({ grade }))), 'resiste');
});

test('casillas: furigana y « / » fuera, artículo del título del apartado y secciones por tipo', () => {
  const m = groupCards([card('c1', '学校[がっこう]'), card('c2', '私[わたし] / は / 学生[がくせい] / です。')], new Map(), { kind: () => 'Otras' });
  assert.deepEqual(m.sections[0].cells.map(c => c.label), ['学校', '私は学生です。']);
  const page = { id: 'p', title: 'La Constitución', blocks: [
    { id: 'h1', type: 'h2', text: 'Artículo 1 · El Estado y sus valores' }, { id: 'b1', type: 'p', text: 'x' },
    { id: 'h2', type: 'h2', text: 'Datos clave' }, { id: 'b2', type: 'p', text: 'y' }] };
  const a = groupCards([card('c1', '¿Qué dice el art. 1?'), card('c2', '¿Qué valores?', { page_id: 'p', block_id: 'b1' }), card('c3', '¿Cuándo?', { page_id: 'p', block_id: 'b2' })], new Map([['p', page]]));
  assert.deepEqual(a.sections.map(s => [s.name, s.cells.map(c => [c.label, c.ids])]), [['Artículos', [['1', ['c1', 'c2']]]], ['Sin artículo', [['Datos clave', ['c3']]]]]);
  assert.equal(a.sections[0].cells[0].title, 'El Estado y sus valores');
  const k = groupCards([card('c1', '火', { type_id: 'kanji' }), card('c2', 'ev'), card('c3', 'Ich gehe / nach Hause')], new Map(), { kind: c => ({ c1: 'Kanji', c2: 'Palabras', c3: 'Frases' })[c.id] });
  assert.deepEqual(k.sections.map(s => s.name), ['Kanji', 'Palabras', 'Frases']);
});
