// Flaski · apuntes: ayuda «Formato y atajos» (sale de apuntes.js)
import { icon } from '../icons.js';
import { STATUS } from '../pages.js';
import { $, S, esc } from '../comun.js';
import { openSheet } from './editor.js';
import { fold } from './apuntes.js';
import { SUG_HOW } from './sugerencias.js';

// Formato y atajos de los apuntes: todo lo que se puede escribir y hacer, con ejemplos
/* ---------- Ayuda de los apuntes: «Formato y atajos» ---------- */
// Pestañas (lo básico, formato, bloques, teclado, tarjetas) y un buscador que filtra entre todo.
// Las teclas se escriben como en el teclado de cada uno: Ctrl/Alt en Windows, ⌘/⌥ en Mac.
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent);
export function kb(spec) {
  const name = k => (IS_MAC ? { Ctrl: '⌘', Alt: '⌥', Mayús: '⇧' }[k] || k : k);
  return spec.split(' o ').map(alt => `<span class="kc">${alt.split('+').map(k => `<kbd>${esc(name(k.trim()))}</kbd>`).join(' + ')}</span>`).join(' o ');
}
const HELP_TABS = [['basico', 'Lo básico'], ['formato', 'Formato'], ['bloques', 'Bloques'], ['teclado', 'Teclado'], ['preguntas', 'Preguntas']];
function helpContent() {
  const c = s => `<code>${esc(s)}</code>`;
  // Una fila: lo de la izquierda (lo que se escribe, una tecla…), qué hace y, si hay, su atajo
  const row = (left, what, extra = '') => `<tr class="help-item"><td>${left}</td><td>${what}</td>${extra !== null ? `<td class="help-key">${extra}</td>` : ''}</tr>`;
  const table = (head, rows) => `<table class="help-tbl"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
  const two = (head, rows) => table(head, rows.map(([l, w]) => row(l, w, null)));
  const step = (ic, title, text) => `<li class="help-item help-step"><span class="help-ic" aria-hidden="true">${ic}</span><span><b>${title}</b><br>${text}</span></li>`;
  const sec = (id, title, body) => `<section class="help-sec" data-help-sec="${id}"><h3 class="help-h">${title}</h3>${body}</section>`;
  return {
    basico: sec('basico', 'Empezar en un minuto', `<ol class="help-steps">
      ${step(icon('pencil', { size: 16 }), 'Escribe', 'Toca cualquier parte del apunte y escribe. Se guarda solo: arriba verás «Guardado».')}
      ${step(icon('plus', { size: 16 }), 'Un bloque por idea', `Cada párrafo, título o punto es un <b>bloque</b>. ${kb('Enter')} crea el siguiente.`)}
      ${step('/', 'Elige el tipo de bloque', `Escribe ${c('/')} en una línea vacía (o pulsa «+ Bloque») y elige: título, viñetas, casilla, tabla, imagen…`)}
      ${step('<b>B</b>', 'Da formato', 'Selecciona un texto y usa la barra que aparece: negrita, cursiva, subrayado, color…')}
      ${step(icon('grip-vertical', { size: 16 }), 'Mueve y organiza', 'El asa ⋮⋮ a la izquierda de cada bloque: arrástrala para moverlo o tócala para ver sus opciones. En el móvil aparece en el bloque que estás editando.')}
      ${step(icon('notebook-text', { size: 16 }), 'Convierte en preguntas', 'Selecciona lo importante y pulsa <b>Crear pregunta</b>, o deja que <b>Sugerir preguntas</b> te proponga las suyas.')}
      ${step(icon('undo-2', { size: 16 }), 'Deshaz lo que sea', `${kb('Ctrl+Z')} o la flecha de arriba deshacen cualquier cambio del apunte, también borrar o mover bloques.`)}
      ${step(icon('search', { size: 16 }), 'Encuentra', `${kb('Ctrl+F')} o la lupa buscan en el apunte. Con dos títulos o más tienes también un <b>índice</b>.`)}
    </ol>`),
    formato: sec('formato', 'Formato del texto', `<p class="hint">Usa la barra que aparece al seleccionar texto, o escribe las marcas tú mismo (se guarda en Markdown). Mientras el cursor está dentro de un texto con formato verás sus marcas; al salir, solo el formato.</p>
      ${table(['Escribe', 'Se ve', 'Atajo'], [
        row(c('**negrita**'), '<b>negrita</b>', kb('Ctrl+B')),
        row(c('*cursiva*'), '<i>cursiva</i>', kb('Ctrl+I')),
        row(c('<u>subrayado</u>'), '<u>subrayado</u>', kb('Ctrl+U')),
        row(c('~~tachado~~'), '<s>tachado</s>', kb('Ctrl+Mayús+S')),
        row(c('`código`'), '<code>código</code>', kb('Ctrl+E')),
        row(c('==resaltado=='), '<mark class="hl hl-yellow">resaltado</mark>', kb('Ctrl+Mayús+H')),
        row(c('<span style="color:red">…</span>'), '<span class="tc tc-red">Texto en color</span>', 'Barra → <b>A</b>'),
        row(c('<mark style="background:blue">…</mark>'), '<mark class="hl hl-blue">Fondo de color</mark>', 'Barra → <b>A</b>'),
        row(c('[texto](https://…)'), '<a href="#" class="help-link">texto</a> (abre la web)', ''),
        row(c('[[Otro apunte]]'), '<a href="#" class="wl">Otro apunte</a> (abre ese apunte)', kb('[[')),
        row(c('漢字[かんじ]'), 'Furigana: <ruby>漢字<rt>かんじ</rt></ruby>', ''),
        row(c('\\*'), 'Un asterisco tal cual (sin formato)', ''),
      ])}
      <p class="hint">Sin texto seleccionado, un atajo da formato a la palabra donde está el cursor. Pulsar otra vez el mismo botón lo quita.</p>
      <h4 class="help-sub">Al escribir</h4>
      ${two(['Escribe', 'Pasa'], [
        [c('(  [  {  "  «'), 'Se cierran solos; si escribes el cierre, se salta el que ya estaba.'],
        ['Texto seleccionado + ' + c('*  _  ~  =  `  (  [  "'), 'Envuelve lo seleccionado: <code>palabra</code> → <code>*palabra*</code>'],
        [c('[['), 'Muestra tus apuntes para enlazar uno. Si escribes un título que no existe, se crea al abrir el enlace.'],
      ])}`),
    bloques: sec('bloques', 'Tipos de bloque', `<p class="hint">Escribe esto al principio de una línea vacía, o elige el tipo con ${c('/')} o «+ Bloque». Para cambiar el tipo de un bloque que ya existe, tócale el asa ⋮⋮ → <b>Convertir en</b>.</p>
      ${two(['Escribe', 'Para'], [
        [c('# '), 'Título'], [c('## '), 'Subtítulo'], [c('### '), 'Título pequeño'],
        [c('- ') + ' o ' + c('* '), 'Viñetas'], [c('1. '), 'Numeración'],
        [c('[] ') + ' o ' + c('[x] '), 'Casilla (vacía o ya marcada)'], [c('> '), 'Cita'], [c('```'), 'Código (se escribe tal cual)'], [c('---'), 'Separador'],
        [c('/'), 'Todos los tipos: también <b>destacado</b> (con icono), <b>tabla</b> e <b>imagen</b>'],
      ])}
      <h4 class="help-sub">Organizar</h4>
      ${two(['Con', 'Puedes'], [
        ['Asa ⋮⋮', 'Arrastrar el bloque a otro sitio. Con un toque: convertir, duplicar, mover, sangría, plegar o borrar.'],
        [kb('Tab'), 'Meter un punto dentro del de arriba (sangría), en viñetas, numeración, casillas y párrafos. ' + kb('Mayús+Tab') + ' lo saca.'],
        ['Flecha junto a un título', 'Plegar o desplegar todo lo que cuelga de él. Se queda así guardado.'],
        [kb('Esc'), 'Seleccionar el bloque. Con ' + kb('Mayús') + ' + clic, o arrastrando el ratón por varios, seleccionas más: puedes moverlos, convertirlos, copiarlos o borrarlos a la vez.'],
        ['Índice', 'Con dos títulos o más: a la derecha en pantallas grandes, o con el botón ' + icon('list', { size: 14 }) + ' de arriba.'],
        ['«Enlazado desde»', 'Al pie del apunte, los otros apuntes que lo enlazan con ' + c('[[ ]]') + '. Si cambias el título, sus enlaces se actualizan solos.'],
      ])}
      <h4 class="help-sub">Tablas</h4>
      <p class="hint">Crea una con «+ Bloque» → <b>Tabla</b> (o ${c('/tabla')}), y escribe en cada celda: las celdas crecen con el texto. Toca una tabla para editarla y <b>Listo</b> (o ${kb('Esc')}) para terminar.</p>
      ${two(['Con', 'Puedes'], [
        [kb('Tab') + ' / ' + kb('Mayús+Tab'), 'Ir a la celda siguiente o a la anterior (en la última, crea una fila)'],
        [kb('Enter'), 'Bajar a la fila de abajo (en la última, crea otra)'],
        [kb('↑') + ' ' + kb('↓') + ' ' + kb('←') + ' ' + kb('→'), 'Moverte entre celdas (← → al llegar al borde del texto)'],
        [kb('Ctrl+Enter'), 'Salir de la tabla y seguir escribiendo debajo'],
        ['<b>+</b> abajo o a la derecha', 'Añadir una fila o una columna al final'],
        ['Asa ⋮⋮ de la fila', 'Insertar arriba o debajo, duplicar, mover o borrar la fila'],
        ['Botón ⋯ de la columna', 'Alinear (izquierda, centro, derecha), insertar a un lado, mover, <b>ordenar</b> de la A a la Z (o al revés) o borrar la columna'],
        ['Pegar', 'Celdas copiadas de Excel, Google Sheets o Numbers: se rellenan desde la celda donde estás y la tabla crece si hace falta'],
      ])}
      <p class="hint">Si prefieres escribirla como texto (<b>Como texto</b>): la segunda línea separa la cabecera, y ${c(':---')} alinea a la izquierda, ${c(':---:')} al centro y ${c('---:')} a la derecha.</p>
      <pre class="help-pre">| Caso     | Sufijo | Ejemplo |
| :------- | :----: | ------: |
| Locativo |  -de   |    evde |</pre>
      <h4 class="help-sub">Imágenes</h4>
      <p class="hint">Pega una imagen (${kb('Ctrl+V')}), arrástrala al apunte o elige <b>Imagen</b> con ${c('/')}. Debajo puedes escribirle un pie.</p>
      <h4 class="help-sub">Traer y llevar apuntes</h4>
      ${two(['Desde', 'Pasa'], [
        ['Word, Google Docs, Notion, una web…', 'Al pegar se conservan los títulos, viñetas, tablas, negritas, colores y enlaces, cada cosa en su bloque.'],
        ['Texto en Markdown', 'Al pegarlo, cada línea se convierte en su bloque (títulos, viñetas, tablas…).'],
        ['Un archivo', 'Menú ⋯ del apunte → <b>Importar…</b>: <b>PDF</b> (con sus tablas; las páginas escaneadas, como imágenes), <b>Word</b> (.docx, con formato e imágenes), <b>Markdown</b>, <b>HTML</b> o <b>CSV</b> (como tabla). Se añade al final del apunte.'],
        ['Muchos a la vez', 'En Biblioteca, en Apuntes → <b>Importar</b>: un apunte nuevo por archivo. También un <b>.zip</b> exportado de Notion u Obsidian (con sus imágenes).'],
        ['Hacia otra app', 'Menú ⋯ → <b>Exportar…</b>: <b>Word</b>, <b>PDF</b> (desde la ventana de imprimir), <b>Markdown</b> (con sus imágenes) o <b>página web</b>. O <b>Copiar como texto</b>.'],
        ['Todos tus apuntes', 'En Biblioteca, en Apuntes → <b>Exportar</b>: un .zip con todos en Markdown, por carpetas y con sus imágenes.'],
      ])}`),
    teclado: sec('teclado', 'Atajos de teclado', `<h4 class="help-sub">Al escribir</h4>
      ${two(['Tecla', 'Hace'], [
        [kb('Enter'), 'Bloque nuevo. En viñetas o numeración, otro punto; en un punto vacío, se acaban (o sube un nivel).'],
        [kb('Mayús+Enter'), 'Salto de línea dentro del mismo bloque'],
        [kb('Retroceso'), 'Al principio de un bloque: quita la sangría, lo vuelve párrafo o lo junta con el de arriba'],
        [kb('↑') + ' ' + kb('↓'), 'Al principio o al final de un bloque: pasa al anterior o al siguiente'],
        [kb('Tab') + ' / ' + kb('Mayús+Tab'), 'Sangría: meter o sacar un nivel'],
        [kb('Ctrl+Enter'), 'En una tabla o un código: sale de él y crea un bloque debajo'],
        [kb('Esc'), 'Deja de escribir y selecciona el bloque (otro ' + kb('Esc') + ' quita la selección)'],
      ])}
      <h4 class="help-sub">Formato</h4>
      ${two(['Tecla', 'Hace'], [
        [kb('Ctrl+B'), 'Negrita'], [kb('Ctrl+I'), 'Cursiva'], [kb('Ctrl+U'), 'Subrayado'], [kb('Ctrl+Mayús+S'), 'Tachado'],
        [kb('Ctrl+E'), 'Código'], [kb('Ctrl+Mayús+H'), 'Resaltar en amarillo'],
      ])}
      <h4 class="help-sub">Bloques</h4>
      ${two(['Tecla', 'Hace'], [
        [kb('Alt+↑') + ' ' + kb('Alt+↓'), 'Mover el bloque (o los seleccionados) arriba o abajo'],
        [kb('Ctrl+D'), 'Duplicar'],
        [kb('Mayús') + ' + clic', 'Seleccionar desde el bloque actual hasta el que tocas'],
        [kb('Mayús+↑') + ' ' + kb('Mayús+↓'), 'Con bloques seleccionados: seleccionar más'],
        [kb('Ctrl+A'), 'Todo el bloque; pulsado otra vez, todos los bloques'],
        [kb('Supr') + ' o ' + kb('Retroceso'), 'Con bloques seleccionados: borrarlos'],
        [kb('Ctrl+C') + ' ' + kb('Ctrl+X'), 'Con bloques seleccionados: copiarlos o cortarlos (al pegarlos vuelven a ser los mismos bloques)'],
        [kb('Enter'), 'Con un bloque seleccionado: volver a escribir en él'],
      ])}
      <h4 class="help-sub">El apunte</h4>
      ${two(['Tecla', 'Hace'], [
        [kb('Ctrl+Z'), 'Deshacer (cualquier cambio del apunte)'],
        [kb('Ctrl+Mayús+Z') + ' o ' + kb('Ctrl+Y'), 'Rehacer'],
        [kb('Ctrl+F'), 'Buscar en el apunte (sin importar mayúsculas ni tildes). ' + kb('Enter') + ' / ' + kb('Mayús+Enter') + ': siguiente / anterior'],
        [kb('Ctrl+H'), 'Buscar y reemplazar'],
      ])}`),
    preguntas: sec('preguntas', 'Preguntas desde los apuntes', `<ul class="help-list">
        <li class="help-item">Selecciona un trozo de texto y pulsa <b>Crear pregunta</b> (lo seleccionado será la respuesta) o <b>Hueco</b> (el bloque entero con eso oculto: ${c('Ev{{de}}yim')}).</li>
        <li class="help-item"><b>Sugerir preguntas</b> (arriba) propone preguntas a partir de cómo está escrito el apunte. Las revisas, retocas o descartas, y creas las que quieras. Si cambias el apunte, ${icon('refresh-cw', { size: 13 })} las actualiza sin perder lo retocado.</li>
        <li class="help-item">Una ${icon('sugerencia', { size: 13 })} junto a un bloque indica que de ahí sale alguna pregunta (aparece mientras escribes). Tócala para ver las de esa parte.</li>
        <li class="help-item">Cada pregunta queda unida a su parte del apunte. Al estudiarla, <b>Ver en los apuntes</b> te trae justo ahí.</li>
        <li class="help-item">Arriba, en <b>Lista</b>, eliges dónde van las preguntas de este apunte.</li>
        <li class="help-item">El número a la derecha de un bloque es cuántas preguntas salen de él; tócalo para verlas.</li>
      </ul>
      <h4 class="help-sub">Escribir para que salgan solas</h4>
      ${two(['Si escribes', 'Sale'], SUG_HOW)}
      <h4 class="help-sub">Cómo llevas cada parte</h4>
      <ul class="help-list help-st">${STATUS.map(s => `<li class="help-item"><span class="st-chip st-${s.id}"><i aria-hidden="true"></i>${s.label}</span> ${{ ok: 'las has repasado y aún no toca', due: 'toca repasar alguna', weak: 'has fallado alguna hace poco o muchas veces', new: 'hay alguna que aún no has estudiado' }[s.id]}</li>`).join('')}</ul>
      <p class="hint">En cada título, <b>Estudiar</b> repasa solo ese apartado (el título y lo que cuelga de él). Arriba, <b>Estudiar este apunte</b> los repasa todos.</p>`),
  };
}
export function notesHelpSheet() {
  const tab = S.helpTab || 'basico', body = helpContent();
  openSheet(`<div class="help">
    <h2>Formato y atajos</h2>
    <div class="help-search">${icon('search', { size: 16 })}<input id="helpQ" type="text" placeholder="Buscar: negrita, mover, tabla, deshacer…" aria-label="Buscar en la ayuda" autocomplete="off"></div>
    <div class="help-tabs" role="tablist" aria-label="Apartados">${HELP_TABS.map(([id, label]) => `<button type="button" role="tab" data-help-tab="${id}" aria-selected="${id === tab}">${label}</button>`).join('')}</div>
    <div class="help-body" id="helpBody">${HELP_TABS.map(([id]) => body[id].replace('class="help-sec"', `class="help-sec"${id === tab ? '' : ' hidden'}`)).join('')}
      <p class="muted help-none" hidden>Nada coincide con la búsqueda.</p></div>
    <div class="btnrow"><span class="spacer"></span><button class="primary" data-act="close-sheet">Entendido</button></div></div>`);
}
export function showHelpTab(id) {
  S.helpTab = id;
  const q = $('#helpQ');
  if (q) q.value = '';
  filterHelp('');
  document.querySelectorAll('[data-help-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.helpTab === id)));
  document.querySelectorAll('[data-help-sec]').forEach(s => { s.hidden = s.dataset.helpSec !== id; });
  $('#helpBody')?.scrollTo?.(0, 0);
}
// Buscar: se ven todos los apartados, solo con lo que coincide
function filterHelp(q) {
  const f = fold(q.trim());
  document.querySelectorAll('[data-help-sec]').forEach(sec => {
    if (!f) { sec.hidden = sec.dataset.helpSec !== (S.helpTab || 'basico'); sec.querySelectorAll('.help-item, .hint, .help-sub, .help-pre, table').forEach(x => { x.hidden = false; }); return; }
    let any = false;
    sec.querySelectorAll('.help-item, .hint').forEach(it => { const ok = fold(it.textContent).includes(f); it.hidden = !ok; any ||= ok; });
    sec.querySelectorAll('table').forEach(t => { t.hidden = ![...t.querySelectorAll('.help-item')].some(x => !x.hidden); });
    sec.querySelectorAll('.help-pre').forEach(x => { x.hidden = true; });
    // Cada subapartado, solo si tiene algo que coincide debajo
    sec.querySelectorAll('.help-sub').forEach(x => { const n = x.nextElementSibling; x.hidden = !n || n.hidden || (n.matches('table, ul, ol') && ![...n.querySelectorAll('.help-item')].some(i => !i.hidden)); });
    sec.hidden = !any;
  });
  document.querySelector('.help-tabs')?.classList.toggle('is-search', !!f);
  const none = document.querySelector('.help-none');
  if (none) none.hidden = !f || [...document.querySelectorAll('[data-help-sec]')].some(s => !s.hidden);
}
document.addEventListener('input', e => { if (e.target.id === 'helpQ') filterHelp(e.target.value); });
