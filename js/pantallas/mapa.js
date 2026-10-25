// Flaski · Mapa de lo que sabes: casillas de una lista, carpeta o tema, su ficha, «elegir varias» y «Se te resisten»
import { icon } from '../icons.js';
import { decksInFolder } from '../org.js';
import { fmtWhen } from '../srs.js';
import { stripRuby } from '../cardtypes.js';
import { groupCards, cardMapState, cellState, artRange, citedArticles } from '../mapa.js';
import { $, S, esc, plain, cardList } from '../comun.js';
import { plural } from './mazos.js';
import { getType, typeIcon, startSession, shortInfo } from './estudio.js';
import { openSheet, closeSheet } from './editor.js';

export const STATES = [['sabes', 'Lo sabes'], ['medias', 'A medias'], ['resiste', 'Se te resiste'], ['new', 'Sin empezar']];
const LABEL = Object.fromEntries(STATES);
const HELP = {
  art: 'Cada casilla es un artículo. Dentro van todas las preguntas que lo citan, aunque estén en apuntes distintos.',
  idea: 'Cada casilla es una idea: un apartado de tus apuntes. Junta todas sus preguntas, así que solo está verde si lo sabes todo.',
  note: 'Cada casilla es una palabra con todas sus preguntas.',
  card: 'Cada casilla es una pregunta.',
};

// Las preguntas de un ámbito: una lista (id), una carpeta («folder:id», con sus subcarpetas) o un tema («page:id»)
function scopeCards(scope) {
  if (scope.startsWith('page:')) { const id = scope.slice(5); return cardList().filter(c => c.page_id === id); }
  if (scope.startsWith('folder:')) {
    const ids = new Set(decksInFolder(S.decks, S.folders, scope.slice(7)).filter(d => !d.archived).map(d => d.id));
    return cardList().filter(c => ids.has(c.deck_id));
  }
  return cardList().filter(c => c.deck_id === scope);
}
// Las respuestas de cada pregunta, de la más antigua a la más reciente
function eventsBy(ids) {
  const want = new Set(ids), m = new Map();
  for (const e of S.events) if (want.has(e.card_id)) { if (!m.has(e.card_id)) m.set(e.card_id, []); m.get(e.card_id).push(e); }
  for (const l of m.values()) l.sort((a, b) => (a.t ?? Date.parse(a.ts)) - (b.t ?? Date.parse(b.ts)));
  return m;
}
const evTime = e => e.t ?? Date.parse(e.ts);
// El campo principal de cada nota (la palabra en Vocabulario y en Sustantivo alemán, el kanji en Kanji) y la sección por tipo
// (los tipos propios de una lista importada, por cómo se preguntan: ordenar o dictado son frases)
function kindOf(c) {
  const t = getType(c.type_id), modes = new Set((t?.templates || []).map(x => x.mode));
  if (c.type_id === 'kanji') return 'Kanji';
  if (['vocab', 'de-noun'].includes(c.type_id) || /vocabulario/i.test(t?.name || '')) return 'Palabras';
  if (['order', 'listen', 'cloze', 'clozechoice'].some(m => modes.has(m))) return 'Frases';
  return 'Otras';
}
const GROUP = {
  label: c => { const t = getType(c.type_id), id = t?.templates[0]?.front[0]; return id ? c.fields?.[id] || '' : ''; },
  kind: kindOf,
};
// { model, cells: Map key → casilla con estado, total } o null si no hay mapa
export function mapModel(scope) {
  const cards = scopeCards(scope);
  const model = groupCards(cards, S.pages, GROUP);
  if (!model) return null;
  const now = Date.now(), evs = eventsBy(cards.map(c => c.id)), cells = new Map();
  const cardState = new Map(cards.map(c => [c.id, cardMapState(S.progress.get(c.id), evs.get(c.id) || [], now)]));
  for (const s of model.sections) for (const cell of s.cells) {
    cell.state = cellState(cell.ids.map(id => cardState.get(id)));
    cell.events = cell.ids.flatMap(id => evs.get(id) || []).sort((a, b) => evTime(a) - evTime(b));
    cells.set(cell.key, cell);
  }
  return { ...model, cells, cardState, total: cards.length };
}
export const hasMap = scope => !!groupCards(scopeCards(scope), S.pages, GROUP);
export const mapOn = scope => S.mapView === scope;

