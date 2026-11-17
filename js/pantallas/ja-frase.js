// Japonés · frases y gramática en la tanda: la hoja de una partícula, la frase desmontada (y ordenarla), la entonación
// de la palabra y la familia de un verbo (con sus preguntas en la lista automática «Verbos · formas»)
import * as api from '../api.js';
import { S, esc, toast, fail } from '../comun.js';
import { BUILTIN_TYPES, summarize } from '../cardtypes.js';
import { openSheet, closeSheet } from './editor.js';
import { PARTICLES, particlesByRule } from '../ja/particulas.js';
import { tokenize, readingOf } from '../ja/palabras.js';
import { lookup } from '../ja/datos.js';
import { plainJa, reading as rubyReading, hira, isKana, jaCount, RUBY } from '../ja/texto.js';
import { verbClass, conjugate, FORMS, N5_FORMS, ruleOf } from '../ja/verbos.js';
import { pitchHTML } from '../ja/pintar.js';
import { isJaDeck, jaWords, VERB_TYPE } from '../ja/saber.js';

const ROLE = { と: 'con quién', で: 'dónde o con qué', を: 'qué', に: 'a dónde o cuándo', は: 'de qué se habla', が: 'quién o qué', の: 'de quién o de qué', へ: 'hacia dónde', から: 'desde', まで: 'hasta', も: 'también', や: 'y otros', か: 'pregunta' };
const meaningOf = e => (e?.es?.length ? e.es.slice(0, 2).join(', ') : e?.en?.length ? `${e.en.slice(0, 2).join(', ')} (en inglés)` : '');
const firstMeaning = e => (e?.es?.length ? e.es[0] : e?.en?.length ? `${e.en[0]} (en inglés)` : '');
// Una palabra de tus listas: su lectura y tu traducción van por delante de las del diccionario
function ownWord(word) {
  const w = word && jaWords().get(word), c = w && S.cards.get(w.cards[0]);
  if (!c) return null;
  const f = c.fields || {}, t = f.t || f.m || Object.values(f).find(v => v && typeof v === 'string' && !jaCount(v)) || '';
  return { reading: w.reading, mean: plainJa(t).split(/[\n;]/)[0].trim() };
}
// Pone primero la entrada del diccionario que se lee así
function preferReading(t, r) {
  const i = r ? t.entries.findIndex(e => e.r.some(x => hira(x) === r)) : -1;
  if (i > 0) t.entries = [t.entries[i], ...t.entries.filter((_, j) => j !== i)];
}

// Frases de ejemplo de tus listas de japonés que llevan la partícula (como mucho n)
function examples(p, n = 2) {
  const out = [];
  for (const c of S.cards.values()) {
    if (out.length >= n || !isJaDeck(S.decks.get(c.deck_id))) continue;
    for (const v of Object.values(c.fields || {})) {
      const t = plainJa(String(v || ''));
      if ([...t].length < 6 || [...t].length > 40 || out.includes(t)) continue;
      if (particlesByRule(t).some(x => x.p === p)) { out.push(t); break; }
    }
  }
  return out;
}
const mark = (t, p) => esc(t).split(p).join(`<b class="ja-pt ja-pt-${PARTICLES[p]?.color || 'gray'}">${p}</b>`);
// La hoja de una partícula
export function particleSheet(p, sentence = '') {
  const x = PARTICLES[p];
  if (!x) return;
  const ex = examples(p).filter(t => t !== sentence);
  openSheet(`<div class="kj-sheet">
    <div class="kj-hero"><span class="kj-big ja-pt-${x.color}" lang="ja">${esc(p)}</span><span class="kj-mean"><b>${esc(x.es)}</b><small>${esc(x.more)}</small></span></div>
    ${sentence ? `<div class="kj-box"><small>En esta pregunta</small><p lang="ja" class="ja-line">${mark(sentence, p)}</p></div>` : ''}
    ${ex.length ? `<div class="kj-box"><small>Más en tus listas</small>${ex.map(t => `<p lang="ja" class="ja-line">${mark(t, p)}</p>`).join('')}</div>` : ''}
    ${x.twin ? `<div class="kj-box"><small>No la confundas con <span lang="ja">${esc(x.twin)}</span></small><p>${esc(x.diff)}</p></div>` : ''}
    <div class="btnrow"><span class="spacer"></span><button class="ghost" data-act="close-sheet">Cerrar</button></div></div>`);
}

