// Flaski · caras de las tarjetas y sesión de estudio (sale de app.js)
import * as api from '../api.js';
import { schedule, fmtWhen, dateKey, GRADES } from '../srs.js';
import { shares, allocate } from '../plan.js';
import { icon } from '../icons.js';
import { BUILTIN_TYPES, LANGS, CLOZE_RE, NEEDS_ANSWER, stripRuby, isCJK, orderTokens, orderJoin, legacyFields, choiceOptions, resolveType, parsePairs, parseMasks, imageIdIn, parseGroups, clozeAnswer } from '../cardtypes.js';
import { speak, stopSpeaking, ttsAvailable } from '../tts.js';
import { charsOf, canQuiz, startQuiz, startCanvas, animateChars } from '../handwriting.js';
import { buzz, swipeable, chime } from '../feel.js';
import { $, main, S, esc, imgHTML, fmt, cardList, toast, fail, deckIcon, tagChips, scopeTest, scopeName, deckName, reviewsLeft, algo, capNote, counts, planNodes, newPlan } from '../comun.js';
import { saveSnapSoon } from './cuenta.js';
import { plural } from './mazos.js';
import { seg, numIn } from './perfil.js';
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
    out += fmt(text.slice(last, at));
    out += reveal ? `<span class="blank on">${fmt(ans)}</span>` : `<span class="blank">${hint ? esc(hint) : '…'}</span>`;
    last = at + m.length;
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
  const block = (id, main) => {
    const v = val(id);
    if (!v.trim()) return '';
    const label = !main && fdef(id) ? `<div class="fld-l">${esc(fdef(id).name)}</div>` : '';
    return `<div class="fld ${main ? 'fld-main' : 'fld-sub'}">${label}<div class="fld-v"><span class="fld-t">${fmt(v)}</span>${say(id)}${strokesBtn(id)}</div></div>`;
  };
  // Botón «orden de trazos» en campos cortos con kanji/hanzi
  const strokesBtn = id => {
    if (preview || !/^(ja|zh)/.test(fdef(id)?.lang || '')) return '';
    const chars = [...stripRuby(val(id))].filter(isCJK);
    return chars.length && chars.length <= 6 ? `<button type="button" class="say" data-strokes="${id}" aria-label="Ver orden de trazos" title="Orden de trazos">${BRUSH_ICON}</button>` : '';
  };

  // Anverso
  let front;
  if (tpl.mode === 'occlusion') front = occlusionHTML(val(tpl.image), val(tpl.answer), tpl.mask, st.revealed) + tpl.front.map(id => block(id, false)).join('');
  else if (tpl.mode === 'match' && !val(tpl.front[0]).trim()) front = `<div class="fld fld-main"><div class="fld-v"><span class="fld-t">Une cada elemento con su pareja</span></div></div>`;
  else if (tpl.mode === 'clozechoice') front = `<div class="fld fld-main fld-cloze"><div class="fld-v"><span class="fld-t">${clozeHTML(val(tpl.answer), st.revealed)}</span>${st.revealed ? say(tpl.answer) : ''}</div></div>`;
  else if (tpl.mode === 'cloze') front = `<div class="fld fld-main fld-cloze"><div class="fld-v"><span class="fld-t">${clozeHTML(val(tpl.front[0]), st.revealed)}</span>${say(tpl.front[0])}</div></div>`;
  else front = tpl.front.map((id, i) => block(id, i === 0)).join('');
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
        <input id="typed" ${lang ? `lang="${lang}"` : ''} autocapitalize="off" autocorrect="off" spellcheck="false"  placeholder="${tpl.mode === 'listen' ? 'Escribe lo que oyes' : `Escribe: ${esc(fdef(tpl.answer)?.name || 'la respuesta')}`}" aria-label="Tu respuesta" ${preview ? 'disabled' : ''}>
        <button class="primary" type="${preview ? 'button' : 'submit'}" ${preview ? 'disabled' : ''}>Comprobar</button></${preview ? 'div' : 'form'}>
        ${preview || !charsFor(lang).length ? '' : `<div class="chars chars-study" role="group" aria-label="Letras especiales">${charsFor(lang).map(ch => `<button type="button" data-char="${ch}">${ch}</button>`).join('')}</div>`}`;
    } else if (st.typed) {
      const r = st.typed;
      ask = r.ok ? `<div class="verdict ok">${icon('check', { size: 16 })} Correcto: <b>${esc(r.expected)}</b></div>`
        : `<div class="verdict bad">${r.near ? `<div class="vnear">Casi: ${esc(r.why)}</div>` : ''}<div class="vrow"><span class="vl">Tu respuesta</span><span class="diff">${r.diff.filter(x => x.t !== 'miss').map(x => `<span class="d-${x.t}">${esc(x.c)}</span>`).join('') || '<i>(vacía)</i>'}</span></div>
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

  // Respuesta
  let answer = '';
  if (st.revealed) {
    if (tpl.mode === 'flip') answer = tpl.back.map((id, i) => block(id, i === 0)).join('');
    else if (['cloze', 'choice', 'match', 'occlusion', 'conj', 'sort', 'clozechoice', 'number'].includes(tpl.mode)) answer = tpl.back.map(id => block(id, false)).join('');
    else {
      // type · listen · order · draw: la respuesta principal solo se repite si no la has resuelto ya arriba
      const resolved = tpl.mode === 'order' ? !!st.order?.checked : tpl.mode === 'draw' ? !!st.drawn && !st.drawn.gaveUp && !!st.drawn.img : !!st.typed;
      const rest = tpl.back.filter(x => x !== tpl.answer).map(id => block(id, false)).join('');
      const sayAgain = fdef(tpl.answer)?.lang ? `<div class="fld"><div class="fld-v">${say(tpl.answer)}${strokesBtn(tpl.answer)}</div></div>` : '';
      answer = (resolved ? sayAgain : tpl.mode === 'order' ? `<div class="fld fld-main"><div class="fld-v"><span class="fld-t">${fmt(orderJoin(orderTokens(val(tpl.answer)), val(tpl.answer)))}</span>${say(tpl.answer)}</div></div>` : block(tpl.answer, true)) + rest;
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
/* ---------- Dictado y escritura a mano ---------- */
export function playListen(model, rate = 1) {
  const f = model.type.fields.find(x => x.id === model.tpl.answer);
  if (f?.lang) speak(model.fields[model.tpl.answer], f.lang, { rate: rate * 0.95 });
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
  openSheet(`<h2>Orden de trazos</h2><p class="muted small">${esc(chars.join(''))} · se repite en bucle</p>
    <div class="hw-anim-row" id="hwAnim"><div class="spin" aria-label="Cargando"></div></div>
    <p class="hint">Trazos: Hanzi Writer (David Chanin) con datos de animCJK y Make Me A Hanzi. La primera vez necesita conexión.</p>
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
function buildSession(scope) {
  const P = S.prefs.study, inScope = scopeTest(scope), now = Date.now();
  const pool = cardList().filter(inScope);
  let dueCards = pool.filter(c => { const p = S.progress.get(c.id); return p && p.due <= now; })
    .sort((a, b) => S.progress.get(a.id).due - S.progress.get(b.id).due);
  // Con tope de repasos: el tope se reparte según el foco de cada mazo (de cada uno, las más atrasadas)
  const cap = reviewsLeft();
  if (dueCards.length > cap) {
    const byDeck = new Map();
    for (const c of dueCards) byDeck.set(c.deck_id, (byDeck.get(c.deck_id) || 0) + 1);
    const sh = shares(S.decks, S.folders, planNodes(), d => byDeck.has(d.id));
    for (const id of byDeck.keys()) if (!sh.has(id)) sh.set(id, 1);
    const q = allocate(cap, sh, byDeck), used = new Map();
    dueCards = dueCards.filter(c => { const u = used.get(c.deck_id) || 0; if (u >= (q.get(c.deck_id) || 0)) return false; used.set(c.deck_id, u + 1); return true; });
  }
  const due = dueCards.map(c => c.id);
  let fresh = pool.filter(c => !S.progress.get(c.id)).sort((a, b) => a.position - b.position);
  if (P.newOrder === 'random') shuffle(fresh);
  // Cuántas de cada mazo: el plan de estudio (solo mazos activos, según el foco y los exámenes).
  // Tarjetas hermanas (misma nota): solo una nueva por sesión, para no ver la respuesta en la otra;
  // se descartan antes de contar, para que no gasten hueco.
  const quota = newPlan(scope), seenNotes = new Set(), perDeck = new Map();
  const byDeck = new Map();
  for (const c of fresh) {
    const used = perDeck.get(c.deck_id) || 0;
    if (used >= (quota.get(c.deck_id) || 0)) continue;
    if (P.burySiblings && c.note_id) { if (seenNotes.has(c.note_id)) continue; seenNotes.add(c.note_id); }
    perDeck.set(c.deck_id, used + 1);
    if (!byDeck.has(c.deck_id)) byDeck.set(c.deck_id, []);
    byDeck.get(c.deck_id).push(c.id);
  }
  // Intercaladas: una de cada mazo por turno
  fresh = [];
  const lists = [...byDeck.values()];
  for (let k = 0; lists.some(l => k < l.length); k++) for (const l of lists) if (k < l.length) fresh.push(l[k]);
  if (P.mix === 'reviewsFirst') return [...due, ...fresh];
  if (P.mix === 'newFirst') return [...fresh, ...due];
  const q = []; let i = 0, j = 0;
  while (i < due.length || j < fresh.length) {
    for (let k = 0; k < 3 && i < due.length; k++) q.push(due[i++]);
    if (j < fresh.length) q.push(fresh[j++]);
  }
  return q;
}
// La barra de la sesión: un segmento por tarjeta (las hechas, en blanco); con muchas, una barra continua
function segBar(ses) {
  const total = ses.done + ses.queue.length, pct = Math.round(100 * ses.done / Math.max(1, total));
  if (total > 60 || total < 2) return `<div class="bar"><span style="width:${pct}%"></span></div>`;
  return `<div class="bar bar-seg" style="--n:${total}" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${ses.done}">${Array.from({ length: total }, (_, i) => `<i${i < ses.done ? ' class="on"' : ''}></i>`).join('')}</div>`;
}
export function startSession(scope = 'all') {
  const queue = buildSession(scope);
  if (!queue.length) { toast('No hay preguntas pendientes aquí'); return; }
  S.session = { scope, queue, done: 0, revealed: false, tally: { 1: 0, 2: 0, 3: 0, 4: 0 }, undo: null, st: null };
  go('study');
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
export function renderStudy() {
  const ses = S.session;
  if (!ses) return go('home');
  const pct = Math.round(100 * ses.done / Math.max(1, ses.done + ses.queue.length));
  // Arriba: salir (un círculo), de qué es la sesión y cuántas quedan; debajo, la barra de progreso
  const bar = `<div class="studybar"><button class="sb-back" data-act="exit" aria-label="Salir de la sesión">${icon('chevron-left', { size: 18 })}</button><span class="sb-info"><span class="where">${esc(scopeName(ses.scope))}</span><span class="left">${ses.queue.length} quedan</span></span></div>${segBar(ses)}`;
  if (!ses.queue.length) {
    const t = ses.tally;
    main.innerHTML = `${bar}<div class="done"><h2>¡Tanda terminada!</h2><p class="muted">Has repasado ${ses.done} preguntas.</p>${capNote(counts(ses.scope))}
      <div class="tally"><span class="g1">Otra vez ${t[1]}</span><span class="g2">Difícil ${t[2]}</span><span class="g3">Bien ${t[3]}</span><span class="g4">Fácil ${t[4]}</span></div>
      <div class="btnrow" style="justify-content:center"><button class="primary" data-act="exit">${ses.scope.startsWith('page:') ? 'Volver a los apuntes' : 'Volver al inicio'}</button><button class="ghost" data-act="more">10 nuevas más</button></div>
      ${ses.undo ? '<button class="link" data-act="undo">Deshacer la última</button>' : ''}</div>`;
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
    const suggest = st.typed ? (st.typed.ok ? 3 : st.typed.near ? 2 : 1)
      : st.choice && st.choice.picked >= 0 ? (st.choice.opts[st.choice.picked] === st.choice.correct ? 3 : 1)
      : st.order?.checked ? (st.order.ok ? 3 : 1)
      : st.sort?.checked ? (() => { const bad = st.sort.items.filter(it => st.sort.place[it.i] !== it.g).length; return bad === 0 ? 3 : bad === 1 ? 2 : 1; })()
      : st.number ? (st.number.ok ? 3 : st.number.near ? 2 : 1)
      : st.conj ? (st.conj.every(x => x.ok) ? 3 : st.conj.every(x => x.ok || x.near) ? 2 : 1)
      : st.match && !st.match.gaveUp ? (st.match.wrong === 0 ? 3 : st.match.wrong === 1 ? 2 : 1)
      : st.match?.gaveUp ? 1
      : d && !d.img && !d.gaveUp ? (() => { const avg = d.mistakes / Math.max(1, d.n); return avg === 0 && !d.peeked ? 3 : avg <= 2 && !(d.peeked && avg > 0) ? 2 : 1; })()
      : d?.gaveUp ? 1 : 0;
    const P = S.prefs.study, A = algo(c.deck_id);
    const gs = P.buttons === 2 ? GRADES.filter(x => x.g === 1 || x.g === 3) : GRADES;
    foot = `<div class="grades${gs.length === 2 ? ' two' : ''}">${gs.map(({ g, label }) => `<button class="grade g${g}${P.suggest && g === suggest ? ' suggested' : ''}" data-grade="${g}">${label}${P.showIntervals ? `<small>${fmtWhen(schedule(p, g, now, A).due, now)}</small>` : ''}</button>`).join('')}</div>`;
  } else if (NEEDS_ANSWER.includes(model.tpl.mode)) {
    foot = '<button class="ghost big" data-act="reveal">No lo sé, ver respuesta</button>';
  } else {
    foot = '<button class="primary big" data-act="reveal">Mostrar respuesta</button>';
  }
  const tags = (c.tags || []).length ? `<span class="tags">${tagChips(c.tags)}</span>` : '';
  main.innerHTML = `${bar}<article class="card mode-${model.tpl.mode}" aria-live="polite">
      <div class="card-top"><span class="chip">${S.decks.get(c.deck_id) ? deckIcon(S.decks.get(c.deck_id)) : ''}${esc(deckName(c.deck_id))}${p ? '' : ' · nueva'}</span>${tags}</div>
      <div class="front">${front}</div>${hint}${ask}
      ${answer ? `<div class="answer">${answer}</div>` : ''}
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
  // Móvil: con la respuesta a la vista, deslizar la tarjeta valora (izquierda «Otra vez», derecha «Bien», arriba «Fácil»)
  if (ses.revealed && S.prefs.study.swipe) {
    const two = S.prefs.study.buttons === 2;
    const map = { left: 1, right: 3, up: 4 };
    swipeable(main.querySelector('article.card'), {
      dirs: { left: 'Otra vez', right: 'Bien', up: two ? null : 'Fácil' },
      onCross: () => haptic('tick'),
      onSwipe: d => grade(map[d]),
    });
  }
}
// Sensación táctil y sonora, si están activadas en Ajustes
const GRADE_SOUNDS = { 1: 'again', 2: 'hard', 3: 'good', 4: 'easy' };
function feedback(kind, g = null) {
  if (S.prefs.study.haptics) buzz(kind);
  if (S.prefs.study.sound) chime(g ? (GRADE_SOUNDS[g] || kind) : kind);
}
function haptic(kind) { feedback(kind); }
export function reveal() {
  const ses = S.session;
  if (!ses || ses.revealed) return;
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
export function grade(g) {
  const ses = S.session;
  if (!ses || !ses.revealed || !ses.queue.length) return;
  stopSpeaking();
  const id = ses.queue[0];
  const now = Date.now();
  const prev = S.progress.get(id) || null;
  const card = S.cards.get(id);
  const next = schedule(prev, g, now, algo(card?.deck_id));
  const day = dateKey(now);
  // Registro de cada respuesta, para Estadísticas
  const state = !prev ? 'new' : prev.interval === 0 ? (prev.lapses ? 'relearning' : 'learning') : 'review';
  const ms = Math.min(120e3, Math.max(0, now - (ses.shownAt || now)));
  const ev = { id: api.newId(), user_id: S.uid, card_id: id, deck_id: card?.deck_id || null, ts: new Date(now).toISOString(), grade: g, state, ivl: next.interval, last_ivl: prev?.interval || 0, ease: Math.round(next.ease * 1000) / 1000, ms, t: now };
  S.events.push(ev);
  const { t: _t, ...evRow } = ev;
  api.addEvent(evRow).catch(() => {});
  ses.undo = { id, prev, queue: ses.queue.slice(), done: ses.done, tally: { ...ses.tally }, day, evId: ev.id };
  ses.queue.shift();
  // Solo vuelven a salir en esta sesión las tarjetas en aprendizaje (falladas o «difícil» siendo nuevas)
  if (next.interval === 0 && next.due > now) ses.queue.splice(Math.min(ses.queue.length, g === 1 ? 3 : 6), 0, id);
  else ses.done++;
  ses.tally[g]++;
  ses.revealed = false;
  ses.st = null;
  S.progress.set(id, next);
  S.log[day] = (S.log[day] || 0) + 1;
  api.saveProgress(S.uid, id, next).catch(fail);
  // El servidor suma 1 y devuelve el total del día, que incluye lo estudiado en otros dispositivos
  api.bumpLog(S.uid, day, 1, S.log[day]).then(n => { if (n > (S.log[day] || 0)) S.log[day] = n; }).catch(() => {});
  saveSnapSoon();
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
  Object.assign(ses, { queue: u.queue, done: u.done, tally: u.tally, revealed: true, undo: null, st: null });
  saveSnapSoon();
  renderStudy();
}