// «Lista | Mapa» (o «Apunte | Mapa», «Apuntes | Mapa»)
export function mapSeg(scope, left) {
  const on = mapOn(scope);
  return `<div class="seg mp-seg" role="group" aria-label="Vista"><button type="button" class="seg-b" data-map-view="" data-scope="${esc(scope)}" aria-pressed="${!on}">${esc(left)}</button><button type="button" class="seg-b" data-map-view="map" data-scope="${esc(scope)}" aria-pressed="${on}">${icon('layout-grid', { size: 16 })} Mapa</button></div>`;
}
export function setMapView(scope, on) {
  S.mapView = on ? scope : null;
  S.mapSel = null;
}

// «fallada ayer», «fallada 3 veces»: lo que más ayuda a saber por qué se resiste
const DAY = 864e5;
export function failNote(cell) {
  const fails = cell.events.filter(e => e.grade === 1);
  if (!fails.length) return '';
  const last5 = cell.events.slice(-5).filter(e => e.grade === 1).length;
  if (last5 >= 3) return `fallada ${last5} veces`;
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(evTime(fails[fails.length - 1])).setHours(0, 0, 0, 0)) / DAY);
  return days <= 0 ? 'fallada hoy' : days === 1 ? 'fallada ayer' : `fallada hace ${days} días`;
}
// A la derecha de «Se te resisten»: el artículo con su título, o el significado (sin repetir la casilla)
function rName(m, cell) {
  if (m.mode === 'art') return cellName(m, cell);
  if (m.mode === 'idea') return '';
  const c = S.cards.get(cell.ids[0]), sis = c?.note_id ? cell.ids.map(id => S.cards.get(id)).filter(Boolean) : [c];
  const first = sis.find(x => x?.template === 't1') || c;
  const back = first ? qText(first.back) : '';
  return back && back !== cell.label ? back : '';
}
const artName = cell => `${cell.law && cell.law !== 'Constitución' ? cell.law + ' ' : 'Art. '}${cell.n}`;
const cellName = (m, cell) => (m.mode === 'art' && cell.n != null ? `${artName(cell)}${cell.title ? ` · ${cell.title}` : ''}` : cell.label);
const cellBtn = (cell, sel) => `<button type="button" class="mp-cell st-${cell.state}${cell.n != null ? ' mp-num' : ''}" data-map-cell="${esc(cell.key)}" aria-pressed="${sel.has(cell.key)}" title="${esc(LABEL[cell.state])} · ${plural(cell.ids.length, 'pregunta', 'preguntas')}">${esc(cell.label)}${cell.ids.length > 1 && cell.n == null && cell.key.startsWith('i|') ? `<small>${cell.ids.length}</small>` : ''}</button>`;
// Bajo el nombre de una sección de artículos, cuáles son («arts. 1–9»)
const sectionNote = (m, s) => (m.mode === 'art' && !s.loose ? artRange(s.cells) : '');