// Una frase en trozos, cada uno acabado en su partícula: [{ text, reading, mean, role, color, note }]
export async function chunksOf(sentence, raw = sentence) {
  const toks = await tokenize(sentence), out = [];
  // Las lecturas que trae la propia frase (図書館[としょかん]) y las de tus palabras deciden qué palabra es
  const ruby = new Map([...String(raw).matchAll(RUBY)].map(m => [m[1], hira(m[2])]));
  for (const t of toks) if (t.kind === 'word') {
    t.own = ownWord(t.base) || ownWord(t.s);
    preferReading(t, ruby.get(t.s) || t.own?.reading);
  }
  let cur = [];
  const close = () => { if (cur.length) out.push(cur); cur = []; };
  for (const t of toks) {
    cur.push(t);
    const isP = t.kind === 'word' && PARTICLES[t.s] && t.entries.some(e => e.p.includes('prt'));
    if (isP || (t.kind === 'other' && /[、。！？!?]/.test(t.s))) close();
  }
  close();
  return out.map((ts, i) => {
    const words = ts.filter(t => t.kind !== 'other'), last = words.at(-1), p = last && PARTICLES[last.s] && last.kind === 'word' && last.entries.some(e => e.p.includes('prt')) ? last.s : '';
    const content = words.filter(t => t !== last || !p), head = content.at(-1) || words[0];
    const verb = head?.kind === 'word' && !p && i === out.length - 1 && ['v1', 'v5', 'vk', 'vs'].includes(verbClass(head.entries[0]?.p));
    const text = ts.map(t => t.s).join('').replace(/[。！？!?]$/, '');
    return {
      text, reading: words.map(t => (t.kind === 'word' ? (t === head && t.s !== t.base ? '' : readingOf(t)) || t.s : t.s)).join(''),
      mean: content.filter(t => t.kind === 'word').map(t => t.own?.mean || firstMeaning(t.entries[0])).filter(Boolean).join(' · '), role: p ? ROLE[p] || '' : verb ? 'la acción' : '',
      color: p ? PARTICLES[p].color : verb ? 'verb' : 'gray',
      note: verb && head.reason ? `${head.base} en ${head.reason}` : '',
    };
  }).filter(c => c.text);
}
// La hoja de la frase desmontada
export async function fraseSheet(sentence, cardId = '') {
  const s = plainJa(sentence);
  openSheet('<div class="kj-sheet"><div class="spin" aria-label="Cargando"></div></div>');
  const cs = await chunksOf(s, sentence);
  S.jaFrase = { text: s, chunks: cs.map(c => c.text), cardId };
  openSheet(`<div class="kj-sheet"><h2 class="sheet-hand">La frase, por piezas</h2>
    <div class="kj-box"><p lang="ja" class="ja-line">${cs.map(c => `<span class="ja-u ja-pt-${c.color}">${esc(c.text)}</span>`).join('')}</p></div>
    <ol class="ja-chunks">${cs.map(c => `<li><i class="ja-dot ja-pt-${c.color}" aria-hidden="true"></i><span><span class="ja-ch"><b lang="ja">${esc(c.text)}</b>${c.reading && c.reading !== c.text ? `<small lang="ja">${esc(c.reading)}</small>` : ''}</span>
      <span class="ja-ch">${c.mean ? `<span>${esc(c.mean)}</span>` : '<span class="muted">no está en el diccionario</span>'}${c.role ? `<em class="ja-role ja-pt-${c.color}">${esc(c.role)}</em>` : ''}</span>${c.note ? `<small>${esc(c.note)}</small>` : ''}</span></li>`).join('')}</ol>
    <div class="btnrow"><span class="spacer"></span><button class="ghost" data-act="close-sheet">Cerrar</button>${cs.length > 1 && cardId ? '<button class="primary" data-act="ja-ordenar">Practicar ordenándola</button>' : ''}</div></div>`);
}
// Crea una pregunta de «Ordenar frase» con los trozos, en la misma lista
export async function orderCard() {
  const f = S.jaFrase, c = f && S.cards.get(f.cardId);
  if (!c) return;
  try {
    const { saveNote } = await import('./editor.js'), type = BUILTIN_TYPES.find(t => t.id === 'order');
    const trans = Object.entries(c.fields || {}).find(([k]) => k === 't' || k === 'm')?.[1] || '';
    await saveNote({ type, fields: { f: f.chunks.join(' / '), t: trans ? `${trans} (ordena la frase de ejemplo)` : 'Ordena la frase', n: '' }, deckId: c.deck_id });
    closeSheet();
    toast('Pregunta de ordenar añadida a la lista');
  } catch (e) { fail(e); }
}

