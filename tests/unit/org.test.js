import { test } from 'node:test';
import assert from 'node:assert/strict';
import { folderPath, descendants, folderTree, decksInFolder, sortDecks, matchesDeck } from '../../js/org.js';

const folders = new Map([
  ['idiomas', { id: 'idiomas', name: 'Idiomas', parent_id: null }],
  ['turco', { id: 'turco', name: 'Turco', parent_id: 'idiomas' }],
  ['gram', { id: 'gram', name: 'Gramática', parent_id: 'turco' }],
  ['hist', { id: 'hist', name: 'Historia', parent_id: null }],
]);

test('ruta de carpetas desde la raíz', () => {
  assert.deepEqual(folderPath(folders, 'gram').map(f => f.name), ['Idiomas', 'Turco', 'Gramática']);
});

test('una carpeta incluye todas sus subcarpetas', () => {
  assert.deepEqual([...descendants(folders, 'idiomas')].sort(), ['gram', 'idiomas', 'turco']);
});

test('un ciclo en las carpetas no cuelga la app', () => {
  const loop = new Map([['a', { id: 'a', name: 'A', parent_id: 'b' }], ['b', { id: 'b', name: 'B', parent_id: 'a' }]]);
  assert.equal(folderPath(loop, 'a').length, 2);
  assert.equal(descendants(loop, 'a').size, 2);
});

test('árbol para el desplegable, sin la carpeta que se mueve ni sus hijas', () => {
  assert.deepEqual(folderTree(folders).map(f => `${f.depth}:${f.name}`), ['0:Historia', '0:Idiomas', '1:Turco', '2:Gramática']);
  assert.deepEqual(folderTree(folders, 'turco').map(f => f.name), ['Historia', 'Idiomas']);
});

test('mazos de una carpeta, incluidas subcarpetas', () => {
  const decks = new Map([['1', { id: '1', folder_id: 'gram' }], ['2', { id: '2', folder_id: 'hist' }], ['3', { id: '3', folder_id: null }]]);
  assert.deepEqual(decksInFolder(decks, folders, 'idiomas').map(d => d.id), ['1']);
});

test('ordenar: fijados primero y luego el criterio elegido', () => {
  const list = [{ id: 'a', name: 'Beta' }, { id: 'b', name: 'Alfa' }, { id: 'c', name: 'Zeta', pinned: true }];
  const stats = new Map([['a', { due: 9, newToday: 0 }], ['b', { due: 1, newToday: 0 }], ['c', { due: 0, newToday: 0 }]]);
  assert.deepEqual(sortDecks(list, 'name', stats).map(d => d.name), ['Zeta', 'Alfa', 'Beta']);
  assert.deepEqual(sortDecks(list, 'due', stats).map(d => d.name), ['Zeta', 'Beta', 'Alfa']);
});

test('filtros: búsqueda, etiquetas y archivados', () => {
  const d = { name: 'Turco', description: 'Verbos', tags: ['t1', 't2'] };
  assert.ok(matchesDeck(d, { query: 'verb' }));
  assert.ok(!matchesDeck(d, { query: 'japo' }));
  assert.ok(matchesDeck(d, { tagIds: ['t1'] }));
  assert.ok(!matchesDeck(d, { tagIds: ['t1', 't3'] }));
  assert.ok(!matchesDeck(d, { archived: true }));
});
