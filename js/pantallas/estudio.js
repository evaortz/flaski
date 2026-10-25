// Flaski · caras de las tarjetas y sesión de estudio (sale de app.js)
import * as api from '../api.js';
import { schedule, fmtWhen, dateKey, startOfDay, GRADES } from '../srs.js';
import { shares, allocate } from '../plan.js';
import { pace, tandaSize, composeShort, TANDA_MINUTES } from '../tanda.js';
import { icon } from '../icons.js';
import { BUILTIN_TYPES, LANGS, CLOZE_RE, NEEDS_ANSWER, stripRuby, isCJK, orderTokens, orderJoin, legacyFields, choiceOptions, resolveType, parsePairs, parseMasks, imageIdIn, parseGroups, clozeAnswer } from '../cardtypes.js';
import { isShortText } from '../inline.js';
import { ideasOf, ideaHit, parseEffects, suggestGrade, verdictText } from '../entender.js';
import { speak, stopSpeaking, ttsAvailable, voiceMissing } from '../tts.js';
import { charsOf, canQuiz, startQuiz, startCanvas, animateChars } from '../handwriting.js';
import { buzz, swipeable, chime } from '../feel.js';
import { $, main, S, esc, imgHTML, fmt, cardList, toast, fail, tagChips, scopeTest, scopeName, deckName, reviewsLeft, algo, capNote, counts, planNodes, dayNodes, newPlan, nearDecks, seenToday, tandaMinutes, todayMinutes } from '../comun.js';
import { saveSnapSoon } from './cuenta.js';
import { plural } from './mazos.js';
import { seg, numIn, savePrefsSoon, remindOffer } from './perfil.js';
import { openSheet, charsFor, hasRuby } from './editor.js';
import { go } from '../app.js';

/* ===================== estudio ===================== */
/* ---------- Tipos de tarjeta: utilidades ---------- */
// Icono de un tipo: el emoji que elegiste o, si no hay, su icono Lucide
export function typeIcon(t, size = 18) { return t?.icon ? esc(t.icon) : icon(t?.lucide || 'layers', { size }); }
const allTypes = () => [...BUILTIN_TYPES, ...[...S.types.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'))];
export const getType = id => BUILTIN_TYPES.find(t => t.id === id) || S.types.get(id) || null;
// Idioma que se estudia en un mazo ('' = no es de idiomas) y el tipo con sus idiomas resueltos para él
export const deckLang = id => S.decks.get(id)?.options?.lang || '';
export const nativeLang = () => S.prefs.study.nativeLang || 'es-ES';
export const typeIn = (type, deckId) => resolveType(type, { study: deckLang(deckId), native: nativeLang() });
export const langLabel = id => LANGS.find(l => l.id === id)?.label || id;
// Tipo, plantilla y campos de una tarjeta (las antiguas, sin campos, se leen como «Básica»)
export function cardModel(c) {
  const hasFields = c.fields && typeof c.fields === 'object' && Object.keys(c.fields).length;
  const type = typeIn((hasFields && getType(c.type_id)) || BUILTIN_TYPES[0], c.deck_id);
  const fields = hasFields && getType(c.type_id) ? c.fields : legacyFields(c);
  const tpl = type.templates.find(t => t.id === c.template) || type.templates[0];
  return { type, tpl, fields };
}
const BRUSH_ICON = icon('brush', { size: 18 });
export const SPEAK_ICON = icon('volume-2', { size: 18 });

// Pinta el texto de un campo; en «huecos» oculta o destapa los {{ }}
function clozeHTML(text, reveal) {
  let out = '', last = 0;
  String(text || '').replace(CLOZE_RE, (m, ans, hint, at) => {
    if (at < last) return m;
    out += fmt(text.slice(last, at));
    const hole = reveal ? `<span class="blank on">${fmt(ans)}</span>` : `<span class="blank">${hint ? esc(hint) : '…'}</span>`;
    // La puntuación que va justo detrás no se queda sola en otra línea
    const punct = /^[.,;:!?…»”)\]]+/.exec(text.slice(at + m.length))?.[0] || '';
    out += punct ? `<span class="cz-nw">${hole}${esc(punct)}</span>` : hole;
    last = at + m.length + punct.length;
    return m;
  });
  return out + fmt(String(text || '').slice(last));
}

