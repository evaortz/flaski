// FORMATO-IA.md: ningún ejemplo lleva etiquetas (las IAs las copian y llenan Biblioteca de filtros) y todos se leen
// bien con notes.js, con las tarjetas que dicen
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePasted, notesToDeck, dropTags } from '../../js/notes.js';

const md = readFileSync(new URL('../../FORMATO-IA.md', import.meta.url), 'utf8');
const examples = [...md.matchAll(/```json\r?\n([\s\S]*?)```\s*\r?\n\s*Este ejemplo crea (\d+) tarjetas\./g)].map(m => ({ json: m[1], cards: Number(m[2]) }));

test('FORMATO-IA.md: ningún ejemplo lleva tags', () => {
  assert.ok(examples.length >= 3);
  for (const ex of examples) for (const n of JSON.parse(ex.json).notes) assert.equal(n.tags, undefined, JSON.stringify(n));
});

test('FORMATO-IA.md: todos los ejemplos se leen bien con notes.js y crean las tarjetas que dicen', () => {
  for (const ex of examples) {
    const p = parsePasted('Aquí tienes:\n```json\n' + ex.json + '```');
    assert.equal(p.kind, 'json');
    const d = notesToDeck(p.data);
    assert.equal(d.cards.length, ex.cards, d.name);
    assert.deepEqual(d.issues.filter(i => i.skipped), []);
    assert.deepEqual(d.tagNames, []);
  }
});

test('dropTags: la lista se queda sin etiquetas', () => {
  const d = notesToDeck({ name: 'X', notes: [{ fields: { q: 'a', a: 'b' }, tags: ['uno'] }, { fields: { q: 'c', a: 'd' }, tags: ['dos'] }] });
  assert.deepEqual(d.tagNames, ['uno', 'dos']);
  const e = dropTags(d);
  assert.deepEqual(e.tagNames, []);
  assert.ok(e.cards.every(c => c.tagNames.length === 0));
  assert.equal(e.cards.length, 2);
});

test('FORMATO-IA.md: enseña todos los tipos que puede crear una IA (todos menos tapar partes de una imagen)', async () => {
  const { BUILTIN_TYPES } = await import('../../js/cardtypes.js');
  for (const t of BUILTIN_TYPES.filter(t => t.id !== 'occlusion')) assert.match(md, new RegExp('\| `' + t.id + '` \|'), t.id);
  const used = new Set(examples.flatMap(ex => JSON.parse(ex.json).notes.map(n => n.type)));
  for (const id of ['truefalse', 'number', 'steps', 'sort', 'match', 'clozechoice', 'explain', 'whatif', 'conj']) assert.ok(used.has(id), `falta un ejemplo de ${id}`);
});

test('campos de varios elementos: listas y objetos se escriben como los espera la app', () => {
  const d = notesToDeck({ name: 'X', folder: '  Biología ', notes: [
    { type: 'steps', fields: { q: 'Ordena', s: ['uno', 'dos', 'tres'] } },
    { type: 'sort', fields: { g: { A: ['a1', 'a2'], B: 'b1, b2' } } },
    { type: 'sort', fields: { g: [{ name: 'A', items: ['x'] }, ['B', 'y', 'z']] } },
    { type: 'match', fields: { p: { ev: 'casa', su: 'agua' } } },
    { type: 'match', fields: { p: [['ev', 'casa'], { a: 'su', b: 'agua' }, 'el = mano'] } },
    { type: 'explain', fields: { q: '¿Por qué?', k: ['idea 1', 'idea 2'] } },
    { type: 'whatif', fields: { s: 'Caso', e: { Precio: 'sube', Ventas: 'baja' }, k: ['porque sí'] } },
    { type: 'truefalse', fields: { s: 'El agua moja', v: true } },
    { type: 'number', fields: { q: 'Año', a: 1492 } },
  ] });
  assert.deepEqual(d.issues.filter(i => i.skipped), []);
  assert.equal(d.cards.length, 9);
  const f = d.cards.map(c => c.fields);
  assert.equal(f[0].s, 'uno\ndos\ntres');
  assert.equal(f[1].g, 'A: a1, a2\nB: b1, b2');
  assert.equal(f[2].g, 'A: x\nB: y, z');
  assert.equal(f[3].p, 'ev = casa\nsu = agua');
  assert.equal(f[4].p, 'ev = casa\nsu = agua\nel = mano');
  assert.equal(f[5].k, 'idea 1\nidea 2');
  assert.equal(f[6].e, 'Precio: sube\nVentas: baja');
  assert.equal(f[7].v, 'Verdadero');
  assert.equal(f[8].a, '1492');
  assert.equal(d.folder, 'Biología');
});

