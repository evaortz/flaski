// La gramática del N5 (docs/rediseno/japones/n5): cada apunte se lee como «apunte + preguntas» de una IA, todas sus
// preguntas crean tarjetas sin avisos y caen en un apartado que existe, y cada apartado tiene alguna pregunta
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { splitPagePaste, notesToDeck } from '../../js/notes.js';
import { existsSync } from 'node:fs';
// ¿Está en el diccionario con esa lectura? La palabra entera (学生 がくせい) o, con terminación detrás, una que empiece
// así (食 た → 食べる たべる). Un número suelto (三百 さんびゃく) se reparte kanji a kanji con sus lecturas
const shard = ch => { const f = new URL(`../../data/ja/dic/${ch.codePointAt(0).toString(16)}.json`, import.meta.url); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : { e: [] }; };
const NUM = new Set('一二三四五六七八九十百千万円時分半年月日');
function inDic(w, r) {
  const es = shard([...w][0]).e;
  if (es.some(e => e.k?.includes(w) && e.r?.includes(r))) return true;
  if (es.some(e => e.k?.some(k => k.startsWith(w) && k.length > w.length && !/[㐀-鿿]/.test(k[w.length])) && e.r?.some(x => x.startsWith(r)))) return true;
  return [...w].every(k => NUM.has(k)) && !!splitReading(w, r, KANJI);
}
import { splitReading } from '../../js/ja/lecturas.js';

const DIR = new URL('../../docs/rediseno/japones/n5/', import.meta.url);
// Los kanji del N5 (nivel 4 del JLPT antiguo): los únicos que pueden salir, y siempre con su lectura: 学生[がくせい]
const KANJI = JSON.parse(readFileSync(new URL('../../data/ja/kanji.json', import.meta.url), 'utf8'));
const N5 = new Set(Object.keys(KANJI).filter(k => KANJI[k].j === 4));
const KANJI_RUN = /[㐀-䶿一-鿿々]+/g;
// Lecturas especiales (de la palabra entera), comprobadas a mano
const SPECIAL = new Set(['今日[きょう]', '一人[ひとり]', '二人[ふたり]', '一日[ついたち]', '二日[ふつか]', '二十日[はつか]', '上手[じょうず]', '下手[へた]', '大人[おとな]', '今年[ことし]', '明日[あした]', '時計[とけい]', '一[ひと]', '二[ふた]', '八日[ようか]', '九日[ここのか]', '十日[とおか]', '七日[なのか]', '六日[むいか]', '五日[いつか]', '四日[よっか]', '三日[みっか]', '来[き]', '来[こ]']);   // 来る: き(ます), こ(ない)
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
    assert.ok(notes.length >= 8 && notes.length <= 22, `${notes.length} preguntas`);
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
    // Kanji: solo del N5 y cada grupo con su lectura detrás (en el apunte y en las preguntas)
    const all = md + '\n' + JSON.stringify(data);
    for (const m of all.matchAll(KANJI_RUN)) {
      for (const k of m[0]) if (k !== '々') assert.ok(N5.has(k), `${k} no es del N5 (en «${all.slice(Math.max(0, m.index - 8), m.index + 12)}»)`);
      assert.equal(all[m.index + m[0].length], '[', `${m[0]} sin lectura (en «${all.slice(Math.max(0, m.index - 8), m.index + 12)}»)`);
    }
    // Cada lectura se puede repartir entre sus kanji con sus lecturas de verdad (o es una lectura especial conocida)
    for (const m of all.matchAll(/([㐀-䶿一-鿿々]+)\[([^\]\n]+)\]/g)) {
      assert.ok(SPECIAL.has(m[0]) || inDic(m[1], m[2]), `lectura dudosa: ${m[0]}`);
    }
    const d = notesToDeck(data);
    assert.deepEqual(d.issues.filter(i => i.skipped), [], 'ninguna pregunta se queda fuera');
    assert.ok(d.cards.length >= notes.length);
  });
}