// HTML del anverso y de la respuesta. st = estado de la tarjeta en pantalla.
export function faceHTML(model, st, { preview = false } = {}) {
  const { type, tpl, fields } = model;
  const fdef = id => type.fields.find(f => f.id === id);
  const val = id => String(fields[id] ?? '');
  const say = id => (fdef(id)?.lang && ttsAvailable() && val(id).trim()
    ? `<button type="button" class="say" ${preview ? 'data-say-input' : 'data-say'}="${id}" aria-label="Escuchar ${esc(fdef(id).name)}" title="Escuchar">${SPEAK_ICON}</button>` : '');
  const block = (id, main, extra = '') => {
    const v = val(id);
    // Vacío también si solo lleva etiquetas o espacios (p. ej. «<br>» al importar de Anki): no deja una fila en blanco
    if (!v.trim() || (!/<img/i.test(v) && !v.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim())) return '';
    // La etiqueta en minúscula y sin la aclaración entre paréntesis: «lectura kun»
    const name = fdef(id)?.name.replace(/\s*\([^)]*\)\s*$/, '') || '';
    const label = !main && name ? `<div class="fld-l">${esc(name.charAt(0).toLocaleLowerCase() + name.slice(1))}</div>` : '';
    // Texto principal corto: a mano y grande (con kanji, en su letra); largo, en letra normal.
    // Se mira el texto que se ve: sin etiquetas ni saltos de línea al principio o al final (frecuentes al importar de Anki)
    const plain = stripRuby(v).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim(), lang = fdef(id)?.lang || '';
    const ja = /^ja/.test(lang) || (!lang && /[぀-ヿ]/.test(plain)) ? ' fld-ja' : '';
    // Un kanji suelto (o dos caracteres CJK), muy grande; las lecturas en kana, al tamaño del texto
    const kanji = main && [...plain].length <= 2 && [...plain].every(isCJK);
    const size = !main ? (/^[぀-ヿ・ー\s、,]+$/.test(plain) ? ' fld-kana' : '') : kanji ? ' fld-cjk fld-kanji' + ja : [...plain].some(isCJK) ? ' fld-cjk' + ja : isShortText(plain) ? ' fld-short' : '';
    return `<div class="fld ${main ? 'fld-main' : 'fld-sub'}${size}">${label}<div class="fld-v"><span class="fld-t">${fmt(v)}</span>${extra.includes('data-say') ? '' : say(id)}${strokesBtn(id)}${extra}</div></div>`;
  };
  // Botón «orden de trazos» en campos cortos con kanji/hanzi
  const strokesBtn = id => {
    if (preview || !/^(ja|zh)/.test(fdef(id)?.lang || '')) return '';
    const chars = [...stripRuby(val(id))].filter(isCJK);
    return chars.length && chars.length <= 6 ? `<button type="button" class="say" data-strokes="${id}" aria-label="Ver orden de trazos" title="Orden de trazos">${BRUSH_ICON}</button>` : '';
  };

  // Escribir, dictado, ordenar o dibujar ya resueltos: la respuesta ya está arriba, así que su altavoz (y el
  // orden de trazos) va junto a la pregunta, en lugar del de la pregunta: un solo altavoz, el del texto en el
  // idioma de estudio (si la respuesta no tiene idioma, se queda el de la pregunta). En la caja de respuesta,
  // solo los demás campos (artículo, plural…); sin ninguno, no hay caja
  const rest = tpl.back.filter(x => x !== tpl.answer).map(id => block(id, false)).join('');
  const resolved = tpl.mode === 'order' ? !!st.order?.checked : tpl.mode === 'draw' ? !!st.drawn && !st.drawn.gaveUp && !!st.drawn.img : !!st.typed;
  const sayAns = st.revealed && ['type', 'listen', 'order', 'draw'].includes(tpl.mode) && resolved ? say(tpl.answer) + strokesBtn(tpl.answer) : '';

  // Anverso
  let front;
  if (tpl.mode === 'occlusion') front = occlusionHTML(val(tpl.image), val(tpl.answer), tpl.mask, st.revealed) + tpl.front.map(id => block(id, false)).join('');
  else if (tpl.mode === 'match' && !val(tpl.front[0]).trim()) front = `<div class="fld fld-main"><div class="fld-v"><span class="fld-t">Une cada elemento con su pareja</span></div></div>`;
  else if (tpl.mode === 'clozechoice') front = `<div class="fld fld-main fld-cloze"><div class="fld-v"><span class="fld-t">${clozeHTML(val(tpl.answer), st.revealed)}</span>${st.revealed ? say(tpl.answer) : ''}</div></div>`;
  else if (tpl.mode === 'cloze') front = `<div class="fld fld-main fld-cloze"><div class="fld-v"><span class="fld-t">${clozeHTML(val(tpl.front[0]), st.revealed)}</span>${say(tpl.front[0])}</div></div>`;
  else {
    front = tpl.front.map((id, i) => block(id, i === 0, i === 0 ? sayAns : '')).join('');
    if (sayAns && !val(tpl.front[0]).trim()) front = `<div class="fld fld-main"><div class="fld-v">${sayAns}</div></div>${front}`;
  }
  if (tpl.hideRuby && !st.revealed && hasRuby(fields[tpl.front[0]] ?? '')) front = `<div class="ruby-hide" title="Toca un kanji para ver su lectura">${front}</div>`;

  // Interacción antes de destapar
  let ask = '';
  if (tpl.mode === 'listen' && !st.revealed) {
    const has = !!fdef(tpl.answer)?.lang && ttsAvailable();
    ask += `<div class="listen-box">
      <button type="button" class="listen-btn" data-listen="1" ${preview ? 'disabled' : ''} aria-label="Escuchar">${SPEAK_ICON}<span>Escuchar</span></button>
      <button type="button" class="ghost small-btn" data-listen="0.6" ${preview ? 'disabled' : ''}>${icon('snail', { size: 16 })} Más despacio</button></div>
      ${has ? '' : '<p class="hint" style="text-align:center">Este campo no tiene idioma de audio o el dispositivo no tiene voces. Elige un idioma en «Gestionar tipos».</p>'}`;
  }
  if (tpl.mode === 'type' || tpl.mode === 'listen') {
    const lang = fdef(tpl.answer)?.lang || '';
    if (!st.revealed) {
      ask += `<${preview ? 'div' : 'form data-form="typed"'} class="typed" autocomplete="off">
        <input id="typed" ${lang ? `lang="${lang}"` : ''} autocapitalize="off" autocorrect="off" spellcheck="false"  placeholder="${tpl.mode === 'listen' ? 'Escribe lo que oyes' : 'Escribe la respuesta'}" aria-label="Tu respuesta" ${preview ? 'disabled' : ''}>
        <button class="primary" type="${preview ? 'button' : 'submit'}" ${preview ? 'disabled' : ''}>Comprobar</button></${preview ? 'div' : 'form'}>
        ${preview || !charsFor(lang).length ? '' : `<div class="chars chars-study" role="group" aria-label="Letras especiales">${charsFor(lang).map(ch => `<button type="button" data-char="${ch}">${ch}</button>`).join('')}</div>`}`;
    } else if (st.typed) {
      const r = st.typed;
      ask = r.ok ? `<div class="verdict ok">${icon('check', { size: 16 })} Correcto: <b>${esc(r.expected)}</b></div>`
        : `<div class="verdict bad">${r.near ? `<div class="vnear">Casi · ${esc(r.why)}</div>` : ''}<div class="vrow"><span class="vl">Tu respuesta</span><span class="diff">${r.diff.filter(x => x.t !== 'miss').map(x => `<span class="d-${x.t}">${esc(x.c)}</span>`).join('') || '<i>(vacía)</i>'}</span></div>
          <div class="vrow"><span class="vl">Correcta</span><span class="diff">${r.diff.filter(x => x.t !== 'extra').map(x => `<span class="d-${x.t === 'miss' ? 'need' : 'ok'}">${esc(x.c)}</span>`).join('')}</span></div></div>`;
    }
  }
  if ((tpl.mode === 'choice' || tpl.mode === 'clozechoice') && st.choice) {
    const c = st.choice;
    ask = `<div class="choices">${c.opts.map((o, i) => {
      let cls = '';
      if (st.revealed) cls = o === c.correct ? ' right' : i === c.picked ? ' wrong' : ' dim';
      return `<button type="button" class="choice${cls}" data-choice="${i}" ${st.revealed || preview ? 'disabled' : ''}><span class="ckey">${i + 1}</span><span>${fmt(o)}</span></button>`;
    }).join('')}</div>`;
  }

  if (tpl.mode === 'sort') {
    const so = st.sort || sortState(val(tpl.answer));
    const chip = (it, attr, cls = '') => `<button type="button" class="schip${cls}" ${attr} ${preview || st.revealed ? 'disabled' : ''}>${fmt(it.t)}</button>`;
    if (!st.revealed) {
      const pool = so.items.filter(it => so.place[it.i] == null);
      ask = `<div class="sort-pool" aria-label="Por colocar">${pool.length ? pool.map(it => chip(it, `data-sort-pick="${it.i}"`, so.sel === it.i ? ' sel' : '')).join('') : '<span class="hint">Todo colocado</span>'}</div>
        <div class="sort-groups">${so.groups.map((g, k) => `<div class="sort-g${so.sel != null ? ' armed' : ''}" data-sort-group="${k}" role="button" tabindex="0" aria-label="Grupo ${esc(g)}"><div class="sort-gh">${fmt(g)}</div>
          <div class="sort-gi">${so.items.filter(it => so.place[it.i] === k).map(it => chip(it, `data-sort-back="${it.i}"`)).join('')}</div></div>`).join('')}</div>
        ${preview ? '' : `<p class="hint" style="text-align:center">Toca un elemento y luego su grupo</p><div class="btnrow" style="justify-content:center"><button type="button" class="primary" data-act="sort-check" ${pool.length ? 'disabled' : ''}>Comprobar</button></div>`}`;
    } else {
      const bad = so.items.filter(it => so.place[it.i] != null && so.place[it.i] !== it.g).length;
      ask = `${so.checked ? (bad ? `<div class="verdict bad">${plural(bad, 'elemento mal colocado', 'elementos mal colocados')}</div>` : `<div class="verdict ok">${icon('check', { size: 16 })} Todo en su grupo</div>`) : ''}
        <div class="sort-groups">${so.groups.map((g, k) => `<div class="sort-g"><div class="sort-gh">${fmt(g)}</div><div class="sort-gi">${so.items.filter(it => it.g === k).map(it => {
          const put = so.place[it.i], cls = !so.checked ? '' : put === k ? ' ok' : ' bad';
          return `<span class="schip${cls}">${fmt(it.t)}${so.checked && put !== k && put != null ? ` <small>(pusiste ${esc(so.groups[put])})</small>` : ''}</span>`;
        }).join('')}</div></div>`).join('')}</div>`;
    }
  }
  if (tpl.mode === 'number') {
    const unit = String(fields.u || '').trim(), tol = String(fields.t || '').trim();
    if (!st.revealed) {
      ask = `<${preview ? 'div' : 'form data-form="number"'} class="typed" autocomplete="off">
        <span class="num-in"><input id="numIn" inputmode="decimal" placeholder="Tu respuesta" aria-label="Tu respuesta" ${preview ? 'disabled' : ''}>${unit ? `<span class="muted">${esc(unit)}</span>` : ''}</span>
        <button class="primary" type="${preview ? 'button' : 'submit'}" ${preview ? 'disabled' : ''}>Comprobar</button></${preview ? 'div' : 'form'}>`;
    } else {
      const r = st.number, right = `<b>${esc(val(tpl.answer))}${unit ? ' ' + esc(unit) : ''}</b>${tol ? ` <span class="muted">(±${esc(tol)})</span>` : ''}`;
      ask = !r ? `<div class="fld fld-main"><div class="fld-v"><span class="fld-t">${right}</span></div></div>`
        : r.ok ? `<div class="verdict ok">${icon('check', { size: 16 })} Correcto: ${right}${r.diff ? ` · pusiste ${esc(String(r.given))}` : ''}</div>`
        : `<div class="verdict bad">${r.near ? '<div class="vnear">Casi</div>' : ''}<div class="vrow"><span class="vl">Tu respuesta</span><span>${Number.isFinite(r.given) ? esc(String(r.given)) : '<i>(no es un número)</i>'}</span></div><div class="vrow"><span class="vl">Correcta</span><span>${right}</span></div></div>`;
    }
  }
  if (tpl.mode === 'conj') {
    const rows = parsePairs(val(tpl.answer)), lang = fdef(tpl.answer)?.lang || '';
    if (!st.revealed) {
      ask = `<${preview ? 'div' : 'form data-form="conj"'} class="conj" autocomplete="off"><table class="conj-tbl">${rows.map((r, k) => `<tr><th scope="row">${esc(r.a)}</th>
        <td><input class="conj-in" data-conj="${k}" ${lang ? `lang="${lang}"` : ''} autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="${esc(r.a)}" ${preview ? 'disabled' : ''}></td></tr>`).join('')}</table>
        <button class="primary" type="${preview ? 'button' : 'submit'}" ${preview ? 'disabled' : ''}>Comprobar</button></${preview ? 'div' : 'form'}>
        ${preview || !charsFor(lang).length ? '' : `<div class="chars chars-study" role="group" aria-label="Letras especiales">${charsFor(lang).map(ch => `<button type="button" data-char="${ch}">${ch}</button>`).join('')}</div>`}`;
    } else {
      const res = st.conj || [];
      ask = `<table class="conj-tbl conj-res">${rows.map((r, k) => {
        const x = res[k];
        const mine = !x ? '' : x.ok ? '' : `<span class="conj-mine">${esc(x.given || '—')}</span>`;
        return `<tr class="${!x ? '' : x.ok ? 'ok' : x.near ? 'near' : 'bad'}"><th scope="row">${esc(r.a)}</th><td>${mine}<b>${fmt(r.b)}</b>${x && !x.ok && x.why ? ` <small>${esc(x.why)}</small>` : ''}</td></tr>`;
      }).join('')}</table>`;
    }
  }
  if (tpl.mode === 'match') {
    const m = st.match || matchState(val(tpl.answer));
    if (!st.revealed) {
      const btn = (side, p) => {
        const key = `${side}:${p.i}`, done = m.done.includes(p.i);
        const cls = done ? ' ok' : m.sel === key ? ' sel' : m.bad?.includes(key) ? ' bad' : '';
        return `<button type="button" class="mchip${cls}" data-match="${key}" ${done || preview ? 'disabled' : ''} aria-pressed="${m.sel === key}">${fmt(side === 'L' ? p.a : p.b)}</button>`;
      };
      ask = `<div class="match" role="group" aria-label="Emparejar"><div class="match-col">${m.left.map(p => btn('L', p)).join('')}</div><div class="match-col">${m.right.map(p => btn('R', p)).join('')}</div></div>
        ${preview ? '' : `<p class="hint match-hint">${m.wrong ? `${plural(m.wrong, 'fallo', 'fallos')} · ` : ''}Toca uno de cada lado</p>`}`;
    } else {
      const v = m.gaveUp ? '' : m.wrong ? `<div class="verdict bad">${plural(m.wrong, 'fallo', 'fallos')} al emparejar</div>` : `<div class="verdict ok">${icon('check', { size: 16 })} Todo emparejado sin fallos</div>`;
      ask = `${v}<table class="match-sol">${m.pairs.map(p => `<tr><td>${fmt(p.a)}</td><td>${fmt(p.b)}</td></tr>`).join('')}</table>`;
    }
  }
  if (tpl.mode === 'order') {
    const o = st.order || { tokens: orderTokens(val(tpl.answer)).map((t, i) => ({ t, i })), picked: [] };
    const steps = val(tpl.answer).trim().includes('\n');
    const chip = (tok, attr) => `<button type="button" class="ochip${steps ? ' ostep' : ''}" ${attr} ${preview || st.revealed ? 'disabled' : ''}>${esc(tok.t)}</button>`;
    if (!st.revealed) {
      const pool = o.tokens.filter(t => !o.picked.includes(t.i));
      ask = `<div class="ord-answer" aria-label="Tu frase">${o.picked.length ? o.picked.map((i, k) => chip(o.tokens.find(t => t.i === i), `data-ord-remove="${k}"`)).join('') : '<span class="hint">Toca las piezas en orden</span>'}</div>
        <div class="ord-pool">${pool.map(t => chip(t, `data-ord-pick="${t.i}"`)).join('')}</div>
        ${preview ? '' : `<div class="btnrow" style="justify-content:center"><button type="button" class="ghost small-btn" data-act="ord-clear" ${o.picked.length ? '' : 'disabled'}>Empezar de nuevo</button>
          <button type="button" class="primary" data-act="ord-check" ${pool.length ? 'disabled' : ''}>Comprobar</button></div>`}`;
    } else if (o.checked) {
      const mine = o.picked.map(i => o.tokens.find(t => t.i === i).t);
      const right = orderTokens(val(tpl.answer));
      ask = o.ok ? `<div class="verdict ok">${icon('check', { size: 16 })} Correcto: <b>${esc(orderJoin(right, val(tpl.answer)))}</b></div>`
        : `<div class="verdict bad"><div class="vrow"><span class="vl">Tu frase</span><span class="ord-line">${mine.map((t, k) => `<span class="ochip ${t === right[k] ? 'ok' : 'bad'}">${esc(t)}</span>`).join('')}</span></div>
           <div class="vrow"><span class="vl">Correcta</span><span class="ord-line">${right.map(t => `<span class="ochip ok">${esc(t)}</span>`).join('')}</span></div></div>`;
    }
  }
  if (tpl.mode === 'draw') {
    const target = stripRuby(val(tpl.answer)).replace(/\*/g, '').trim();
    if (preview) ask = `<div class="draw-ph">${icon('pencil', { size: 16 })} Aquí escribirás a mano: <b>${esc(target || '…')}</b></div>`;
    else if (!st.revealed) ask = `<div class="draw-area" id="drawArea"></div><div class="draw-ctl" id="drawCtl"></div>`;
    else if (st.drawn?.img) ask = `<div class="draw-compare"><figure><img src="${st.drawn.img}" alt="Tu dibujo"><figcaption>Tu dibujo</figcaption></figure>
        <figure><div class="draw-solution" lang="${esc(fdef(tpl.answer)?.lang || '')}" style="font-size:${Math.max(18, Math.min(96, Math.round(150 / Math.max(1, [...target].length))))}px">${esc(target)}</div><figcaption>Solución</figcaption></figure></div>`;
    else if (st.drawn && !st.drawn.gaveUp) {
      const m = st.drawn.mistakes;
      ask = `<div class="verdict ${m ? 'bad' : 'ok'}" style="text-align:center">${m ? `${m} ${m === 1 ? 'trazo fallado' : 'trazos fallados'}` : `${icon('check', { size: 16 })} Todos los trazos bien`}${st.drawn.peeked ? ' · miraste la animación' : ''}</div>`;
    }
  }

  // Entender: Explícalo y ¿Qué pasaría si…?
  if (tpl.mode === 'explain' || tpl.mode === 'whatif') {
    const ent = entenderHTML(model, st, { preview });
    front = `<span class="ent-chip">${tpl.mode === 'explain' ? 'Explícalo con tus palabras' : '¿Qué pasaría si…?'}</span>${front}`;
    ask = ent.ask;
    if (st.revealed) return { front, ask, answer: ent.answer + tpl.back.map(id => block(id, false)).join('') };
  }

  // Respuesta
  let answer = '';
  if (st.revealed) {
    if (tpl.mode === 'flip') answer = tpl.back.map((id, i) => block(id, i === 0)).join('');
    else if (['cloze', 'choice', 'match', 'occlusion', 'conj', 'sort', 'clozechoice', 'number'].includes(tpl.mode)) answer = tpl.back.map(id => block(id, false)).join('');
    else {
      // type · listen · order · draw: la respuesta principal solo se repite si no la has resuelto ya arriba
      answer = sayAns ? rest : (resolved ? '' : tpl.mode === 'order' ? `<div class="fld fld-main"><div class="fld-v"><span class="fld-t">${fmt(orderJoin(orderTokens(val(tpl.answer)), val(tpl.answer)))}</span>${say(tpl.answer)}</div></div>` : block(tpl.answer, true)) + rest;
    }
  }
  return { front, ask, answer };
}
/* ---------- Emparejar e imagen tapada ---------- */
const shuffled = a => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
function matchState(text) {
  const pairs = parsePairs(text).slice(0, 8).map((p, i) => ({ ...p, i }));
  let right = shuffled(pairs);
  for (let k = 0; k < 5 && pairs.length > 1 && right.every((p, i) => p.i === i); k++) right = shuffled(pairs);
  return { pairs, left: shuffled(pairs), right, sel: null, done: [], wrong: 0, bad: null };
}
// Tocar un elemento al emparejar: el primero se marca; el segundo (del otro lado) comprueba la pareja
export function pickMatch(key) {
  const st = S.session?.st;
  if (!st?.match || S.session.revealed) return;
  const m = st.match;
  m.bad = null;
  if (!m.sel || m.sel === key || m.sel[0] === key[0]) { m.sel = m.sel === key ? null : key; return renderStudy(); }
  const a = +m.sel.slice(2), b = +key.slice(2);
  if (a === b) m.done.push(a); else { m.wrong++; m.bad = [m.sel, key]; }
  m.sel = null;
  if (m.done.length === m.pairs.length) return reveal();
  renderStudy();
}
// La imagen con sus recuadros: todos tapados; el que se pregunta, resaltado (y destapado al ver la respuesta)
export function occlusionHTML(imgText, maskText, cur, revealed, { edit = false } = {}) {
  const id = imageIdIn(imgText);
  if (!id) return edit ? '' : '<div class="fld fld-main"><span class="muted">Falta la imagen</span></div>';
  const masks = parseMasks(maskText);
  return `<div class="occ${edit ? ' occ-edit' : ''}" ${edit ? 'id="occStage"' : ''}>${imgHTML(id)}${masks.map((m, k) => `<${edit ? 'button type="button"' : 'div'} class="occ-m${k === cur ? ' cur' : ''}${k === cur && revealed ? ' open' : ''}" style="left:${m.x}%;top:${m.y}%;width:${m.w}%;height:${m.h}%" ${edit ? `data-occ-del="${k}" title="Quitar este recuadro"` : ''}>${edit ? `<span>${k + 1}</span>` : k === cur && !revealed ? '<span>?</span>' : ''}</${edit ? 'button' : 'div'}>`).join('')}</div>`;
}
// Opciones de «Hueco con opciones»: la buena, las que pusiste y, si faltan, huecos de otras tarjetas del mazo
export function clozeChoices(c, model, pool = null) {
  const others = pool || cardList().filter(x => x.deck_id === c?.deck_id && x.id !== c?.id).map(x => { const m = cardModel(x); return m.tpl.mode === 'clozechoice' || m.tpl.mode === 'cloze' ? clozeAnswer(m.fields[m.tpl.mode === 'cloze' ? m.tpl.front[0] : m.tpl.answer]) : ''; }).filter(Boolean);
  const tpl = { ...model.tpl, answer: '__a' };
  return { ...choiceOptions(tpl, { ...model.fields, __a: clozeAnswer(model.fields[model.tpl.answer]) }, others), picked: -1 };
}
function sortState(text) {
  const groups = parseGroups(text).slice(0, 6);
  const items = shuffled(groups.flatMap((g, k) => g.items.map(t => ({ t, g: k }))).slice(0, 18)).map((it, i) => ({ ...it, i }));
  return { groups: groups.map(g => g.name), items, place: {}, sel: null, checked: false };
}
export function sortAction(kind, i) {
  const so = S.session?.st?.sort;
  if (!so || S.session.revealed) return;
  if (kind === 'pick') so.sel = so.sel === i ? null : i;
  // Con uno elegido, tocar otro ya colocado es tocar su grupo; si no, ese vuelve a la bandeja
  else if (kind === 'back') { if (so.sel != null && so.sel !== i) so.place[so.sel] = so.place[i]; else delete so.place[i]; so.sel = null; }
  else if (kind === 'group' && so.sel != null) { so.place[so.sel] = i; so.sel = null; }
  renderStudy();
}
// Al tocar un altavoz: si el dispositivo no tiene voz para ese idioma, se avisa (si no, no se oiría nada)
export const noVoiceText = lang => `Tu dispositivo no tiene voz en ${langLabel(lang).toLowerCase()}. Puedes instalarla en los ajustes de voz del sistema`;
export function sayOrWarn(text, lang, opts) {
  if (!lang || !String(text || '').trim()) return false;
  if (voiceMissing(lang)) { toast(noVoiceText(lang)); return false; }
  return speak(text, lang, opts);
}
// «Probar» la voz (Ajustes): una frase en cada idioma de tus listas y cuáles tienen voz en este dispositivo
const VOICE_SAMPLES = { tr: 'Merhaba, nasılsın?', ja: 'こんにちは。', de: 'Hallo, wie geht es dir?', en: 'Hello, how are you?', fr: 'Bonjour, comment ça va ?', it: 'Ciao, come stai?',
  pt: 'Olá, tudo bem?', es: 'Hola, ¿qué tal?', ca: 'Hola, com estàs?', eu: 'Kaixo, zer moduz?', gl: 'Ola, que tal?', nl: 'Hallo, hoe gaat het?', ru: 'Привет, как дела?', el: 'Γεια σου, τι κάνεις;',
  ar: 'مرحبا، كيف حالك؟', zh: '你好，你好吗？', ko: '안녕하세요?' };