export function mapHTML(scope) {
  const m = mapModel(scope);
  if (!m) return '<p class="muted">Aquí las preguntas son largas y sueltas: no hay mapa.</p>';
  const sel = S.mapSel?.scope === scope ? S.mapSel.keys : new Set();
  const cells = [...m.cells.values()], n = Object.fromEntries(STATES.map(([k]) => [k, cells.filter(c => c.state === k).length]));
  const resist = cells.filter(c => c.state === 'resiste'), resistN = resistIds(m).length;
  // «10 artículos · 35 preguntas» (sin contar «Sin artículo»); con una casilla por pregunta, solo «20 preguntas»
  const counted = m.mode === 'art' ? m.sections.filter(s => !s.loose).flatMap(s => s.cells) : cells;
  const unit = m.mode === 'art' ? ['artículo', 'artículos'] : m.mode === 'idea' ? ['idea', 'ideas'] : m.mode === 'note' && m.sections.length === 1 ? ['palabra', 'palabras'] : ['casilla', 'casillas'];
  const meta = m.mode === 'card' ? plural(m.total, 'pregunta', 'preguntas') : `${plural(counted.length, unit[0], unit[1])} · ${plural(m.total, 'pregunta', 'preguntas')}`;
  const touch = matchMedia('(hover: none)').matches;
  const sections = m.sections.map(s => `<section class="mp-sec">${s.name || sectionNote(m, s) ? `<div class="mp-sh"><h3>${esc(s.name)}</h3><span>${esc(s.loose ? (m.mode === 'art' ? 'preguntas que no citan ninguno' : '') : sectionNote(m, s))}</span></div>` : ''}
      <div class="mp-cells">${s.cells.map(c => cellBtn(c, sel)).join('')}</div></section>`).join('');
  const side = `<aside class="mp-side">
      <div class="mp-how"><h3>Cómo lo llevas</h3>
        <span class="mp-bar" role="img" aria-label="${STATES.map(([k, l]) => `${n[k]} ${l.toLowerCase()}`).join(', ')}">${STATES.map(([k]) => (n[k] ? `<i class="st-${k}" style="flex:${n[k]}"></i>` : '')).join('')}</span>
        <p>${STATES.filter(([k]) => n[k]).map(([k, l]) => `${n[k]} ${l.toLowerCase()}`).join(' · ')}</p>
        ${resistN ? `<button type="button" class="primary mp-resist" data-act="map-resist" data-scope="${esc(scope)}">Practicar lo que se resiste · ${resistN}</button>` : ''}</div>
      ${resist.length ? `<h3 class="mp-rh">Se te resisten</h3><ul class="mp-rlist">${resist.map(c => `<li><button type="button" class="mp-rrow" data-map-cell="${esc(c.key)}"><span class="mp-cell st-resiste${c.n != null ? ' mp-num' : ''}">${esc(c.label)}</span>
        <span class="mp-rt">${rName(m, c) ? `<b>${esc(rName(m, c))}</b>` : ''}<small>${[plural(c.ids.length, 'pregunta', 'preguntas'), failNote(c)].filter(Boolean).join(' · ')}</small></span></button></li>`).join('')}</ul>` : ''}
    </aside>`;
  return `<div class="mp-c"><div class="mp" data-map-scope="${esc(scope)}">
    <div class="mp-main">
      <p class="mp-help">${icon('layout-grid', { size: 18 })}<span>${HELP[m.mode]}</span></p>
      <p class="mp-meta">${meta}</p>
      <ul class="mp-key">${STATES.map(([k, l]) => `<li><i class="st-${k}" aria-hidden="true"></i>${l}</li>`).join('')}</ul>
      ${sections}
      <p class="mp-hint">${touch ? 'Toca una casilla para verla · mantén pulsado para elegir varias' : 'Haz clic en una casilla para verla · Ctrl + clic (o mantén pulsado) para elegir varias'}</p>
    </div>${side}
    <div class="mp-selbar" id="mpBar" ${sel.size ? '' : 'hidden'}>${selBarInner(m, sel)}</div>
  </div></div>`;
}
// «3 elegidas · 5 preguntas · 2 min · Hacer una tanda»
function selBarInner(m, sel) {
  const ids = [...new Set([...sel].flatMap(k => m.cells.get(k)?.ids || []))];
  const min = Math.max(1, Math.round(ids.length * shortInfo().secs / 60));
  return `<button type="button" class="mp-selx" data-act="map-sel-clear" aria-label="Dejar de elegir">${icon('x', { size: 18 })}</button>
    <span class="mp-selt"><b>${sel.size === 1 ? '1 elegida' : `${sel.size} elegidas`}</b><small>${plural(ids.length, 'pregunta', 'preguntas')}<span class="mp-min"> · ${min} min</span></small></span>
    <button type="button" class="mp-selgo" data-act="map-sel-go">Hacer una tanda</button>`;
}
function drawSel() {
  const box = document.querySelector('.mp'), scope = box?.dataset.mapScope;
  if (!box) return;
  const sel = S.mapSel?.scope === scope ? S.mapSel.keys : new Set();
  for (const b of box.querySelectorAll('.mp-cells [data-map-cell]')) b.setAttribute('aria-pressed', sel.has(b.dataset.mapCell));
  const bar = $('#mpBar');
  bar.hidden = !sel.size;
  if (sel.size) bar.innerHTML = selBarInner(mapModel(scope), sel);
  box.classList.toggle('is-selecting', !!sel.size);
}
function toggleSel(scope, key) {
  if (S.mapSel?.scope !== scope) S.mapSel = { scope, keys: new Set() };
  const k = S.mapSel.keys;
  if (k.has(key)) k.delete(key); else k.add(key);
  if (!k.size) S.mapSel = null;
  closePop();
  drawSel();
}
export function clearMapSel() { S.mapSel = null; drawSel(); }

