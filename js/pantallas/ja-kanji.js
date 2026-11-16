// Japonés · Tus kanji (la vista de la lista automática «Kanji») y la ficha de un kanji
import * as api from '../api.js';
import { S, esc, toast, fail } from '../comun.js';
import { summarize, BUILTIN_TYPES } from '../cardtypes.js';
import { openSheet, closeSheet } from './editor.js';
import { kanjiInfo, loadKanji } from '../ja/datos.js';
import { jaWords, jaKanjiWords, kanjiStep, kanjiCards, KANJI_TYPE } from '../ja/saber.js';
import { PIECES, stepDots } from './ja-tanda.js';

const STEP_TEXT = ['Paso 1: qué significa', 'Paso 2: cómo se lee', 'Paso 3: cómo se escribe', 'Los tres pasos, hechos'];
// ¿Te cuesta? (alguna de sus preguntas fallada hace poco)
const hard = k => Object.values(kanjiCards(k)).some(c => { const p = S.progress.get(c.id); return p && (p.lapses || 0) > 0 && (p.interval || 0) < 3; });

// Arriba de la lista «Kanji»: cuántos llevas en cada paso y todos tus kanji con sus tres puntos
export function collectionHTML(d) {
  const ks = [...new Set([...S.cards.values()].filter(c => c.deck_id === d.id && c.type_id === KANJI_TYPE).map(c => c.fields?.k).filter(Boolean))];
  if (!ks.length) return '';
  const steps = ks.map(k => [k, kanjiStep(k)]), total = ks.length;
  const at = n => steps.filter(([, s]) => s >= n).length;
  const learning = steps.filter(([, s]) => s > 0 && s < 3).length, hardN = ks.filter(hard).length;
  const f = S.kjFilter || 'all';
  const shown = steps.filter(([k, s]) => f === 'all' || (f === 'learning' ? s > 0 && s < 3 : hard(k)));
  const bar = (label, n) => `<div class="kj-step"><span><span>${label}</span><b>${n} de ${total}</b></span><span class="kj-bar"><i style="width:${Math.round(100 * n / total)}%"></i></span></div>`;
  const chip = (id, label) => `<button class="fchip" data-kjf="${id}" aria-pressed="${f === id}">${label}</button>`;
  return `<section class="kj-col" aria-labelledby="h-kj"><h2 class="dk-h" id="h-kj">Tus kanji</h2>
    <p class="kj-hint">${total === 1 ? '1 kanji' : `${total} kanji`} en las palabras de tus listas de japonés. Salen solos: no hace falta crearlos.</p>
    <div class="kj-steps">${bar('1 · Sabes qué significan', at(1))}${bar('2 · Sabes leerlos', at(2))}${bar('3 · Sabes escribirlos', at(3))}</div>
    <div class="kj-filters" role="group" aria-label="Filtrar">${chip('all', 'Todos')}${chip('learning', `Aprendiéndose · ${learning}`)}${chip('hard', `Te cuestan · ${hardN}`)}</div>
    <div class="kj-grid">${shown.map(([k, s]) => `<button type="button" class="kj-tile${s === 0 ? ' is-new' : ''}${hard(k) ? ' is-hard' : ''}" data-kj="${esc(k)}" aria-label="${esc(k)}, ${STEP_TEXT[s].toLowerCase()}"><b lang="ja">${esc(k)}</b>${stepDots(s)}</button>`).join('') || '<p class="kj-hint">Ninguno.</p>'}</div>
    <p class="kj-hint">Los tres puntos son los tres pasos: qué significa, cómo se lee y cómo se escribe. Con borde rojo, los que te están costando.</p></section>`;
}

// La ficha de un kanji
export async function kanjiSheet(k) {
  await loadKanji();
  const info = kanjiInfo(k) || {}, cards = kanjiCards(k), f = (cards.t1 || cards.t2 || cards.t3)?.fields || {}, s = kanjiStep(k);
  const words = (jaKanjiWords().get(k) || []).map(w => jaWords().get(w)).filter(Boolean);
  const STATE = { known: 'te la sabes', learning: 'aprendiéndola', new: 'nueva' };
  const pieces = (info.p || []).map(x => `<span class="kj-piece"><b lang="ja">${esc(x)}</b>${PIECES[x] ? `<small>${esc(PIECES[x])}</small>` : ''}</span>`).join('<span class="kj-plus" aria-hidden="true">+</span>');
  const twin = Object.entries(S.prefs.ja?.parejas?.[k] || {}).sort((a, b) => b[1] - a[1])[0];
  openSheet(`<div class="kj-sheet">
    <div class="kj-hero"><span class="kj-big" lang="ja">${esc(k)}</span><span class="kj-mean"><b>${esc(f.m || (info.es || []).slice(0, 3).join(', '))}</b>
      <span class="kj-read">${f.kun ? `<span>japonesa <span lang="ja">${esc(f.kun)}</span></span>` : ''}${f.on ? `<span>china <span lang="ja">${esc(f.on)}</span></span>` : ''}</span>
      <span class="kj-read">${stepDots(s)}<small>${STEP_TEXT[s]}${info.s ? ` · ${info.s} trazos` : ''}</small></span></span></div>
    <button type="button" class="ghost small-btn" data-act="kj-strokes" data-kj-s="${esc(k)}">Ver cómo se escribe</button>
    ${pieces ? `<div class="kj-box"><small>Sus piezas</small><div class="kj-pieces">${pieces}</div></div>` : ''}
    ${words.length ? `<div class="kj-box"><small>En tus listas</small>${words.slice(0, 8).map(w => `<div class="kj-read"><span><b lang="ja">${esc(w.word)}</b> <span lang="ja">${esc(w.reading || '')}</span> · ${STATE[w.state] || ''}</span></div>`).join('')}</div>` : ''}
    ${twin ? `<div class="kj-confuse"><b lang="ja">${esc(twin[0])}</b><span>Lo has confundido con <span lang="ja">${esc(twin[0])}</span> ${twin[1] === 1 ? '1 vez' : `${twin[1]} veces`}. Fíjate en lo que los diferencia.</span></div>` : ''}
    ${cards.t1 ? `<label class="kj-box"><small>Tu historia para recordarlo</small><textarea class="kj-story-in" id="kjStory" rows="2" placeholder="Algo tuyo y un poco raro se recuerda mejor">${esc(f.h || '')}</textarea></label>` : ''}
    <div class="btnrow"><span class="spacer"></span><button class="ghost" data-act="close-sheet">Cerrar</button>${cards.t1 ? `<button class="primary" data-act="kj-story" data-kj-s="${esc(k)}">Guardar</button>` : ''}</div></div>`);
}
// Guardar tu historia en las tres preguntas del kanji
export async function saveStory(k) {
  const h = String(document.getElementById('kjStory')?.value || '').trim().slice(0, 300);
  const type = BUILTIN_TYPES.find(t => t.id === KANJI_TYPE);
  try {
    for (const c of Object.values(kanjiCards(k))) {
      const fields = { ...c.fields, h }, tpl = type.templates.find(t => t.id === c.template), sum = summarize(type, tpl, fields);
      const patch = { fields, front: sum.front.slice(0, 2000) || '—', back: sum.back.slice(0, 2000) || '—', note: sum.note.slice(0, 2000) };
      Object.assign(c, patch);
      await api.updateCard(c.id, patch);
    }
    closeSheet();
    toast(h ? 'Historia guardada' : 'Historia borrada');
  } catch (e) { fail(e); }
}
