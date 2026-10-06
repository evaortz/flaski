import { test } from 'node:test';
import assert from 'node:assert/strict';
import { notesToDeck, parsePasted, extractJSON, isNotesDeck } from '../../js/notes.js';

const deck = notes => notesToDeck({ format: 'flaski-notes', version: 1, name: 'Prueba', notes });
const skipped = d => d.issues.filter(i => i.skipped);
const warned = d => d.issues.filter(i => !i.skipped);

test('cada nota genera sus tarjetas hermanas con anverso y reverso calculados', () => {
  const d = deck([{ type: 'vocab', fields: { w: 'ekmek', t: 'pan', e: 'Ekmek aldım.' }, tags: ['comida'] }]);
  assert.equal(d.cards.length, 2);
  assert.deepEqual(d.cards.map(c => c.template), ['t1', 't2']);
  assert.equal(new Set(d.cards.map(c => c.note_id)).size, 1);
  assert.equal(d.cards[0].front, 'ekmek');
  assert.equal(d.cards[0].back, 'pan');
  assert.equal(d.cards[1].front, 'pan');
  assert.equal(d.cards[1].back, 'ekmek');
  assert.deepEqual(d.tagNames, ['comida']);
  assert.equal(d.notes, 1);
});

test('sin tipo es una básica; huecos con pista', () => {
  const d = deck([{ fields: { q: '¿Capital de Turquía?', a: 'Ankara' } }, { type: 'cloze', fields: { x: 'Ev{{de::lugar}}yim' } }]);
  assert.deepEqual(d.cards.map(c => c.type_id), ['basic', 'cloze']);
  assert.equal(d.cards[1].front, 'Ev[lugar]yim');
  assert.equal(d.cards[1].back, 'Evdeyim');
  assert.deepEqual(d.issues, []);
});

test('las notas con errores se saltan diciendo por qué, y el resto se importa', () => {
  const d = deck([
    { type: 'flashcard', fields: { q: 'a', a: 'b' } },
    { type: 'basic', fields: { q: 'sin respuesta' } },
    { type: 'cloze', fields: { x: 'sin huecos' } },
    { type: 'order', fields: { f: 'Una' } },
    'texto suelto',
    { type: 'basic' },
    { type: 'basic', fields: { q: 'bien', a: 'ok' } },
  ]);
  assert.equal(d.cards.length, 1);
  assert.deepEqual(skipped(d).map(i => i.n), [1, 2, 3, 4, 5, 6]);
  const why = skipped(d).map(i => i.reason);
  assert.match(why[0], /tipo «flashcard» no existe.*basic/);
  assert.match(why[1], /«Respuesta»/);
  assert.match(why[2], /\{\{hueco\}\}/);
  assert.match(why[3], /dos piezas/);
  assert.match(why[4], /no es una nota/);
  assert.match(why[5], /falta "fields"/);
  assert.equal(skipped(d)[1].label, 'sin respuesta');
});

test('avisos que no impiden importar: campo desconocido y tarjetas a medias', () => {
  // Sin traducción: solo la tarjeta de reconocer (palabra → pronunciación), no la de escribir la palabra
  const d = deck([{ type: 'vocab', fields: { w: 'su', p: 'su', ejemplo: 'Su içiyorum.' } }]);
  assert.equal(d.cards.length, 1);
  const reasons = warned(d).map(i => i.reason);
  assert.ok(reasons.some(r => /«ejemplo» no existe en «vocab»/.test(r)));
  assert.ok(reasons.some(r => /solo crea 1 de 2 tarjetas.*«Traducción»/.test(r)));
  const d2 = deck([{ type: 'basic', fields: { q: 'a', a: 'b', extra: 'x' } }]);
  assert.equal(d2.cards.length, 1);
  assert.match(warned(d2)[0].reason, /«extra» no existe en «basic».*q, a, n/);
});

test('lang: es el idioma del mazo y los tipos se usan tal cual, sin copias por idioma', () => {
  const d = notesToDeck({ lang: 'ja-JP', notes: [{ type: 'vocab', fields: { w: '水', t: 'agua' } }, { type: 'basic', fields: { q: 'a', a: 'b' } }] });
  assert.equal(d.lang, 'ja-JP');
  assert.deepEqual(d.types, []);
  assert.deepEqual(d.cards.map(c => c.type_id), ['vocab', 'vocab', 'basic']);
  assert.deepEqual(d.issues, []);
});