// Practicar unas preguntas ya (cuenta como un repaso normal); al salir se vuelve al mapa
function practice(scope, ids) {
  if (!ids.length) return;
  closeSheet();
  closePop();
  S.mapSel = null;
  startSession(scope, { ids });
}
export function practiceSel() {
  const scope = S.mapSel?.scope, m = scope && mapModel(scope);
  if (!m) return;
  practice(scope, [...new Set([...S.mapSel.keys].flatMap(k => m.cells.get(k)?.ids || []))]);
}
// Lo que sale en «Practicar lo que se resiste»: de las casillas que se resisten, sus preguntas que no sabes (sin repetir)
export const resistIds = m => [...new Set([...m.cells.values()].filter(c => c.state === 'resiste').flatMap(c => c.ids.filter(id => m.cardState.get(id) !== 'sabes')))];
export function practiceResist(scope) {
  const m = mapModel(scope);
  if (m) practice(scope, resistIds(m));
}
export function practiceCell(scope, key) {
  const cell = mapModel(scope)?.cells.get(key);
  if (cell) practice(scope, cell.ids);
}

// Tocar una casilla: su ficha (hoja abajo en el móvil, aviso junto a la casilla en el ordenador).
// Eligiendo varias (o con Ctrl/⌘), la marca o la quita.
export function cellClick(btn, e) {
  const scope = btn.closest('[data-map-scope]')?.dataset.mapScope, key = btn.dataset.mapCell;
  if (!scope) return;
  if (pressed.fired) { pressed.fired = false; return; }
  if (btn.closest('.mp-cells') && (S.mapSel?.scope === scope || e.ctrlKey || e.metaKey || e.shiftKey)) return toggleSel(scope, key);
  const m = mapModel(scope), cell = m?.cells.get(key);
  if (!cell) return;
  if (matchMedia('(min-width: 900px) and (hover: hover)').matches && btn.closest('.mp-cells')) return showPop(m, cell, btn, scope);
  openSheet(fichaHTML(m, cell, scope));
}
// El texto de una pregunta en una línea: «fuego · ひ · カ», sin furigana
const qText = s => stripRuby(plain(s)).split(/\n+/).map(x => x.trim()).filter(Boolean).join(' · ').slice(0, 90);
// Un kanji suelto (o dos caracteres CJK) va grande, con el significado al lado
const bigCJK = s => /^[㐀-䶿一-鿿豈-﫿々]{1,2}$/.test(s);
const DOTS = evs => `<span class="mp-dots">${evs.slice(-7).map(e => `<i class="g${e.grade}" title="${['', 'Otra vez', 'Difícil', 'Bien', 'Fácil'][e.grade]}"></i>`).join('')}</span>`;
// El bloque de la primera pregunta de la casilla (en un artículo, mejor uno cuyo apartado lo cite)
function linkOf(cell) {
  const linked = cell.ids.map(id => S.cards.get(id)).filter(c => c?.page_id && S.pages.has(c.page_id));
  if (cell.n == null) return linked[0];
  const own = linked.find(c => { const bl = S.pages.get(c.page_id).blocks, i = bl.findIndex(b => b.id === c.block_id);
    for (let k = i; k >= 0; k--) if (/^h[123]$/.test(bl[k].type)) return citedArticles(bl[k].text).some(a => a.n === cell.n);
    return false; });
  return own || linked[0];
}
function fichaHTML(m, cell, scope) {
  const now = Date.now(), endToday = new Date().setHours(24, 0, 0, 0);
  const first = S.cards.get(cell.ids[0]), sub = m.mode === 'note' ? plain(first?.back || '') : cell.title || '';
  const title = m.mode === 'art' && cell.n != null ? artName(cell) : cellName(m, cell);
  const rows = cell.ids.map(id => S.cards.get(id)).filter(Boolean).map(c => {
    const t = getType(c.type_id) || getType('basic'), tpl = t.templates.length > 1 ? t.templates.find(x => x.id === c.template)?.name : '';
    const p = S.progress.get(c.id), when = !p ? 'nueva' : p.due < endToday ? 'vuelve hoy' : `dentro de ${fmtWhen(p.due, now)}`;
    return `<li><button type="button" class="mp-q" data-card="${c.id}"><span class="mp-qi" aria-hidden="true">${typeIcon(t, 18)}</span><span class="mp-qt"><b>${esc(qText(c.front))}</b><small>${esc(tpl || t.name)}</small></span>
      <span class="mp-qw st-${m.cardState.get(c.id)}"><i aria-hidden="true"></i>${when}</span></button></li>`;
  }).join('');
  const link = linkOf(cell);
  return `<div class="mp-ficha" data-map-scope="${esc(scope)}">
    <div class="mp-fh"><h2 class="mp-ft${bigCJK(title) ? ' is-cjk' : ''}">${esc(title)}${bigCJK(title) && sub ? `<span class="mp-fmean">${esc(sub)}</span>` : ''}</h2><span class="mp-pill st-${cell.state}">${LABEL[cell.state]}</span></div>
    ${sub && sub !== title && !bigCJK(title) ? `<p class="mp-fsub">${esc(sub)}</p>` : ''}
    ${cell.events.length ? `<p class="mp-fk">Tus últimas ${Math.min(7, cell.events.length)} respuestas · la más reciente a la derecha</p>${DOTS(cell.events)}` : '<p class="mp-fk">Aún no la has practicado.</p>'}
    ${failNote(cell) ? `<p class="mp-fail">${esc(failNote(cell).replace(/^f/, 'F'))}.</p>` : ''}
    <h3 class="mp-fq">${cell.ids.length === 1 ? 'Su pregunta' : `Sus ${cell.ids.length} preguntas`}</h3>
    <ul class="mp-qs">${rows}</ul>
    <div class="mp-fgo"><button type="button" class="primary big" data-act="map-practice" data-key="${esc(cell.key)}">Practicar · ${cell.ids.length}</button>
      ${link ? `<button type="button" class="ghost big mp-fpage" data-open-page="${link.page_id}" data-open-block="${esc(link.block_id || '')}" aria-label="Ver en el apunte" title="Ver en el apunte">${icon('notebook-text', { size: 20 })}</button>` : ''}
      <button type="button" class="ghost big mp-fedit" data-card="${cell.ids[0]}" aria-label="Editar" title="Editar la pregunta">${icon('pencil', { size: 20 })}</button></div>
  </div>`;
}
// En el ordenador, un aviso junto a la casilla
function showPop(m, cell, btn, scope) {
  closePop();
  const pop = document.createElement('div');
  pop.className = 'mp-pop';
  pop.id = 'mpPop';
  pop.dataset.mapScope = scope;
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', cellName(m, cell));
  const link = linkOf(cell);
  pop.innerHTML = `<b>${esc(cellName(m, cell))}</b><small>${[plural(cell.ids.length, 'pregunta', 'preguntas'), LABEL[cell.state].toLowerCase(), failNote(cell)].filter(Boolean).join(' · ')}</small>
    ${cell.events.length ? DOTS(cell.events) : ''}
    <span class="mp-popl"><button type="button" class="link" data-act="map-practice" data-key="${esc(cell.key)}">Practicar solo esta</button>
    ${link ? `<button type="button" class="link" data-open-page="${link.page_id}" data-open-block="${esc(link.block_id || '')}">Ver en el apunte</button>` : ''}
    <button type="button" class="link" data-act="map-ficha" data-key="${esc(cell.key)}">Sus preguntas</button></span>`;
  btn.closest('.mp-main').append(pop);
  const r = btn.getBoundingClientRect(), box = btn.closest('.mp-main').getBoundingClientRect();
  pop.style.left = `${Math.max(0, Math.min(r.left - box.left, box.width - pop.offsetWidth))}px`;
  pop.style.top = `${r.bottom - box.top + 6}px`;
  btn.classList.add('is-open');
}
export function closePop() {
  $('#mpPop')?.remove();
  document.querySelector('.mp-cell.is-open')?.classList.remove('is-open');
}
export function openFicha(scope, key) {
  const m = mapModel(scope), cell = m?.cells.get(key);
  closePop();
  if (cell) openSheet(fichaHTML(m, cell, scope));
}

// Mantener pulsada una casilla: empieza a elegir varias
const pressed = { timer: 0, fired: false, x: 0, y: 0 };
document.addEventListener('pointerdown', e => {
  const b = e.target.closest?.('.mp-cells [data-map-cell]');
  if (!b) return;
  pressed.fired = false; pressed.x = e.clientX; pressed.y = e.clientY;
  clearTimeout(pressed.timer);
  pressed.timer = setTimeout(() => {
    pressed.fired = true;
    navigator.vibrate?.(10);
    toggleSel(b.closest('[data-map-scope]').dataset.mapScope, b.dataset.mapCell);
  }, 500);
});
const cancelPress = e => { if (e.type !== 'pointermove' || Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) > 8) clearTimeout(pressed.timer); };
for (const t of ['pointerup', 'pointercancel', 'pointermove', 'scroll']) document.addEventListener(t, cancelPress, { passive: true, capture: t === 'scroll' });
document.addEventListener('contextmenu', e => { if (e.target.closest?.('.mp-cells [data-map-cell]')) e.preventDefault(); });
// Fuera del aviso, se cierra
document.addEventListener('pointerdown', e => { if ($('#mpPop') && !e.target.closest?.('#mpPop, [data-map-cell]')) closePop(); });