/* ---------------- Apuntes con preguntas ---------------- */
import { splitPagePaste, sectionBlockId, notesOf } from '../../js/notes.js';
import { markdownToPage } from '../../js/notesio.js';

test('FORMATO-IA.md: el apunte de ejemplo y sus preguntas se leen juntos y cada pregunta encuentra su apartado', () => {
  const mdEx = /```markdown\r?\n([\s\S]*?)```/.exec(md)[1];
  const jsonEx = examples.find(e => /"section"/.test(e.json)).json;
  // Como lo da una IA: una frase, el apunte sin bloque y las preguntas en su bloque
  const sp = splitPagePaste(`¡Aquí lo tienes!\n\n${mdEx}\n\`\`\`json\n${jsonEx}\`\`\`\n¿Quieres más?`);
  assert.ok(sp);
  const { title, blocks } = markdownToPage(sp.md);
  assert.equal(title, 'La fotosíntesis');
  const notes = notesOf(notesToDeck(sp.data));
  assert.equal(notes.length, 3);
  for (const n of notes) assert.ok(sectionBlockId(blocks, n.section), n.section);
  assert.ok(blocks.some(b => b.type === 'table'));
});

test('splitPagePaste: solo el Markdown, en un bloque ```markdown, o con "page" dentro del JSON; una lista no es un apunte', () => {
  assert.equal(splitPagePaste('# Tema\n\nTexto').md, '# Tema\n\nTexto');
  assert.equal(splitPagePaste('# Tema\n\nTexto').data, null);
  assert.equal(splitPagePaste('Claro:\n```markdown\n# Tema\n## A\nx\n```\n```json\n{"notes":[{"section":"A","fields":{"q":"p","a":"r"}}]}\n```').data.notes[0].section, 'A');
  assert.equal(splitPagePaste(JSON.stringify({ name: 'X', page: '# Tema\n\n## A', notes: [] })).md, '# Tema\n\n## A');
  assert.equal(splitPagePaste('Aquí tienes:\n```json\n{"format":"flaski-notes","name":"L","notes":[]}\n```'), null);
  assert.equal(splitPagePaste('pregunta;respuesta\notra;cosa'), null);
  assert.throws(() => splitPagePaste('# Tema\n```json\n{"notes": [{"a" 1}]}\n```'), /línea/);
});

test('sectionBlockId: el título igual (sin acentos, numeración ni negritas) o el que lo contiene', () => {
  const blocks = [{ id: 'a', type: 'h2', text: '1. **Fase luminosa**' }, { id: 'b', type: 'p', text: 'Fases' }, { id: 'c', type: 'h2', text: 'Ciclo de Calvin (fase oscura)' }];
  assert.equal(sectionBlockId(blocks, 'Fase luminosa'), 'a');
  assert.equal(sectionBlockId(blocks, 'fase LUMINOSA'), 'a');
  assert.equal(sectionBlockId(blocks, 'Ciclo de Calvin'), 'c');
  assert.equal(sectionBlockId(blocks, 'Fases'), null);
  assert.equal(sectionBlockId(blocks, ''), null);
});
