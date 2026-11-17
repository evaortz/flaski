// La gramática del N5 (docs/rediseno/japones/n5): cada apunte se lee como «apunte + preguntas» de una IA, todas sus
// preguntas crean tarjetas sin avisos y caen en un apartado que existe, y cada apartado tiene alguna pregunta
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { splitPagePaste, notesToDeck } from '../../js/notes.js';

const DIR = new URL('../../docs/rediseno/japones/n5/', import.meta.url);
const files = readdirSync(DIR).filter(f => /^\d\d-.*\.md$/.test(f)).sort();

test('hay apuntes de gramática del N5', () => { assert.ok(files.length >= 2, files.join(', ')); });

for (const f of files) {
  test(`gramática N5 · ${f}`, () => {
    const p = splitPagePaste(readFileSync(new URL(f, DIR), 'utf8'));
    assert.ok(p && p.data, 'apunte con su bloque de preguntas');
    const { md, data } = p;
    assert.match(md, /^# \d+ · /, 'título «# N · …»');
    assert.match(md, /^\*Minna no Nihongo I: lecci/m, 'la lección de Minna');
    assert.match(md, /> \[!NOTE\] Ojo/, 'al menos un «ojo»');
    assert.equal(data.lang, 'ja-JP');
    const heads = [...md.matchAll(/^## (.+)$/gm)].map(m => m[1].trim());
    assert.ok(heads.length >= 3, 'tres apartados o más');
    const notes = data.notes;
    assert.ok(notes.length >= 8 && notes.length <= 18, `${notes.length} preguntas`);
    for (const n of notes) {
      assert.ok(heads.includes(n.section), `«${n.section}» no es un apartado de ${f}`);
      assert.equal(n.tags, undefined);
    }
    for (const h of heads) assert.ok(notes.some(n => n.section === h), `el apartado «${h}» no tiene preguntas`);
    for (const n of notes.filter(n => n.type === 'clozechoice')) {
      assert.equal((n.fields.x.match(/\{\{/g) || []).length, 1, `un solo hueco: ${n.fields.x}`);
      assert.equal(n.fields.w.length, 3, `tres opciones incorrectas: ${n.fields.x}`);
      const right = n.fields.x.match(/\{\{([^}:]+)/)[1];
      assert.ok(!n.fields.w.includes(right), `la correcta no puede estar entre las incorrectas: ${n.fields.x}`);
    }
    for (const n of notes.filter(n => n.type === 'choice')) {
      assert.equal(n.fields.w.length, 3, n.fields.q);
      assert.ok(!n.fields.w.includes(n.fields.a), `la correcta está entre las incorrectas: ${n.fields.q}`);
      assert.equal(new Set(n.fields.w).size, 3, `opciones repetidas: ${n.fields.q}`);
    }
    for (const n of notes.filter(n => n.type === 'order')) assert.ok(n.fields.f.split(' / ').length >= 3, `tres piezas o más: ${n.fields.f}`);
    const d = notesToDeck(data);
    assert.deepEqual(d.issues.filter(i => i.skipped), [], 'ninguna pregunta se queda fuera');
    assert.ok(d.cards.length >= notes.length);
  });
}
