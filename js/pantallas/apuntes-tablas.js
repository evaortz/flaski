// Flaski · apuntes: editor de tablas (sale de apuntes.js)
import { icon } from '../icons.js';
import { newBlock, parseTable, isTableText, tableToMarkdown, gridFromPaste } from '../pages.js';
import { $, S, esc, plain, toast } from '../comun.js';
import { autoGrow } from './editor.js';
import { pageCards, savePageSoon, blockHTML, curPage, repaint, redrawBlocks, editBlockRaw, moveCards } from './apuntes.js';
import { kb } from './apuntes-ayuda.js';

/* ---------- Editor de tablas: una cuadrícula en la que se escribe en cada celda ---------- */
// Por debajo se guarda en Markdown (b.text); «Editar como texto» sigue disponible para quien lo prefiera.
export const TBL_EMPTY = () => ({ head: ['', ''], align: ['', ''], rows: [['', ''], ['', '']] });
function tableModel(b) {
  const t = parseTable(b.text);
  if (t) return t;
  return String(b.text || '').trim() ? null : TBL_EMPTY();
}
function tableEditorHTML(b, t) {
  const n = t.head.length;
  const al = i => (t.align[i] ? ` style="text-align:${t.align[i]}"` : '');
  // Cada celda, un cuadro de texto que crece con lo escrito (y parte las líneas largas, como al verla)
  const cell = (v, r, c) => `<textarea class="tc" rows="1" data-r="${r}" data-c="${c}" aria-label="${r === 'h' ? `Cabecera, columna ${c + 1}` : `Fila ${+r + 1}, columna ${c + 1}`}"${al(c)} spellcheck="true" placeholder="${r === 'h' ? `Columna ${c + 1}` : ''}">${esc(v)}</textarea>`;
  // Como en una hoja de cálculo: el número de cada fila (y su menú) a la izquierda, y el menú de cada columna en su cabecera
  const rowBtn = (r, label, title) => `<button type="button" class="tbl-rown" data-tblmenu="row" data-r="${r}" title="${title}" aria-label="${title}">${label}</button>`;
  return `<div class="tbl-ed" data-table-ed="${b.id}">
    <div class="tbl-tools" role="toolbar" aria-label="Tabla">
      <button type="button" data-tbl="row-below" title="Añadir una fila debajo de la celda donde estás">${icon('plus', { size: 14 })} Fila</button>
      <button type="button" data-tbl="col-right" title="Añadir una columna a la derecha de la celda donde estás">${icon('plus', { size: 14 })} Columna</button>
      <span class="spacer"></span>
      <button type="button" data-tbl="raw" title="Escribir la tabla como texto (Markdown)" aria-label="Como texto">${icon('code', { size: 14 })} <span>Como texto</span></button>
      <button type="button" data-tbl="delete" class="danger" title="Quitar la tabla" aria-label="Quitar la tabla">${icon('trash-2', { size: 14 })}</button>
      <button type="button" data-tbl="done" class="tbl-done">Listo</button>
    </div>
    <div class="tbl-box">
      <div class="nb-tablewrap"><table class="nb-tbl tbl-grid">
        <thead><tr><th class="tbl-gut">${rowBtn('h', icon('ellipsis', { size: 13 }), 'Opciones de la cabecera')}</th>${t.head.map((v, c) => `<th><div class="tbl-hcell">${cell(v, 'h', c)}<button type="button" class="tbl-colbtn" data-tblmenu="col" data-c="${c}" title="Opciones de la columna ${c + 1}: alinear, ordenar, insertar, borrar…" aria-label="Opciones de la columna ${c + 1}">${icon('chevron-down', { size: 14 })}</button></div></th>`).join('')}</tr></thead>
        <tbody>${t.rows.map((r, ri) => `<tr><td class="tbl-gut">${rowBtn(ri, ri + 1, `Fila ${ri + 1}: insertar, mover, duplicar o borrar`)}</td>${Array.from({ length: n }, (_, c) => `<td>${cell(r[c] ?? '', ri, c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <button type="button" class="tbl-add tbl-addcol" data-tbl="col-end" title="Añadir una columna al final" aria-label="Añadir una columna al final">${icon('plus', { size: 14 })}</button>
    </div>
    <button type="button" class="tbl-add tbl-addrow" data-tbl="row-end" title="Añadir una fila al final">${icon('plus', { size: 14 })} Añadir fila</button>
    <p class="hint tbl-hint">Toca un número de fila o la flecha de una columna para ver sus opciones · ${kb('Tab')} celda siguiente · ${kb('Enter')} fila de abajo · Puedes pegar celdas de Excel o Google Sheets</p>
  </div>`;
}
// La fila y la columna de la celda donde se está, marcadas en el número de fila y en la cabecera
export function placeTblHandles(cellEl) {
  const ed = cellEl?.closest('[data-table-ed]'), inp = cellEl?.querySelector('.tc');
  if (!ed || !inp) return;
  ed.querySelectorAll('.tbl-rown.cur, .tbl-colbtn.cur').forEach(x => x.classList.remove('cur'));
  ed.querySelector(`.tbl-rown[data-r="${inp.dataset.r}"]`)?.classList.add('cur');
  ed.querySelector(`.tbl-colbtn[data-c="${inp.dataset.c}"]`)?.classList.add('cur');
}
// Menú de una fila o una columna
export function openTblMenu(btn) {
  const ed = btn.closest('[data-table-ed]'), kind = btn.dataset.tblmenu;
  const t = readGrid(ed, tblAlign.get(ed.dataset.tableEd));
  const r = kind === 'row' ? btn.dataset.r : (S.tblFocus?.r ?? 'h'), c = kind === 'col' ? +btn.dataset.c : (S.tblFocus?.c ?? 0);
  S.tblFocus = { r, c };
  S.tblMenu = { id: ed.dataset.tableEd, kind };
  const item = (act, ic, label, cls = '') => `<button type="button" role="menuitem" class="blk-item${cls}" data-tbl="${act}"><span class="blk-glyph" aria-hidden="true">${ic}</span><span class="blk-txt"><b>${label}</b></span></button>`;
  const al = tblAlign.get(ed.dataset.tableEd)?.[c] || '';
  const alignBtn = (v, label, glyph) => `<button type="button" role="menuitemradio" aria-checked="${(al === 'left' ? '' : al) === v}" class="ops-type" data-tbl="align-${v || 'left'}" title="${label}"><span aria-hidden="true">${glyph}</span><small>${label}</small></button>`;
  let el = $('#tblMenu');
  if (!el) { el = document.createElement('div'); el.id = 'tblMenu'; el.className = 'blk-menu blk-ops'; el.setAttribute('role', 'menu'); document.body.appendChild(el); }
  el.innerHTML = kind === 'col'
    ? `<p class="ops-h">Columna ${c + 1}${t.head[c] ? ` · ${esc(t.head[c])}` : ''}</p>
      <div class="ops-types ops-3">${alignBtn('', 'Izquierda', '⇤')}${alignBtn('center', 'Centro', '↔')}${alignBtn('right', 'Derecha', '⇥')}</div><div class="ops-sep"></div>
      ${item('col-left', '←', 'Insertar a la izquierda')}${item('col-right', '→', 'Insertar a la derecha')}
      ${item('col-mleft', icon('chevron-right', { size: 14 }).replace('<svg', '<svg style="transform:rotate(180deg)"'), 'Mover a la izquierda')}${item('col-mright', icon('chevron-right', { size: 14 }), 'Mover a la derecha')}
      ${t.rows.length > 1 ? `${item('sort-asc', 'A↓', 'Ordenar de la A a la Z')}${item('sort-desc', 'Z↓', 'Ordenar de la Z a la A')}` : ''}
      <div class="ops-sep"></div>${item('col-del', icon('trash-2', { size: 15 }), 'Borrar la columna', ' danger')}`
    : `<p class="ops-h">${r === 'h' ? 'Cabecera' : `Fila ${+r + 1}`}</p>
      ${r === 'h' ? '' : item('row-above', '↑', 'Insertar arriba')}${item('row-below', '↓', 'Insertar debajo')}
      ${r === 'h' ? '' : `${item('row-dup', icon('copy', { size: 15 }), 'Duplicar la fila')}${item('row-mup', icon('arrow-up', { size: 15 }), 'Mover arriba')}${item('row-mdown', icon('arrow-down', { size: 15 }), 'Mover abajo')}`}
      <div class="ops-sep"></div>${item('row-del', icon('trash-2', { size: 15 }), r === 'h' ? 'Borrar la cabecera (la primera fila pasa a serlo)' : 'Borrar la fila', ' danger')}`;
  el.hidden = false;
  const rr = btn.getBoundingClientRect(), w = Math.min(260, innerWidth - 16);
  el.style.width = w + 'px';
  const h = el.offsetHeight;
  el.style.left = `${Math.max(8, Math.min(rr.left, innerWidth - w - 8))}px`;
  el.style.top = `${rr.bottom + 4 + h < innerHeight ? rr.bottom + 4 : Math.max(8, rr.top - h - 4)}px`;
  // Se marcan la fila o la columna a las que se refiere
  ed.querySelectorAll('.tc').forEach(x => x.parentElement.classList.toggle(kind === 'col' ? 'is-col' : 'is-row', kind === 'col' ? +x.dataset.c === c : x.dataset.r === String(r)));
}
export function closeTblMenu() {
  if (!S.tblMenu) return;
  S.tblMenu = null;
  const el = $('#tblMenu');
  if (el) el.hidden = true;
  document.querySelectorAll('.tbl-grid .is-col, .tbl-grid .is-row').forEach(x => x.classList.remove('is-col', 'is-row'));
}
document.addEventListener('pointerdown', e => {
  if (e.target.closest?.('#tblMenu, .tbl-rown, .tbl-colbtn, .tbl-add')) { e.preventDefault(); return; }
  closeTblMenu();
});
export const tableEd = id => document.querySelector(`[data-table-ed="${id}"]`);
// La cuadrícula tal como está en pantalla → { head, align, rows }
function readGrid(ed, align) {
  const head = [], rows = [];
  ed.querySelectorAll('.tc').forEach(inp => {
    const r = inp.dataset.r, c = +inp.dataset.c;
    if (r === 'h') head[c] = inp.value; else { (rows[+r] ||= [])[c] = inp.value; }
  });
  return { head, align: head.map((_, i) => align?.[i] || ''), rows };
}
export let tblAlign = new Map();   // alineación de cada tabla mientras se edita
export function editTable(id, focus = null) {
  const p = curPage(), b = p?.blocks.find(x => x.id === id);
  const el = document.querySelector(`[data-block="${id}"] .nb-text`);
  if (!b || !el) return;
  const t = tableModel(b);
  if (!t) return editBlockRaw(id);   // texto que aún no es una tabla: como texto
  tblAlign.set(id, t.align);
  S.tblFocus = focus || S.tblFocus || { r: 'h', c: 0 };
  el.outerHTML = tableEditorHTML(b, t);
  tableEd(id).querySelectorAll('.tc').forEach(autoGrow);
  tblFocusCell(id, S.tblFocus);
}
function tblFocusCell(id, { r, c }) {
  const ed = tableEd(id);
  const inp = ed?.querySelector(`.tc[data-r="${r}"][data-c="${c}"]`) || ed?.querySelector('.tc');
  if (inp) { inp.focus(); inp.setSelectionRange?.(inp.value.length, inp.value.length); }
}
export function saveGrid(id) {
  const p = curPage(), b = p?.blocks.find(x => x.id === id), ed = tableEd(id);
  if (!b || !ed) return null;
  const t = readGrid(ed, tblAlign.get(id));
  const md = tableToMarkdown(t);
  if (md !== b.text) { b.text = md; savePageSoon(p); }
  return t;
}
// Cambiar la forma de la tabla (filas, columnas, alineación) y volver a pintarla
function reshapeTable(id, fn) {
  const t = saveGrid(id);
  if (!t) return;
  const f = { ...(S.tblFocus || { r: 'h', c: 0 }) };
  fn(t, f);
  tblAlign.set(id, t.align);
  const p = curPage(), b = p.blocks.find(x => x.id === id);
  b.text = tableToMarkdown(t); savePageSoon(p);
  repaint(() => { tableEd(id).outerHTML = tableEditorHTML(b, t); });
  tableEd(id).querySelectorAll('.tc').forEach(autoGrow);
  S.tblFocus = f;
  tblFocusCell(id, f);
}
export function tableAction(id, act) {
  const n = () => readGrid(tableEd(id)).head.length;
  closeTblMenu();
  const addCol = at => (t, f) => { const k = at(t, f); t.head.splice(k, 0, ''); t.align.splice(k, 0, ''); t.rows.forEach(r => r.splice(k, 0, '')); f.c = k; };
  const swap = (a, i, j) => { [a[i], a[j]] = [a[j], a[i]]; };
  if (act === 'row-add' || act === 'row-below') return reshapeTable(id, (t, f) => { const at = f.r === 'h' ? 0 : +f.r + 1; t.rows.splice(at, 0, Array(t.head.length).fill('')); f.r = at; });
  if (act === 'row-above') return reshapeTable(id, (t, f) => { const at = +f.r; t.rows.splice(at, 0, Array(t.head.length).fill('')); f.r = at; });
  if (act === 'row-end') return reshapeTable(id, (t, f) => { t.rows.push(Array(t.head.length).fill('')); f.r = t.rows.length - 1; f.c = 0; });
  if (act === 'row-dup') return reshapeTable(id, (t, f) => { t.rows.splice(+f.r + 1, 0, [...t.rows[+f.r]]); f.r = +f.r + 1; });
  if (act === 'row-mup' || act === 'row-mdown') return reshapeTable(id, (t, f) => {
    const i = +f.r, j = i + (act === 'row-mup' ? -1 : 1);
    if (j < 0 || j >= t.rows.length) return;
    swap(t.rows, i, j); f.r = j;
  });
  if (act === 'col-add' || act === 'col-right') return reshapeTable(id, addCol((t, f) => f.c + 1));
  if (act === 'col-left') return reshapeTable(id, addCol((t, f) => f.c));
  if (act === 'col-end') return reshapeTable(id, addCol(t => t.head.length));
  if (act === 'col-mleft' || act === 'col-mright') return reshapeTable(id, (t, f) => {
    const i = f.c, j = i + (act === 'col-mleft' ? -1 : 1);
    if (j < 0 || j >= t.head.length) return;
    [t.head, t.align, ...t.rows].forEach(a => swap(a, i, j)); f.c = j;
  });
  if (act.startsWith('align-')) return reshapeTable(id, (t, f) => { t.align[f.c] = act === 'align-left' ? '' : act.slice(6); });
  if (act === 'sort-asc' || act === 'sort-desc') return reshapeTable(id, (t, f) => {
    const k = f.c, dir = act === 'sort-asc' ? 1 : -1;
    // Las filas vacías, al final
    t.rows.sort((a, b) => (!plain(a[k] || '').trim()) - (!plain(b[k] || '').trim()) || dir * plain(a[k] || '').localeCompare(plain(b[k] || ''), 'es', { numeric: true, sensitivity: 'base' }));
  });
  if (act === 'row-del') return reshapeTable(id, (t, f) => {
    if (f.r === 'h') { if (!t.rows.length) return toast('La tabla necesita al menos la cabecera'); t.head = t.rows.shift(); f.r = 'h'; return; }
    t.rows.splice(+f.r, 1); f.r = t.rows.length ? Math.min(+f.r, t.rows.length - 1) : 'h';
  });
  if (act === 'col-del') {
    if (n() <= 1) return toast('La tabla necesita al menos una columna');
    return reshapeTable(id, (t, f) => { t.head.splice(f.c, 1); t.align.splice(f.c, 1); t.rows.forEach(r => r.splice(f.c, 1)); f.c = Math.min(f.c, t.head.length - 1); });
  }
  if (act === 'align') return reshapeTable(id, (t, f) => { const order = ['', 'center', 'right']; t.align[f.c] = order[(order.indexOf(t.align[f.c] === 'left' ? '' : t.align[f.c] || '') + 1) % 3]; });
  if (act === 'raw') { commitTable(id); return editBlockRaw(id); }
  if (act === 'done') return commitTable(id);
  if (act === 'delete') {
    const p = curPage(), i = p.blocks.findIndex(x => x.id === id);
    if (i < 0) return;
    const next = p.blocks[i + 1] || p.blocks[i - 1];
    if (next) moveCards(id, next.id);
    p.blocks.splice(i, 1);
    if (!p.blocks.length) p.blocks.push(newBlock());
    savePageSoon(p);
    redrawBlocks();
    return toast('Tabla quitada');
  }
}
// Terminar de editar: se guarda y se ve la tabla con formato
export function commitTable(id, redraw = true) {
  saveGrid(id);
  tblAlign.delete(id);
  const p = curPage(), b = p?.blocks.find(x => x.id === id), ed = tableEd(id);
  if (!b || !ed) return;
  if (redraw) repaint(() => { ed.closest('.nb').outerHTML = blockHTML(b, pageCards(p.id).get(b.id)); });
}
// Teclas dentro de una celda
export function tableKey(e) {
  const inp = e.target, ed = inp.closest('[data-table-ed]'), id = ed.dataset.tableEd;
  const r = inp.dataset.r, c = +inp.dataset.c, t = readGrid(ed), n = t.head.length, last = t.rows.length - 1;
  const go = (rr, cc) => { S.tblFocus = { r: rr, c: cc }; tblFocusCell(id, S.tblFocus); };
  const ri = r === 'h' ? -1 : +r;
  if (e.key === 'Tab') {
    e.preventDefault();
    if (e.shiftKey) { if (c > 0) return go(r, c - 1); if (ri >= 0) return go(ri === 0 ? 'h' : ri - 1, n - 1); return; }
    if (c < n - 1) return go(r, c + 1);
    if (ri < last) return go(ri + 1, 0);
    S.tblFocus = { r: ri, c };
    return reshapeTable(id, (tt, f) => { tt.rows.push(Array(n).fill('')); f.r = tt.rows.length - 1; f.c = 0; });
  }
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    // Salir de la tabla y seguir escribiendo debajo
    e.preventDefault();
    commitTable(id);
    const p = curPage(), i = p.blocks.findIndex(x => x.id === id), nb = newBlock();
    p.blocks.splice(i + 1, 0, nb); savePageSoon(p);
    return redrawBlocks(nb.id, 0);
  }
  if (e.key === 'Enter' && !e.isComposing) {
    e.preventDefault();
    if (ri < last) return go(ri + 1, c);
    S.tblFocus = { r: ri, c };
    return reshapeTable(id, (tt, f) => { tt.rows.push(Array(n).fill('')); f.r = tt.rows.length - 1; });
  }
  if (e.key === 'ArrowDown' && ri < last) { e.preventDefault(); return go(ri + 1, c); }
  // ← → en el borde del texto: a la celda de al lado
  const atStart = inp.selectionStart === 0 && inp.selectionEnd === 0, atEnd = inp.selectionStart === inp.value.length;
  if (e.key === 'ArrowLeft' && atStart && c > 0) { e.preventDefault(); return go(r, c - 1); }
  if (e.key === 'ArrowRight' && atEnd && c < n - 1) { e.preventDefault(); return go(r, c + 1); }
  if (e.key === 'ArrowUp' && ri >= 0) { e.preventDefault(); return go(ri === 0 ? 'h' : ri - 1, c); }
  if (e.key === 'Escape') { e.preventDefault(); if (S.tblMenu) return closeTblMenu(); return commitTable(id); }
}
// Pegar celdas de una hoja de cálculo: rellenan desde la celda actual y amplían la tabla si hace falta
export function tablePaste(e) {
  const inp = e.target, ed = inp.closest('[data-table-ed]'), id = ed.dataset.tableEd;
  const text = e.clipboardData?.getData('text/plain') || '';
  if (isTableText(text)) {
    e.preventDefault();
    const t = parseTable(text);
    S.tblFocus = { r: 'h', c: 0 };
    return reshapeTable(id, tt => Object.assign(tt, t));
  }
  const grid = gridFromPaste(text);
  if (!grid) return;
  e.preventDefault();
  const r0 = inp.dataset.r === 'h' ? -1 : +inp.dataset.r, c0 = +inp.dataset.c;
  S.tblFocus = { r: inp.dataset.r, c: c0 };
  reshapeTable(id, (t, f) => {
    const width = Math.max(t.head.length, c0 + Math.max(...grid.map(g => g.length)));
    while (t.head.length < width) { t.head.push(''); t.align.push(''); }
    t.rows.forEach(r => { while (r.length < width) r.push(''); });
    grid.forEach((g, k) => {
      const ri = r0 + k;
      const row = ri < 0 ? t.head : (t.rows[ri] ||= Array(width).fill(''));
      g.forEach((v, j) => { row[c0 + j] = v; });
    });
    for (let i = 0; i < t.rows.length; i++) t.rows[i] ||= Array(width).fill('');
    const lastR = r0 + grid.length - 1;
    f.r = lastR < 0 ? 'h' : lastR; f.c = c0 + grid.at(-1).length - 1;
  });
}
