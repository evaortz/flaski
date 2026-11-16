// Japonés · los datos: los kanji de uso común (data/ja/kanji.json) y el diccionario de palabras comunes, troceado por
// el primer carácter (data/ja/dic/<código>.json). Se piden solo cuando hacen falta; el service worker los guarda
// (caché flaski-ja) para usarlos sin conexión. Datos de EDRDG (KANJIDIC2, KRADFILE, JMdict) y Kanjium, CC BY-SA 4.0.

const BASE = 'data/ja/';
let kanjiP = null;
const shards = new Map();      // carácter → Promise<{ e, w }>

// { 休: { s, on, kun, es, en, j, g, f, p } }
export function kanjiData() {
  if (!kanjiP) kanjiP = fetch(BASE + 'kanji.json').then(r => (r.ok ? r.json() : {})).catch(() => { kanjiP = null; return {}; });
  return kanjiP;
}
// Lo que ya está cargado, sin esperar (null si aún no)
let kanjiNow = null;
export async function loadKanji() { kanjiNow = await kanjiData(); return kanjiNow; }
export const kanjiInfo = k => kanjiNow?.[k] || null;

function shard(ch) {
  if (!shards.has(ch)) {
    const p = fetch(`${BASE}dic/${ch.codePointAt(0).toString(16)}.json`).then(r => (r.ok ? r.json() : { e: [], w: {} })).catch(() => { shards.delete(ch); return { e: [], w: {} }; });
    shards.set(ch, p);
  }
  return shards.get(ch);
}
const loaded = new Map();       // carácter → { e, w } ya cargado
// Carga los trozos que necesita un texto (uno por carácter distinto)
export async function preload(text) {
  const chars = [...new Set([...String(text || '')])].filter(c => /[぀-ヿ㐀-鿿豈-﫿々]/.test(c) && !loaded.has(c));
  await Promise.all(chars.map(async c => loaded.set(c, await shard(c))));
}
// Las entradas de una palabra (ya cargada con preload): [{ k, r, p, es, en, a }]
export function lookupNow(word) {
  const s = loaded.get([...word][0]);
  return (s?.w[word] || []).map(i => s.e[i]);
}
export async function lookup(word) { await preload(word); return lookupNow(word); }
// (pruebas) olvidar lo cargado
export function _reset() { kanjiP = null; kanjiNow = null; shards.clear(); loaded.clear(); }