export function testVoices() {
  const langs = [...new Set([...S.decks.values()].filter(d => !d.archived).map(d => deckLang(d.id)).filter(Boolean))];
  if (!langs.length) langs.push(nativeLang());
  const name = l => langLabel(l).toLowerCase(), list = xs => xs.length > 1 ? `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}` : xs[0];
  const ok = langs.filter(l => !voiceMissing(l)), no = langs.filter(l => voiceMissing(l));
  ok.forEach((l, i) => speak(VOICE_SAMPLES[l.split('-')[0]] || 'Hola', l, { queue: i > 0 }));
  const out = $('#voiceTest');
  const msg = [ok.length ? `Con voz: ${list(ok.map(name))}.` : '', no.length ? `Sin voz: ${list(no.map(name))}. Puedes instalarla en los ajustes de voz del sistema.` : ''].filter(Boolean).join(' ');
  if (out) { out.hidden = false; out.textContent = msg; out.classList.toggle('is-warn', no.length > 0); } else toast(msg);
}
/* ---------- Dictado y escritura a mano ---------- */
export function playListen(model, rate = 1) {
  const f = model.type.fields.find(x => x.id === model.tpl.answer);
  if (f?.lang) sayOrWarn(model.fields[model.tpl.answer], f.lang, { rate: rate * 0.95 });
}
async function mountDraw(st, model) {
  const area = $('#drawArea'), ctl = $('#drawCtl');
  if (!area || st.drawMounted === area) return;
  st.drawMounted = area;
  const tpl = model.tpl;
  const lang = model.type.fields.find(f => f.id === tpl.answer)?.lang || '';
  const target = stripRuby(model.fields[tpl.answer] || '').replace(/\*/g, '').trim();
  const chars = charsOf(target);
  const size = Math.max(200, Math.min(300, Math.floor(area.clientWidth || 280)));
  area.innerHTML = '<div class="draw-loading"><div class="spin" aria-label="Cargando"></div></div>';
  const quizable = await canQuiz(chars, lang);
  if (S.session?.st !== st || st.revealed || !area.isConnected) return;
  st.draw && st.draw.stop?.();
  if (quizable) {
    area.innerHTML = `<div class="hw-box" id="hwBox" style="width:${size}px;height:${size}px"></div>`;
    const progress = (i, n) => {
      ctl.innerHTML = `${n > 1 ? `<span class="draw-step">Carácter ${i + 1} de ${n}</span>` : ''}
        <button type="button" class="ghost small-btn" data-act="draw-peek">Ver cómo se escribe</button>`;
    };
    st.draw = startQuiz($('#hwBox'), chars, lang, {
      size, guide: !!tpl.guide, onProgress: progress,
      onStroke: ok => haptic(ok ? 'stroke' : 'miss'),
      onDone: r => { st.drawn = { ...r, peeked: !!st.peeked }; reveal(); },
    });
  } else {
    area.innerHTML = `<div class="canvas-wrap" style="width:${size}px;height:${size}px">
      ${tpl.guide ? `<div class="canvas-guide" style="font-size:${Math.round(size * 0.8 / Math.max(1, chars.length))}px">${esc(target)}</div>` : ''}
      <canvas id="drawCanvas" class="canvas-box" aria-label="Zona para dibujar"></canvas></div>`;
    st.draw = startCanvas($('#drawCanvas'), { size });
    ctl.innerHTML = `<button type="button" class="ghost small-btn" data-act="draw-clear">Borrar</button>
      <button type="button" class="primary" data-act="draw-done">Comprobar</button>`;
  }
}
export function strokesSheet(text, lang) {
  const chars = [...stripRuby(text)].filter(isCJK).slice(0, 6);
  if (!chars.length) return;
  openSheet(`<h2 class="sheet-hand">Orden de trazos</h2><p class="muted small">${esc(chars.join(''))} · se repite en bucle</p>
    <div class="hw-anim-row" id="hwAnim"><div class="spin" aria-label="Cargando"></div></div>
    <p class="hw-credits">Trazos: Hanzi Writer · animCJK · Make Me A Hanzi</p>
    <div class="btnrow"><span class="spacer"></span><button class="ghost" data-act="close-sheet">Cerrar</button></div>`);
  canQuiz(chars, lang).then(ok => {
    const box = $('#hwAnim');
    if (!box) return;
    if (!ok) { box.innerHTML = '<p class="muted">No hay datos de trazos para estos caracteres (o no hay conexión).</p>'; return; }
    animateChars(box, chars, lang, chars.length > 2 ? 110 : 150);
  });
}

