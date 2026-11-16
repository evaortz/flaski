// El motor de japonés (js/ja/): texto, reparto de lecturas, verbos, corte en palabras y partículas, con los datos de
// verdad (data/ja/), leídos del disco en lugar de pedidos a la red
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { hira, base, reading, kanjiIn, rubyParts, plainJa } from '../../js/ja/texto.js';
import { splitReading, readingIn, readingKind } from '../../js/ja/lecturas.js';
import { conjugate, deinflect, verbClass, ruleOf } from '../../js/ja/verbos.js';
import { tokenize } from '../../js/ja/palabras.js';
import { kanjiData, _reset } from '../../js/ja/datos.js';
import { particlesInTokens, particlesByRule } from '../../js/ja/particulas.js';

const ROOT = new URL('../../', import.meta.url);
globalThis.fetch = async url => {
  try { const body = await readFile(new URL(String(url), ROOT), 'utf8'); return { ok: true, json: async () => JSON.parse(body) }; }
  catch { return { ok: false, json: async () => ({}) }; }
};
_reset();
const K = await kanjiData();

test('texto: katakana a hiragana, furigana, kanji de una palabra', () => {
  assert.equal(hira('コーヒー'), 'こーひー');
  assert.equal(base('図書館[としょかん]で本[ほん]'), '図書館で本');
  assert.equal(reading('図書館[としょかん]で'), 'としょかんで');
  assert.deepEqual(kanjiIn('休日[きゅうじつ]と休み'), ['休', '日']);
  assert.deepEqual(rubyParts('私[わたし]は'), [{ text: '私', rt: 'わたし' }, { text: 'は' }]);
  assert.equal(plainJa('**休[やす]み**'), '休み');
});

test('reparto de lecturas: cada kanji con su parte, con sonoras, っ y lecturas especiales', () => {
  const r = (w, x) => splitReading(w, x, K)?.parts.map(p => p.r).join('·');
  assert.equal(r('図書館', 'としょかん'), 'と·しょ·かん');
  assert.equal(r('休日', 'きゅうじつ'), 'きゅう·じつ');
  assert.equal(r('休み', 'やすみ'), 'やす·み');
  assert.equal(r('学校', 'がっこう'), 'がっ·こう');           // がく → がっ
  assert.equal(r('日本語', 'にほんご'), 'に·ほん·ご');
  assert.equal(r('人々', 'ひとびと'), 'ひと·びと');            // 々 con sonora
  assert.equal(r('三日', 'みっか'), 'みっか');                 // especial: entera
  assert.equal(readingIn('休日', 'きゅうじつ', '休', K), 'きゅう');
  assert.equal(readingKind('きゅう', K['休']), 'on');
  assert.equal(readingKind('やす', K['休']), 'kun');
  assert.equal(splitReading('図書館', 'ほん', K), null);       // no encaja
});

test('verbos: las formas de cada grupo, sus reglas y las excepciones', () => {
  assert.deepEqual(conjugate('飲む', 'v5'), { masu: '飲みます', nai: '飲まない', ta: '飲んだ', te: '飲んで', tai: '飲みたい', pot: '飲める', vol: '飲もう', ba: '飲めば' });
  assert.equal(conjugate('食べる', 'v1').te, '食べて');
  assert.equal(conjugate('行く', 'v5').te, '行って');
  assert.equal(conjugate('書く', 'v5').te, '書いて');
  assert.equal(conjugate('勉強', 'vs').masu, '勉強します');
  assert.equal(conjugate('来る', 'vk').nai, '来ない');
  assert.equal(conjugate('ある', 'v5').nai, 'ない');
  assert.equal(ruleOf('飲む', 'v5', 'te'), 'む → んで');
  assert.equal(verbClass(['v5m']), 'v5');
});

test('verbos: el camino de vuelta a la forma de diccionario', () => {
  const has = (w, b) => deinflect(w).some(d => d.base === b);
  assert.ok(has('飲みました', '飲む'));
  assert.ok(has('食べています', '食べる'));
  assert.ok(has('行って', '行く'));
  assert.ok(has('読んだ', '読む'));
  assert.ok(has('高かった', '高い'));
  assert.ok(has('しません', 'する'));
});

test('corte en palabras con el diccionario: verbos conjugados y palabras desconocidas', async () => {
  const t = await tokenize('私は毎朝図書館で本を読みます。');
  const words = t.filter(x => x.kind === 'word').map(x => x.base);
  for (const w of ['私', '毎朝', '図書館', '本', '読む']) assert.ok(words.includes(w), `${w} en ${words.join(' ')}`);
  const read = t.find(x => x.base === '読む');
  assert.equal(read.s, '読みます');
  assert.match(read.reason, /cortés/);
  const ps = particlesInTokens(t).map(p => p.p);
  assert.deepEqual(ps, ['は', 'で', 'を']);
});

test('partículas sin diccionario: solo las seguras', () => {
  assert.deepEqual(particlesByRule('私は毎朝図書館で本を読みます').map(p => p.p), ['は', 'で', 'を']);
  assert.deepEqual(particlesByRule('はなを見る').map(p => p.p), ['を']);   // は de はな no es partícula
});

test('pintar: furigana solo en lo que no sabes, partículas en color y la línea de la entonación', async () => {
  const { jaHTML, pitchPattern, moras } = await import('../../js/ja/pintar.js');
  const html = '<ruby>私<rt>わたし</rt></ruby>は<ruby>図書館<rt>としょかん</rt></ruby>で本を読みます';
  const auto = jaHTML(html, { furi: 'auto', needsRuby: b => b !== '私' });
  assert.ok(!auto.includes('<rt>わたし</rt>') && auto.includes('<rt>としょかん</rt>'));
  assert.ok(!jaHTML(html, { furi: 'never' }).includes('<ruby>'));
  const pts = [...jaHTML(html, { particles: true }).matchAll(/data-pt="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(pts, ['は', 'で', 'を']);
  assert.deepEqual(moras('きょうしつ'), ['きょ', 'う', 'し', 'つ']);
  assert.deepEqual(pitchPattern('としょかん', 2).map(x => x.hi), [false, true, false, false]);
  assert.deepEqual(pitchPattern('さくら', 0).map(x => x.hi), [false, true, true]);
});

test('leer: la palabra con furigana en sus kanji y los subtítulos emparejados por tiempo', async () => {
  const { rubyWord, parseSubs, pairSubs } = await import('../../js/ja/leer.js');
  assert.equal(rubyWord('走る', 'はしる'), '走[はし]る');
  assert.equal(rubyWord('予約', 'よやく'), '予約[よやく]');
  assert.equal(rubyWord('すし', 'すし'), 'すし');
  const ja = parseSubs('1\n00:02:14,000 --> 00:02:16,000\nちょっと<i>待って</i>\n\n2\n00:05:40,500 --> 00:05:42,000\nそれは無理だよ。\n');
  assert.deepEqual(ja.map(x => [x.time, x.text]), [['02:14', 'ちょっと待って'], ['05:40', 'それは無理だよ。']]);
  const es = parseSubs('WEBVTT\n\n00:02:15.000 --> 00:02:16.000\nEspera\n\n00:09:00.000 --> 00:09:02.000\nOtra cosa\n');
  assert.deepEqual(pairSubs(ja, es).map(x => x.es), ['Espera', '']);
});
