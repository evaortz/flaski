// Japonés · corta un texto en palabras: en cada sitio, la palabra más larga que está en el diccionario (también
// conjugada: 飲みました → 飲む). Es lo que hacen los diccionarios emergentes; no hace falta un analizador pesado.
import { isJa, isKanji, isKana, hira } from './texto.js';
import { preload, lookupNow } from './datos.js';
import { deinflect, verbClass } from './verbos.js';

const MAX = 12;
// Las entradas de una forma (tal cual o devuelta a su forma de diccionario), con el grupo correcto
export function matchNow(s) {
  const direct = lookupNow(s);
  if (direct.length) return { base: s, entries: direct, reason: '' };
  for (const d of deinflect(s)) {
    const es = lookupNow(d.base).filter(e => {
      const c = verbClass(e.p);
      return c === d.cls || (d.cls === 'vs' && e.p.includes('vs'));
    });
    if (es.length) return { base: d.base, entries: es, reason: d.reason };
    // する detrás de un nombre (勉強する): el nombre
    if (d.cls === 'vs' && d.base.endsWith('する')) {
      const n = lookupNow(d.base.slice(0, -2)).filter(e => e.p.includes('vs'));
      if (n.length) return { base: d.base.slice(0, -2), entries: n, reason: d.reason + ' de する' };
    }
  }
  return null;
}

// [{ s, base, entries, reason, kind }] con kind: 'word' (en el diccionario) | 'unknown' (japonés que no está) | 'other'
export async function tokenize(text) {
  await preload(text);
  return tokenizeNow(text);
}
export function tokenizeNow(text) {
  const ch = [...String(text || '')], out = [];
  let i = 0;
  while (i < ch.length) {
    if (!isJa(ch[i])) {
      let j = i; while (j < ch.length && !isJa(ch[j])) j++;
      out.push({ s: ch.slice(i, j).join(''), kind: 'other' }); i = j; continue;
    }
    let hit = null;
    for (let len = Math.min(MAX, ch.length - i); len >= 1; len--) {
      const s = ch.slice(i, i + len).join('');
      if (!ch.slice(i, i + len).every(isJa)) continue;
      const m = matchNow(s);
      if (m) { hit = { s, ...m, kind: 'word' }; break; }
    }
    if (hit) { out.push(hit); i += [...hit.s].length; continue; }
    // Sin palabra: los kanji seguidos (y su hiragana detrás) son una palabra desconocida; si no, un carácter
    let j = i + 1;
    if (isKanji(ch[i])) { while (j < ch.length && isKanji(ch[j])) j++; }
    const prev = out.at(-1);
    if (prev?.kind === 'unknown' && !isKanji(ch[i])) { prev.s += ch.slice(i, j).join(''); i = j; continue; }
    out.push({ s: ch.slice(i, j).join(''), kind: 'unknown' }); i = j;
  }
  return out;
}
// La lectura de una palabra del diccionario (la primera)
export const readingOf = t => (t?.entries?.[0]?.r?.[0] ? hira(t.entries[0].r[0]) : '');
// ¿Es gramática (partícula, auxiliar, solo kana corta) y no cuenta para «cuánto entiendes»?
export const isGrammar = t => t.kind === 'word' && (t.entries.some(e => e.p.includes('prt') || e.p.includes('aux')) || ([...t.s].every(isKana) && [...t.s].length <= 2 && t.entries.some(e => e.p.includes('conj') || e.p.includes('exp'))));