function speakFields(model, ids) {
  const { type, fields } = model;
  for (const id of ids) {
    const f = type.fields.find(x => x.id === id);
    if (S.prefs.study.autoplay && f?.autoplay && f.lang && String(fields[id] || '').trim()) { speak(fields[id], f.lang); return; }
  }
}
function revealIds(tpl) {
  return tpl.mode === 'type' || tpl.mode === 'choice' ? [tpl.answer, ...tpl.back] : tpl.mode === 'cloze' ? tpl.front : tpl.back;
}

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
// Cola de estudio según Ajustes: límites de nuevas (global y por mazo), de repasos, orden y mezcla
function buildSession(scope, size = 0) {
  const P = S.prefs.study, inScope = scopeTest(scope), now = Date.now();
  const pool = cardList().filter(inScope);
  // «Repasar solo lo que flojea»: todas, toque o no repasarlas hoy (las que te cuestan primero)
  if (scope === 'weak') return pool.sort((a, b) => S.progress.get(a.id).interval - S.progress.get(b.id).interval || S.progress.get(a.id).due - S.progress.get(b.id).due).map(c => c.id);
  // Con un examen cerca, sus preguntas primero; luego, lo más atrasado
  const near = nearDecks(), first = c => (near.has(c.deck_id) ? 0 : 1);
  let dueCards = pool.filter(c => { const p = S.progress.get(c.id); return p && p.due <= now; })
    .sort((a, b) => first(a) - first(b) || S.progress.get(a.id).due - S.progress.get(b.id).due);
  // Con tope de repasos (el de Ajustes o el reparto de lo atrasado): el tope se reparte según el foco de cada
  // mazo (de cada uno, las más atrasadas) y lo del examen cercano va antes. Lo que ya viste hoy y vuelve no gasta.
  const cap = reviewsLeft(), capped = dueCards.filter(c => !seenToday(S.progress.get(c.id)));
  if (capped.length > cap) {
    const byDeck = new Map();
    for (const c of capped) byDeck.set(c.deck_id, (byDeck.get(c.deck_id) || 0) + 1);
    const sh = shares(S.decks, S.folders, dayNodes(), d => byDeck.has(d.id));
    for (const id of byDeck.keys()) if (!sh.has(id)) sh.set(id, 1);
    const floors = new Map([...byDeck].filter(([id]) => near.has(id)));
    const q = allocate(cap, sh, byDeck, floors), used = new Map();
    dueCards = dueCards.filter(c => { if (seenToday(S.progress.get(c.id))) return true; const u = used.get(c.deck_id) || 0; if (u >= (q.get(c.deck_id) || 0)) return false; used.set(c.deck_id, u + 1); return true; });
  }
  // Hermanas (ida y vuelta de una nota): una sola por tanda. Si una ya sale (o la viste hoy), la otra espera:
  // un repaso de la misma nota, a otra tanda; una nueva, a otro día
  const notes = new Set();
  if (P.burySiblings) {
    for (const c of pool) if (c.note_id && S.progress.get(c.id) && seenToday(S.progress.get(c.id)) && !(S.progress.get(c.id).due <= now)) notes.add(c.note_id);
    dueCards = dueCards.filter(c => !c.note_id || (!notes.has(c.note_id) && notes.add(c.note_id)));
  }
  const due = dueCards.map(c => c.id);
  let fresh = pool.filter(c => !S.progress.get(c.id) && !notes.has(c.note_id)).sort((a, b) => a.position - b.position);
  if (P.newOrder === 'random') shuffle(fresh);
  // Cuántas de cada mazo: el plan de estudio (solo mazos activos, según el foco y los exámenes).
  // Tarjetas hermanas (misma nota): solo una nueva por sesión, para no ver la respuesta en la otra;
  // se descartan antes de contar, para que no gasten hueco.
  // Desde una lista o un apunte (o un apartado) se puede estudiar todo lo nuevo, sin el límite del día
  const quota = newPlan(scope), all = scope.startsWith('page:') || S.decks.has(scope), seenNotes = new Set(), perDeck = new Map();
  const byDeck = new Map();
  for (const c of fresh) {
    const used = perDeck.get(c.deck_id) || 0;
    if (!all && used >= (quota.get(c.deck_id) || 0)) continue;
    if (P.burySiblings && c.note_id) { if (seenNotes.has(c.note_id)) continue; seenNotes.add(c.note_id); }
    perDeck.set(c.deck_id, used + 1);
    if (!byDeck.has(c.deck_id)) byDeck.set(c.deck_id, []);
    byDeck.get(c.deck_id).push(c.id);
  }
  // Intercaladas: una de cada mazo por turno
  fresh = [];
  const lists = [...byDeck].sort(([a], [b]) => (near.has(a) ? 0 : 1) - (near.has(b) ? 0 : 1)).map(([, l]) => l);
  for (let k = 0; lists.some(l => k < l.length); k++) for (const l of lists) if (k < l.length) fresh.push(l[k]);
  // Tanda corta: las N primeras, siempre con las nuevas intercaladas (una de cada cuatro)
  if (size) return composeShort(due, fresh, size);
  if (P.mix === 'reviewsFirst') return [...due, ...fresh];
  if (P.mix === 'newFirst') return [...fresh, ...due];
  const q = []; let i = 0, j = 0;
  while (i < due.length || j < fresh.length) {
    for (let k = 0; k < 3 && i < due.length; k++) q.push(due[i++]);
    if (j < fresh.length) q.push(fresh[j++]);
  }
  return q;
}
// Nuevas que aún quedan en un ámbito y que podrían salir hoy (una por nota si las hermanas esperan, y ninguna
// de una nota que ya viste hoy): las de «N nuevas más» al final de la tanda
export function freshLeft(scope) {
  const bury = S.prefs.study.burySiblings, pool = cardList().filter(scopeTest(scope)), notes = new Set();
  if (bury) for (const c of pool) { const p = S.progress.get(c.id); if (c.note_id && p && seenToday(p)) notes.add(c.note_id); }
  let n = 0;
  for (const c of pool) {
    if (S.progress.get(c.id)) continue;
    if (bury && c.note_id) { if (notes.has(c.note_id)) continue; notes.add(c.note_id); }
    n++;
  }
  return n;
}
// Lo que sale hoy en un ámbito, con las mismas reglas que la tanda: { ids, due, fresh } (Hoy, Biblioteca, apuntes)
export function todayQueue(scope = 'all') {
  const ids = buildSession(scope);
  const due = ids.filter(id => S.progress.get(id)).length;
  return { ids, due, fresh: ids.length - due };
}
// La barra de la sesión: un segmento por tarjeta (las hechas, en blanco); con muchas, una barra continua
function segBar(ses) {
  const seen = ses.answered ?? ses.done, total = seen + ses.queue.length, pct = Math.round(100 * seen / Math.max(1, total));
  const aria = `role="progressbar" aria-label="Progreso de la tanda" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${seen}"`;
  if (total > 60 || total < 2) return `<div class="bar" ${aria}><span style="width:${pct}%"></span></div>`;
  return `<div class="bar bar-seg" style="--n:${total}" ${aria}>${Array.from({ length: total }, (_, i) => `<i${i < seen ? ' class="on"' : ''}></i>`).join('')}</div>`;
}
// minutes: tanda corta de esa duración (las preguntas que caben a tu ritmo)
// firstRun: la primera tanda (tras la primera vez): explica los botones y al final pregunta la duración y el aviso
// ids: unas preguntas concretas, toque o no repasarlas (desde el mapa); al salir se vuelve a scope
export function startSession(scope = 'all', { minutes = 0, firstRun = false, ids = null, back = null, backLabel = '' } = {}) {
  const queue = ids ? ids.filter(id => S.cards.has(id)) : buildSession(scope, minutes ? shortSize(minutes) : 0);
  if (!queue.length) { toast('No hay preguntas pendientes aquí'); return; }
  S.session = { scope, queue, done: 0, revealed: false, tally: { 1: 0, 2: 0, 3: 0, 4: 0 }, undo: null, st: null, startedAt: Date.now(), minutes, firstRun, picked: !!ids, back, backLabel };
  go('study');
}
// Preguntas que caben en una tanda de N minutos, a tu ritmo
export const shortSize = (minutes = tandaMinutes()) => tandaSize(minutes, pace(S.events));
export function shortInfo() { const minutes = tandaMinutes(), secs = pace(S.events); return { minutes, secs, n: tandaSize(minutes, secs) }; }
// El día se cumple con tus minutos, no con dejar la cola a cero: hecho por hoy si ya has respondido lo que cabía
// en la tanda de hoy (a tu ritmo de antes de hoy) o has estado los minutos del día respondiendo, empezaras donde
// empezaras (Hoy, el Plan, una lista o un apunte). Lo que queda pasa a mañana. null si no, o si hoy es libre.
export function dayDone(now = Date.now()) {
  const m = todayMinutes();
  if (m === 0) return null;
  const minutes = m || S.prefs.study.tandaMin, t0 = startOfDay(now);
  const before = S.events.filter(e => e.t < t0), today = S.events.filter(e => e.t >= t0);
  if (!today.length) return null;
  const ms = today.reduce((s, e) => s + Math.min(120e3, Number(e.ms) || 0), 0);
  if (today.length < tandaSize(minutes, pace(before)) && ms < minutes * 60e3) return null;
  return { n: today.length, minutes: Math.max(1, Math.round(ms / 60e3)) };
}
// Lo que queda, como enlace secundario: «Quedan 13 repasos · otra tanda de 5 min»
export function restLink(q) {
  if (!q.ids.length) return '';
  const what = q.fresh ? plural(q.ids.length, 'pregunta', 'preguntas') : plural(q.ids.length, 'repaso', 'repasos');
  const { mins } = tandaFit(q.ids.length);
  return `<button class="link day-rest" data-act="tanda-rest" data-min="${mins}">Quedan ${what} · otra tanda de ${mins} min</button>`;
}
// La tanda de hoy con lo que hay de verdad: si tocan menos preguntas de las que caben, los minutos que llevan (m preguntas, mins)
export function tandaFit(avail) {
  const { minutes, n, secs } = shortInfo(), m = Math.min(n, avail);
  return { minutes, n, secs, m, mins: m < n ? Math.max(1, Math.ceil((m * secs) / 60)) : minutes };
}
export function shuffleTokens(o) {
  const a = o.tokens;
  for (let k = 0; k < 8; k++) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    if (a.length < 2 || a.some((t, i) => t.i !== i)) break;   // que no salga ya ordenado
  }
}
function cardState(c) {
  const ses = S.session;
  if (ses.st && ses.st.id === c.id) return ses.st;
  const model = cardModel(c);
  const st = { id: c.id, revealed: false, hint: false, typed: null, choice: null, played: false };
  if (model.tpl.mode === 'order') {
    st.order = { tokens: orderTokens(model.fields[model.tpl.answer]).map((t, i) => ({ t, i })), picked: [] };
    shuffleTokens(st.order);
  }
  if (model.tpl.mode === 'match') st.match = matchState(model.fields[model.tpl.answer]);
  if (model.tpl.mode === 'sort') st.sort = sortState(model.fields[model.tpl.answer]);
  if (model.tpl.mode === 'clozechoice') st.choice = clozeChoices(c, model);
  if (model.tpl.mode === 'choice') {
    const pool = cardList().filter(x => x.deck_id === c.deck_id && x.id !== c.id && x.type_id === c.type_id)
      .map(x => { const m = cardModel(x); return m.fields[m.tpl.answer] ?? x.back; });
    if (pool.length < 3) pool.push(...cardList().filter(x => x.deck_id === c.deck_id && x.id !== c.id).map(x => x.back));
    st.choice = { ...choiceOptions(model.tpl, model.fields, pool), picked: -1 };
  }
  ses.st = st;
  ses.shownAt = Date.now();   // para medir el tiempo de cada pregunta
  return st;
}
/* ---------- Entender: Explícalo y ¿Qué pasaría si…? ---------- */
const DIRS = [['up', '↑', 'Sube'], ['eq', '=', 'Igual'], ['down', '↓', 'Baja']];
export const ENT_MODES = ['explain', 'whatif'];
const ENT_GRADES = [{ g: 1, label: 'Todavía no' }, { g: 2, label: 'A medias' }, { g: 3, label: 'Lo sé explicar' }];
const ENT_LABEL = { 1: 'Todavía no', 2: 'A medias', 3: 'Lo sabrías explicar', 4: 'Lo sabrías explicar' };
// Fin de tanda con preguntas de entender: «Lo que entiendes», por ideas (la última respuesta de cada una)
function entDoneHTML(ses) {
  const last = new Map();
  for (const x of ses.ent || []) last.set(x.id, x.g);
  if (!last.size) return '';
  const rows = [...last].map(([id, g]) => { const c = S.cards.get(id); return c ? `<li><span>${esc(String(c.front).split('\n')[0].slice(0, 70))}</span><b class="ent-pill eg${g}">${ENT_LABEL[g]}</b></li>` : ''; }).join('');
  return `<section class="ent-done"><h3>Lo que entiendes</h3><p>Por ideas de tu apunte, no por aciertos.</p><ul>${rows}</ul></section>`;
}
const canDictate = () => typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
// El estado de una pregunta de entender: modo, lo escrito, ↑ = ↓ elegidos e ideas marcadas
function entState(model, st) {
  if (!st.ex) {
    const effects = model.tpl.mode === 'whatif' ? parseEffects(model.fields.e) : [];
    st.ex = { mode: 'think', text: '', effects, picks: effects.map(() => null), ideas: null };
  }
  return st.ex;
}
// Lo que se lleva acertado: ideas marcadas y, en ¿Qué pasaría si…?, efectos bien elegidos → { hits, total }
export function entScore(model, st) {
  const ex = entState(model, st), ideas = ideasOf(model.fields[model.tpl.answer]);
  const okFx = ex.effects.filter((f, i) => ex.picks[i] === f.dir).length;
  const okIdeas = (ex.ideas || []).filter(Boolean).length;
  return { hits: okFx + okIdeas, total: ex.effects.length + ideas.length };
}
function entenderHTML(model, st, { preview = false } = {}) {
  const ex = entState(model, st), ideas = ideasOf(model.fields[model.tpl.answer]), fx = ex.effects;
  let ask = '';
  if (fx.length) {
    // ↑ = ↓ en cada efecto (al comprobar: bien o mal, y la correcta)
    ask = `${model.fields.p ? '' : '<p class="ent-q">¿Qué pasa con…?</p>'}<div class="wi-rows">${fx.map((f, i) => `<div class="wi-row"><span class="wi-name">${esc(f.name)}</span><span class="wi-btns" role="group" aria-label="${esc(f.name)}">${DIRS.map(([d, sym, label]) => {
      const cls = st.revealed ? (d === f.dir ? ' is-right' : ex.picks[i] === d ? ' is-wrong' : '') : '';
      return `<button type="button" class="wi-b${cls}" data-wi="${i}:${d}" aria-pressed="${ex.picks[i] === d}" aria-label="${label}" ${st.revealed || preview ? 'disabled' : ''}>${sym}</button>`;
    }).join('')}</span></div>`).join('')}</div>`;
  } else if (!st.revealed) {
    const modes = [['write', 'Escribir'], ...(canDictate() ? [['dictate', 'Dictar']] : []), ['think', 'Pensarlo']];
    ask = `<div class="ent-modes" role="group" aria-label="Cómo lo explicas">${modes.map(([m, l]) => `<button type="button" data-ex-mode="${m}" aria-pressed="${ex.mode === m}" ${preview ? 'disabled' : ''}>${l}</button>`).join('')}</div>
      ${ex.mode === 'think' ? '<p class="ent-tip">Piénsalo en voz baja, como si se lo contaras a alguien. Luego compara con tu apunte.</p>'
        : `${ex.mode === 'dictate' ? `<button type="button" class="ghost small-btn ent-mic" data-act="ex-dictate">${icon('mic', { size: 16 })} ${S.dictating ? 'Parar' : 'Empezar a dictar'}</button>` : ''}
        <textarea id="exText" class="ent-text" rows="4" placeholder="${ex.mode === 'dictate' ? 'Aquí sale lo que dictas' : 'Explícalo como se lo contarías a alguien'}" ${preview ? 'disabled' : ''}>${esc(ex.text)}</textarea>`}`;
  }
  let answer = '';
  if (st.revealed && ideas.length) {
    // Al destapar: las ideas que salen en lo escrito, ya marcadas (se pueden cambiar)
    if (!ex.ideas) ex.ideas = ideas.map(idea => !!ex.text.trim() && ideaHit(idea, ex.text));
    answer = `<div class="ent-ideas"><h3 class="ent-h">${fx.length ? '¿Por qué?' : '¿Qué ideas te salieron?'}</h3><p class="ent-sub">Las ideas clave de tu apunte. Marca las que dijiste.</p>
      ${ideas.map((idea, i) => `<label class="ent-idea"><input type="checkbox" data-idea="${i}" ${ex.ideas[i] ? 'checked' : ''}><span>${fmt(idea)}</span></label>`).join('')}</div>`;
  }
  if (st.revealed) {
    const { hits, total } = entScore(model, st);
    answer += `<p class="ent-verdict"><span>¿Cómo lo ves?</span><b>${esc(verdictText(hits, total))}</b></p>`;
  }
  return { ask, answer };
}
// Dictar: lo que se oye va al cuadro de texto (se puede corregir a mano)
let rec = null;
export function toggleDictation() {
  const st = S.session?.st, el = $('#exText');
  if (!st?.ex) return;
  if (rec) { rec.stop(); return; }
  const R = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!R) return toast('Este navegador no puede dictar: escríbelo o piénsalo');
  rec = new R();
  rec.lang = 'es-ES'; rec.interimResults = true; rec.continuous = true;
  const base = st.ex.text ? st.ex.text.replace(/\s*$/, ' ') : '';
  rec.onresult = e => { st.ex.text = base + [...e.results].map(r => r[0].transcript).join(' '); if (el?.isConnected) el.value = st.ex.text; };
  rec.onend = () => { rec = null; S.dictating = false; renderStudy(); };
  rec.onerror = () => toast('No se ha podido dictar');
  S.dictating = true;
  rec.start();
  renderStudy();
}