// Después de pintar una pregunta de japonés: la entonación de la palabra y, si es un verbo, «Ver sus formas»
export async function decorate(card, model, revealed) {
  if (!S.prefs.ja?.tono && !revealed) return;
  const ids = [...model.tpl.front, ...(revealed ? model.tpl.back : [])];
  for (const id of ids) {
    const f = model.type.fields.find(x => x.id === id);
    if (!/^ja/.test(f?.lang || '')) continue;
    const raw = String(model.fields[id] || ''), w = plainJa(raw);
    if (!w || [...w].length > 12 || /[\s。、]/.test(w)) continue;
    const es = await lookup(w);
    if (S.session?.queue?.[0] !== card.id) return;
    const r = raw.match(RUBY) ? hira(plainJa(rubyReading(raw))) : [...w].every(isKana) ? hira(w) : '';
    const e = es.find(x => !r || x.r.map(hira).includes(r)) || es[0];
    const el = document.querySelector(`article.card [data-fid="${id}"] .fld-t`);
    if (!e || !el) continue;
    if (S.prefs.ja?.tono && e.a != null && !el.parentElement.querySelector('.ja-pitch')) el.insertAdjacentHTML('afterend', pitchHTML(r || hira(e.r[0]), e.a));
    const cls = verbClass(e.p);
    if (revealed && ['v1', 'v5', 'vk', 'vs'].includes(cls) && !document.querySelector('[data-act="ja-verbo"]')) {
      document.querySelector('article.card .answer, article.card .front')?.insertAdjacentHTML('beforeend', `<p class="ja-more"><button type="button" class="link" data-act="ja-verbo" data-w="${esc(w)}" data-cls="${cls}">Ver sus formas</button></p>`);
    }
    return;
  }
}

/* ---------- la familia de un verbo ---------- */
const verbCards = w => [...S.cards.values()].filter(c => c.type_id === VERB_TYPE && c.fields?.v === w);
function formState(w, form) {
  const c = verbCards(w).find(x => x.fields.f === form), p = c && S.progress.get(c.id);
  if (!c) return 'none';
  if (!p) return 'no';
  if ((p.lapses || 0) > 0 && (p.interval || 0) < 3) return 'bad';
  return (p.interval || 0) >= 7 ? 'ok' : 'mid';
}
export async function verbSheet(w, cls) {
  const es = await lookup(w), e = es.find(x => verbClass(x.p) === cls) || es[0], f = conjugate(w, cls), own = ownWord(w);
  if (!f) return;
  const worst = FORMS.filter(x => formState(w, x.id) === 'bad')[0];
  openSheet(`<div class="kj-sheet"><h2 class="sheet-hand">La familia de <span lang="ja">${esc(w)}</span></h2>
    <p class="muted small">${esc(own?.mean || meaningOf(e))} · ${cls === 'v1' ? 'verbo en る: quitas る y añades' : cls === 'v5' ? `verbo en う: la última sílaba (${esc(w.at(-1))}) cambia` : cls === 'vs' ? 'con する' : 'verbo irregular'}</p>
    <div class="ja-forms">${FORMS.map(x => `<div class="ja-form vf-${formState(w, x.id)}"><small>${esc(x.name)}</small><b lang="ja">${esc(f[x.id])}</b><small>${esc(ruleOf(w, cls, x.id) || '')}</small></div>`).join('')}</div>
    ${worst ? `<div class="kj-confuse"><span>La que más fallas: <b>${esc(worst.name)}</b>. ${esc(ruleOf(w, cls, worst.id))}.</span></div>` : ''}
    <div class="btnrow"><span class="spacer"></span><button class="ghost" data-act="close-sheet">Cerrar</button>
      ${verbCards(w).length ? '' : `<button class="primary" data-act="ja-verbo-crear" data-w="${esc(w)}" data-cls="${cls}">Practicar sus formas</button>`}</div></div>`);
}
// Las preguntas de las formas (las de N5) en la lista automática «Verbos · formas»
export async function createVerbCards(w, cls) {
  const f = conjugate(w, cls), type = BUILTIN_TYPES.find(t => t.id === VERB_TYPE);
  if (!f || !type) return;
  try {
    let deck = [...S.decks.values()].find(d => d.options?.auto === 'verbos');
    if (!deck) {
      const ja = [...S.decks.values()].find(isJaDeck);
      deck = await api.createDeck({ owner: S.uid, name: 'Verbos · formas', description: 'Las formas de tus verbos de japonés. Flaski las crea al pulsar «Practicar sus formas».', folder_id: ja?.folder_id || null, options: { lang: 'ja-JP', auto: 'verbos' } });
      S.decks.set(deck.id, { tags: [], ...deck });
    }
    const rows = N5_FORMS.map(id => {
      const form = FORMS.find(x => x.id === id), fields = { v: w, f: id, q: `${w} en forma ${form.name}`, a: f[id], n: `${ruleOf(w, cls, id)}. ${form.help}` };
      const s = summarize(type, type.templates[0], fields);
      return { type_id: VERB_TYPE, template: 't1', fields, note_id: `verbo-${w}-${id}-${Date.now().toString(36)}`, front: s.front, back: s.back, note: s.note };
    });
    for (const c of await api.importCards(S.uid, deck.id, rows)) S.cards.set(c.id, { tags: [], ...c });
    closeSheet();
    toast(`${rows.length} preguntas de formas de ${w}, en «Verbos · formas»`);
  } catch (e) { fail(e); }
}