test('lang: tipos de idiomas sin idioma, o de otro idioma, se avisan', () => {
  const sin = notesToDeck({ notes: [{ type: 'vocab', fields: { w: 'su', t: 'agua' } }, { type: 'listen', fields: { x: 'merhaba' } }] });
  assert.equal(sin.cards.length, 2);
  assert.match(skipped(sin)[0].reason, /dictado necesita/);
  assert.match(warned(sin)[0].reason, /no tendrán audio/);
  const otro = notesToDeck({ lang: 'ja-JP', notes: [{ type: 'de-noun', fields: { g: 'das', w: 'Haus', t: 'casa' } }] });
  assert.equal(otro.cards.length, 2);
  assert.match(warned(otro)[0].reason, /«de-noun» es para mazos de alemán, no de japonés/);
});

test('lang: idiomas desconocidos se ignoran', () => {
  const d = notesToDeck({ lang: 'klingon', notes: [{ fields: { q: 'a', a: 'b' } }] });
  assert.equal(d.lang, '');
  assert.match(warned(d)[0].reason, /klingon/);
  assert.equal(notesToDeck({ lang: 'JA-jp', notes: [] }).lang, 'ja-JP');
});

test('listas en los campos: incorrectas con «; », alternativas y piezas con « / »', () => {
  const d = deck([
    { type: 'choice', fields: { q: 'Capital', a: 'Ankara', w: ['Estambul', 'Esmirna', 'Bursa'] } },
    { type: 'typing', fields: { q: 'fui', a: ['gittim', 'gitmiştim'] } },
    { type: 'order', fields: { f: ['私は', '学生', 'です'] } },
  ]);
  assert.equal(d.cards[0].fields.w, 'Estambul; Esmirna; Bursa');
  assert.equal(d.cards[1].fields.a, 'gittim / gitmiştim');
  assert.equal(d.cards[2].back, '私は学生です');
});

test('etiquetas sin repetir (mayúsculas y # aparte) y pista', () => {
  const d = deck([{ fields: { q: 'a', a: 'b' }, tags: ['Verbos', '#examen'], hint: ' piensa ' }, { fields: { q: 'c', a: 'd' }, tags: 'verbos, nuevo' }]);
  assert.deepEqual(d.tagNames, ['Verbos', 'examen', 'nuevo']);
  assert.equal(d.cards[0].hint, 'piensa');
});

test('un array de notas suelto también vale', () => {
  assert.ok(isNotesDeck([{ fields: { q: 'a', a: 'b' } }]));
  assert.ok(!isNotesDeck({ format: 'flaski-deck', cards: [] }));
  assert.equal(notesToDeck([{ fields: { q: 'a', a: 'b' } }]).cards.length, 1);
});

test('lo pegado: bloque ```json, frases alrededor y comas sobrantes', () => {
  const ia = 'Aquí tienes tu mazo:\n\n```json\n{ "name": "X", "notes": [ { "fields": { "q": "a, b,", "a": "c" }, }, ], }\n```\n\n¡Suerte!';
  const { kind, data } = parsePasted(ia);
  assert.equal(kind, 'json');
  assert.equal(data.notes[0].fields.q, 'a, b,');   // las comas dentro del texto no se tocan
  const sinBloque = parsePasted('Claro, aquí está:\n{\n  "notes": []\n}\nEspero que te sirva.');
  assert.equal(sinBloque.kind, 'json');
});

test('lo pegado: un CSV se reconoce como CSV, aunque lleve corchetes', () => {
  assert.equal(parsePasted('pregunta;respuesta\nev;casa').kind, 'csv');
  assert.equal(parsePasted('水[みず];agua').kind, 'csv');
  assert.equal(extractJSON('ev - casa'), null);
});

test('lo pegado: un JSON roto dice en qué línea', () => {
  assert.throws(() => parsePasted('{\n  "name": "X",\n  "notes": [\n    { "fields": { "q": "a" "a": "b" } }\n  ]\n}'), /línea 4/);
  assert.throws(() => parsePasted('   '), /No has pegado nada/);
});