// Fin de tanda: la carita dibujada a mano
const DONE_FACE = `<svg class="done-face" viewBox="0 0 80 64" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
  <path d="M10 14l5 5M24 6l2 7M40 3v7M56 6l-2 7M70 14l-5 5"/><path d="M27 32q3-5 6 0M47 32q3-5 6 0"/><path d="M20 42q20 22 40 0"/></svg>`;
// Preguntas distintas que has estudiado hoy (repasos y nuevas)
function doneToday() {
  const t0 = startOfDay();
  let n = 0;
  for (const p of S.progress.values()) if (p.last >= t0) n++;
  return n;
}
// Tandas acabadas hoy en este dispositivo
function tandasToday() {
  try { const x = JSON.parse(localStorage.getItem('flaski-tandas') || 'null'); return x?.day === dateKey(Date.now()) ? x.n : 0; } catch { return 0; }
}
function countTanda() {
  try { localStorage.setItem('flaski-tandas', JSON.stringify({ day: dateKey(Date.now()), n: tandasToday() + 1 })); } catch { /* sin almacenamiento */ }
}
// Al salir, se vuelve a donde empezó la tanda: el apunte, la lista o la carpeta (si no, a Hoy)
export function exitTarget(scope = 'all') {
  if (S.session?.back) return S.session.back;   // p. ej. «Repasar los fallos» vuelve a la nota del simulacro
  if (scope.startsWith('page:') && S.pages.has(scope.split(':')[1])) return ['page', { pageId: scope.split(':')[1] }];
  if (scope.startsWith('folder:') && S.folders.has(scope.slice(7))) return ['decks', { folderId: scope.slice(7) }];
  if (S.decks.has(scope)) return ['deck', { deckId: scope, cardQuery: '' }];
  return ['home', {}];
}
const exitLabel = scope => S.session?.backLabel || (S.mapView === scope ? 'Volver al mapa' : ({ page: 'Volver a los apuntes', decks: 'Volver a la carpeta', deck: 'Volver a la lista' }[exitTarget(scope)[0]] || 'Volver al inicio'));
export function renderStudy() {
  const ses = S.session;
  if (!ses) return go('home');
  // Arriba: salir (un círculo), el nombre de la lista y «pregunta N de M»; debajo, la barra por segmentos
  const head = (where, left, exit = 'chevron-left') => `<div class="studybar"><button class="sb-back" data-act="exit" aria-label="Salir de la tanda">${icon(exit, { size: 18 })}</button><span class="sb-info"><span class="where">${esc(where)}</span>${left ? `<span class="left">${left}</span>` : ''}</span></div>${segBar(ses)}`;
  if (!ses.queue.length) {
    const t = ses.tally, min = Math.max(1, Math.round((Date.now() - (ses.startedAt || Date.now())) / 60e3));
    if (!ses.counted) { ses.counted = true; countTanda(); }
    const tally = `<div class="tally">${GRADES.map(({ g, label }) => `<span class="g${g}"><b>${t[g]}</b>${label}</span>`).join('')}</div>`;
    const sub = `<p class="done-sub">${plural(ses.done, 'pregunta', 'preguntas')} · ${min} min</p>`;
    const again = ses.undo ? '<button class="link" data-act="undo">Deshacer la última</button>' : '';
    // La primera tanda: cuánto suele durar tu rato de estudio y si te avisamos mañana a esta hora
    if (ses.firstRun) {
      const at = new Date(), time = `${String(at.getHours()).padStart(2, '0')}:${String(Math.floor(at.getMinutes() / 5) * 5).padStart(2, '0')}`;
      const cur = S.prefs.study.tandaAsked ? S.prefs.study.tandaMin : 10;
      main.innerHTML = `${head(scopeName(ses.scope), '', 'x')}<div class="done done-first">${DONE_FACE}<h2>¡Primera tanda hecha!</h2>${sub}${tally}
        <section class="first-box"><h3>¿Cuánto suele durar tu rato de estudio?</h3>
          <div class="first-opts" role="group" aria-label="Duración de la tanda">${TANDA_MINUTES.map(m => `<button type="button" class="tanda-opt" data-tanda-min="${m}" aria-pressed="${m === cur}">${m} min</button>`).join('')}</div>
          <p>Haremos tandas que quepan en ese rato.</p></section>
        ${remindOffer() ? `<section class="first-box" id="firstRemind"><h3>¿Te aviso mañana a las ${time}?</h3><p>Es la hora a la que has estudiado hoy.</p>
          <div class="first-opts"><button type="button" class="first-yes" data-remind-at="${time}">Sí, avísame</button><button type="button" class="first-other" data-act="remind-other">Otra hora</button></div></section>` : ''}
        <div class="done-go"><button class="primary big" data-act="first-done">Listo, ir a Hoy</button></div>${again}</div>`;
      return;
    }
    // Tanda corta: lo que queda para hoy y otra tanda igual
    if (ses.minutes) {
      const left = todayQueue('all').ids.length, done = doneToday(), tandas = tandasToday();
      main.innerHTML = `${head(scopeName(ses.scope), '', 'x')}<div class="done">${DONE_FACE}<h2>${left ? '¡Tanda hecha!' : '¡Todo hecho por hoy!'}</h2>${sub}${tally}${entDoneHTML(ses)}
        ${left ? `<div class="done-left"><small>Para hoy</small><b>${left === 1 ? 'te queda 1' : `te quedan ${left}`}</b><span class="done-bar"><i style="width:${Math.round(100 * done / Math.max(1, done + left))}%"></i></span>
          <small>${done} de ${done + left} hechas · ${tandas === 1 ? '1 tanda' : `${tandas} tandas`} hoy</small></div>` : ''}
        <div class="done-go">${left > 1 ? `<button class="primary big" data-act="tanda-again">Otra tanda · ${ses.minutes} min</button><button class="ghost big" data-act="exit">Por hoy vale</button>`
          : left ? `<button class="primary big" data-start="all">Hacer la que queda</button><button class="ghost big" data-act="exit">Por hoy vale</button>`
          : '<button class="primary big" data-act="exit">Volver</button>'}</div>${again}</div>`;
      return;
    }
    const more = ses.picked ? 0 : Math.min(10, freshLeft(ses.scope));
    main.innerHTML = `${head(scopeName(ses.scope), '', 'x')}<div class="done">${DONE_FACE}<h2>¡Tanda hecha!</h2>${sub}${capNote(counts(ses.scope))}${tally}${entDoneHTML(ses)}
      <div class="done-go"><button class="primary big" data-act="exit">${exitLabel(ses.scope)}</button>${more ? `<button class="ghost big" data-act="more" data-more="${more}">${more === 1 ? '1 nueva más' : `${more} nuevas más`}</button>` : ''}</div>${again}</div>`;
    return;
  }
  const id = ses.queue[0];
  const c = S.cards.get(id);
  if (!c) { ses.queue.shift(); return renderStudy(); }
  const p = S.progress.get(id);
  const st = cardState(c);
  st.revealed = ses.revealed;
  const model = cardModel(c);
  const { front, ask, answer } = faceHTML(model, st);
  const hint = c.hint && !st.revealed
    ? (st.hint ? `<div class="hintbox">${icon('lightbulb', { size: 16 })} ${fmt(c.hint)}</div>` : '<button class="link hint-btn" data-act="show-hint">Ver pista</button>') : '';
  let foot;
  if (ses.revealed) {
    const now = Date.now();
    const d = st.drawn;
    const ent = ENT_MODES.includes(model.tpl.mode);
    const suggest = ent ? (() => { const { hits, total } = entScore(model, st); return suggestGrade(hits, total); })()
      : st.typed ? (st.typed.ok ? 3 : st.typed.near ? 2 : 1)
      : st.choice && st.choice.picked >= 0 ? (st.choice.opts[st.choice.picked] === st.choice.correct ? 3 : 1)
      : st.order?.checked ? (st.order.ok ? 3 : 1)
      : st.sort?.checked ? (() => { const bad = st.sort.items.filter(it => st.sort.place[it.i] !== it.g).length; return bad === 0 ? 3 : bad === 1 ? 2 : 1; })()
      : st.number ? (st.number.ok ? 3 : st.number.near ? 2 : 1)
      : st.conj ? (st.conj.every(x => x.ok) ? 3 : st.conj.every(x => x.ok || x.near) ? 2 : 1)
      : st.match && !st.match.gaveUp ? (st.match.wrong === 0 ? 3 : st.match.wrong === 1 ? 2 : 1)
      : st.match?.gaveUp ? 1
      : d && !d.img && !d.gaveUp ? (() => { const avg = d.mistakes / Math.max(1, d.n); return avg === 0 && !d.peeked ? 3 : avg <= 2 && !(d.peeked && avg > 0) ? 2 : 1; })()
      : d?.gaveUp || st.gaveUp ? 1 : 0;
    const P = S.prefs.study, A = algo(c.deck_id);
    // Entender: Todavía no · A medias · Lo sé explicar (= Otra vez · Difícil · Bien)
    const gs = ent ? ENT_GRADES : P.buttons === 2 ? GRADES.filter(x => x.g === 1 || x.g === 3) : GRADES;
    foot = `<div class="grades${gs.length === 2 ? ' two' : gs.length === 3 ? ' three ent-grades' : ''}">${gs.map(({ g, label }) => `<button class="grade g${g}${P.suggest && g === suggest ? ' suggested' : ''}" data-grade="${g}">${label}${P.showIntervals ? `<small>${fmtWhen(schedule(p, g, now, A).due, now)}</small>` : ''}</button>`).join('')}</div>`;
  } else if (ENT_MODES.includes(model.tpl.mode)) {
    foot = `<button class="primary big" data-act="reveal">${entState(model, st).effects.length ? 'Comprobar' : 'Ver las ideas clave'}</button>`;
  } else if (NEEDS_ANSWER.includes(model.tpl.mode)) {
    foot = '<button class="ghost big" data-act="reveal" data-giveup="1">No lo sé, ver respuesta</button>';
  } else {
    foot = '<button class="primary big" data-act="reveal">Ver respuesta</button>';
  }
  const tags = (c.tags || []).length ? `<span class="tags">${tagChips(c.tags)}</span>` : '';
  // «pregunta N de M»: cada respuesta avanza; la que vuelve tras «Otra vez» se suma al total
  const seen = ses.answered ?? ses.done, total = seen + ses.queue.length;
  main.innerHTML = `${head(ses.scope === 'all' ? deckName(c.deck_id) : scopeName(ses.scope), `pregunta ${Math.min(total, seen + 1)} de ${total} · ${p ? 'repaso' : 'nueva'}`)}<article class="card mode-${model.tpl.mode}" aria-live="polite">
      ${tags ? `<div class="card-top">${tags}</div>` : ''}
      <div class="front">${front}</div>${hint}${ask}
      ${ses.firstRun && ses.revealed && ses.done === 0 ? `<div class="first-tip" role="note"><b>¿Cómo te ha ido?</b><p>Sin trampas: según lo que elijas, Flaski decide cuándo volver a preguntártelo. Si te costó, pronto; si fue fácil, dentro de unos días.</p></div>` : ''}
      ${answer ? `<div class="answer"><div class="ans-l">respuesta</div>${answer}</div>` : ''}
    </article>${foot}
    <div class="studyfoot"><span class="keys"${S.prefs.study.shortcuts ? '' : ' hidden'}>${['flip', 'cloze', 'occlusion'].includes(model.tpl.mode) ? 'Espacio: mostrar · ' : ['choice', 'clozechoice'].includes(model.tpl.mode) ? '1-4: elegir · ' : ''}1-4: valorar</span><span class="btnrow">${ses.undo ? '<button class="link" data-act="undo">Deshacer</button>' : ''}${ses.revealed && c.page_id && S.pages.has(c.page_id) ? `<button class="link" data-open-page="${c.page_id}" data-open-block="${esc(c.block_id || '')}">${icon('notebook-text', { size: 15 })} Ver en los apuntes</button>` : ''}<button class="link" data-card="${id}">Editar pregunta</button></span></div>`;
  if (!st.played) {
    st.played = true;
    if (model.tpl.mode === 'listen') { if (S.prefs.study.autoplay) playListen(model, 1); }
    else speakFields(model, model.tpl.mode === 'cloze' ? [] : model.tpl.front);
  }
  if (!ses.revealed && model.tpl.mode === 'draw') mountDraw(st, model);
  if (ses.revealed && !st.playedBack) { st.playedBack = true; speakFields(model, revealIds(model.tpl)); }
  if (!ses.revealed && model.tpl.mode === 'type' && matchMedia('(hover:hover)').matches) $('#typed')?.focus();
  if (!ses.revealed && model.tpl.mode === 'conj' && matchMedia('(hover:hover)').matches) $('.conj-in')?.focus();
  if (!ses.revealed && model.tpl.mode === 'number' && matchMedia('(hover:hover)').matches) $('#numIn')?.focus();
  // Móvil: con la respuesta a la vista, deslizar la tarjeta valora (izquierda «Otra vez», derecha «Bien», arriba «Fácil», abajo «Difícil»)
  if (ses.revealed && S.prefs.study.swipe) {
    const two = S.prefs.study.buttons === 2;
    const map = { left: 1, right: 3, up: 4, down: 2 };
    const names = ENT_MODES.includes(model.tpl.mode) ? { left: 'Todavía no', right: 'Lo sé explicar', up: null, down: 'A medias' } : { left: 'Otra vez', right: 'Bien', up: two ? null : 'Fácil', down: two ? null : 'Difícil' };
    // La etiqueta dice también el intervalo de su botón: «Bien · 9 d»
    const when = d => main.querySelector(`.grade.g${map[d]} small`)?.textContent.trim();
    const sw = swipeable(main.querySelector('article.card'), {
      dirs: Object.fromEntries(Object.entries(names).map(([d, l]) => [d, l && when(d) ? `${l} · ${when(d)}` : l])),
      ceiling: () => (main.querySelector('.bar') || main.querySelector('.studybar'))?.getBoundingClientRect().bottom + 8 || 0,
      onCross: () => haptic('tick'),
      onSwipe: d => { countSwipe(); grade(map[d]); },
      // Mientras arrastras, las cuatro direcciones (si aún te hacen falta)
      onDrag: on => { if (!on) hideSwipeHints(); else if (swipeHintsDue()) showSwipeHints(sw || {}, { hold: true }); },
    });
    // La primera vez, solas un momento para que sepas que se puede deslizar
    if (!st.hinted && !S.prefs.study.swipeShown && swipeHintsDue()) { st.hinted = true; S.prefs.study.swipeShown = true; savePrefsSoon(); showSwipeHints(sw || {}); }
  }
}
// Pistas de deslizar (la chuleta de las cuatro direcciones): en cada borde la dirección y su botón, tenues.
// La primera vez salen solas un momento al ver la respuesta; después, solo mientras arrastras (no tapan nada).
// Solo en el móvil (táctil) y hasta haber deslizado 10 veces; vuelven tras 30 días sin deslizar.
function swipeHintsDue() {
  const P = S.prefs.study;
  return matchMedia('(pointer: coarse) and (hover: none)').matches && ((P.swipeCount || 0) < 10 || Date.now() - (P.swipeLast || 0) > 30 * 864e5);
}
function hideSwipeHints() { document.querySelector('.swipe-hints')?.remove(); }
function showSwipeHints({ up, down }, { hold = false } = {}) {
  const box = document.createElement('div');
  box.className = `swipe-hints${hold ? ' is-hold' : ''}`;
  box.setAttribute('aria-hidden', 'true');
  box.innerHTML = `<span class="sh-left"><i>←</i><em>Otra vez</em></span><span class="sh-right"><i>→</i><em>Bien</em></span>${up ? '<span class="sh-up">↑ Fácil</span>' : ''}${down ? '<span class="sh-down">↓ Difícil</span>' : ''}`;
  box.addEventListener('animationend', () => box.remove());
  document.querySelector('.swipe-hints')?.remove();
  document.body.append(box);   // fuera de main: no se borran si la pantalla se vuelve a pintar
}
function countSwipe() {
  const P = S.prefs.study;
  P.swipeCount = Math.min(10, (P.swipeCount || 0) + 1);
  P.swipeLast = Date.now();
  savePrefsSoon();
}
// Sensación táctil y sonora, si están activadas en Ajustes
const GRADE_SOUNDS = { 1: 'again', 2: 'hard', 3: 'good', 4: 'easy' };
function feedback(kind, g = null) {
  if (S.prefs.study.haptics) buzz(kind);
  if (S.prefs.study.sound) chime(g ? (GRADE_SOUNDS[g] || kind) : kind);
}
function haptic(kind) { feedback(kind); }
// giveUp: «No lo sé, ver respuesta» (sin haber respondido): se propone «Otra vez», como al fallar
export function reveal(giveUp = false) {
  const ses = S.session;
  if (!ses || ses.revealed) return;
  if (giveUp) ses.st = { ...(ses.st || {}), gaveUp: true };
  const st = ses.st;
  if (st) {
    st.draw?.stop?.();
    const c = S.cards.get(ses.queue[0]);
    if (c && cardModel(c).tpl.mode === 'draw' && !st.drawn) st.drawn = { gaveUp: true };
    if (st.match && st.match.done.length < st.match.pairs.length) st.match.gaveUp = true;
  }
  ses.revealed = true;
  renderStudy();
}
// Guarda una respuesta: el progreso, el registro para Estadísticas y los repasos del día (en la tanda y al repasar
// un apunte). Devuelve { prev, next, ev, day }
export function recordAnswer(id, g, ms = 0, now = Date.now()) {
  const prev = S.progress.get(id) || null;
  const card = S.cards.get(id);
  const next = schedule(prev, g, now, algo(card?.deck_id));
  const day = dateKey(now);
  // Registro de cada respuesta, para Estadísticas
  const state = !prev ? 'new' : prev.interval === 0 ? (prev.lapses ? 'relearning' : 'learning') : 'review';
  const ev = { id: api.newId(), user_id: S.uid, card_id: id, deck_id: card?.deck_id || null, ts: new Date(now).toISOString(), grade: g, state, ivl: next.interval, last_ivl: prev?.interval || 0, ease: Math.round(next.ease * 1000) / 1000, ms, t: now };
  S.events.push(ev);
  const { t: _t, ...evRow } = ev;
  api.addEvent(evRow).catch(() => {});
  S.progress.set(id, next);
  S.log[day] = (S.log[day] || 0) + 1;
  api.saveProgress(S.uid, id, next).catch(fail);
  // El servidor suma 1 y devuelve el total del día, que incluye lo estudiado en otros dispositivos
  api.bumpLog(S.uid, day, 1, S.log[day]).then(n => { if (n > (S.log[day] || 0)) S.log[day] = n; }).catch(() => {});
  saveSnapSoon();
  return { prev, next, ev, day };
}
export function grade(g) {
  const ses = S.session;
  if (!ses || !ses.revealed || !ses.queue.length) return;
  stopSpeaking();
  document.querySelector('.swipe-hints')?.remove();
  const id = ses.queue[0];
  const now = Date.now();
  const ms = Math.min(120e3, Math.max(0, now - (ses.shownAt || now)));
  const queue = ses.queue.slice(), done = ses.done, answered = ses.answered ?? ses.done, tally = { ...ses.tally };
  const { prev, next, ev, day } = recordAnswer(id, g, ms, now);
  ses.undo = { id, prev, queue, done, answered, tally, day, evId: ev.id };
  ses.queue.shift();
  ses.answered = (ses.answered ?? ses.done) + 1;
  // Solo vuelven a salir en esta sesión las tarjetas en aprendizaje (falladas o «difícil» siendo nuevas)
  if (next.interval === 0 && next.due > now) ses.queue.splice(Math.min(ses.queue.length, g === 1 ? 3 : 6), 0, id);
  else ses.done++;
  ses.tally[g]++;
  if (ENT_MODES.includes(cardModel(S.cards.get(id) || {}).tpl?.mode)) (ses.ent ||= []).push({ id, g });
  ses.revealed = false;
  ses.st = null;
  feedback(!ses.queue.length ? 'done' : g === 1 ? 'again' : 'ok', !ses.queue.length ? null : g);
  renderStudy();
}
export function undo() {
  const ses = S.session;
  if (!ses?.undo) return;
  const u = ses.undo;
  if (u.prev) { S.progress.set(u.id, u.prev); api.saveProgress(S.uid, u.id, u.prev).catch(fail); }
  else { S.progress.delete(u.id); api.clearProgress(S.uid, u.id).catch(fail); }
  S.log[u.day] = Math.max(0, (S.log[u.day] || 0) - 1);
  api.bumpLog(S.uid, u.day, -1, S.log[u.day]).catch(() => {});
  if (u.evId) { S.events = S.events.filter(e => e.id !== u.evId); api.deleteEvent(u.evId).catch(() => {}); }
  Object.assign(ses, { queue: u.queue, done: u.done, answered: u.answered, tally: u.tally, revealed: true, undo: null, st: null });
  saveSnapSoon();
  renderStudy();
}
