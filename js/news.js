// Novedades: unas pantallas con lo nuevo de la última versión, con capturas de la app (img/novedades, se
// regeneran con «npm run capturas» en tests/). Usa el mismo diseño que la presentación de bienvenida.
// No sabe nada del estado de la app: recibe lo que necesita y avisa con onClose().
import { icon } from './icons.js';

// Cambia NEWS_VERSION en cada versión con novedades: a quien no las haya visto se le enseñan al entrar
export const NEWS_VERSION = '2026-10';
// true: salen siempre (para revisarlas); false: una sola vez por versión
export const NEWS_ALWAYS = false;

const SLIDES = [
  { id: 'intro' },
  { id: 'formato', title: 'Da formato a tus apuntes',
    text: 'Selecciona un texto para ponerlo en negrita, subrayarlo, tacharlo o darle color y fondo. Y lo que pegas de Word, Google Docs o una web llega con su formato.',
    alt: 'Unos apuntes con palabras en negrita y en color, y la barra de formato con los colores abierta' },
  { id: 'organizar', title: 'Ordena tus apuntes a tu manera',
    text: 'Arrastra cada bloque por su asa ⋮⋮ o tócala para convertirlo, duplicarlo o borrarlo. Selecciona varios a la vez, haz subpuntos con Tab, pliega apartados, enlaza apuntes con [[ ]], busca y reemplaza… y deshaz lo que sea con Ctrl+Z.',
    alt: 'El menú de un bloque de los apuntes con las opciones convertir en, duplicar, mover y borrar' },
  { id: 'tablas', title: 'Tablas mucho más fáciles',
    text: 'Escribe celda a celda, como en una hoja de cálculo. Añade filas y columnas con el «+», y desde el menú de cada columna ordénala, alinéala o muévela. Puedes pegar celdas de Excel o Google Sheets.',
    alt: 'Una tabla en edición con el menú de una columna abierto' },
  { id: 'sugerencias', title: 'Tarjetas sugeridas, sin IA',
    text: 'Flaski lee tus apuntes y te propone tarjetas: definiciones, lo que destacas, listas, tablas, fechas… Mientras escribes, una ✨ marca las partes de las que saldrá alguna tarjeta. Y si quieres que salgan más, unos consejos te dicen cómo escribir tus apuntes.',
    alt: 'La ventana de tarjetas sugeridas a partir de unos apuntes de biología' },
  { id: 'tipos', title: 'Ocho tipos de tarjeta nuevos',
    text: 'Emparejar, verdadero o falso, tapar partes de una imagen, conjugación, clasificar en grupos, hueco con opciones, ordenar los pasos y respuesta numérica.',
    alt: 'El selector de tipos de tarjeta con los tipos nuevos: verdadero o falso, clasificar, hueco con opciones, ordenar los pasos…' },
  { id: 'estudio', title: 'Repasa mejor y más a gusto',
    text: 'Un algoritmo nuevo (FSRS) calcula mejor cuándo volver a enseñarte cada tarjeta. En el móvil, desliza la tarjeta para valorarla, con vibración y sonidos (se quitan en Ajustes).',
    alt: 'Una tarjeta de estudio con su respuesta y los botones para valorarla' },
  { id: 'importar', title: 'Trae y lleva tus apuntes',
    text: 'Importa Word, PDF, Markdown, HTML, CSV o un .zip de Notion u Obsidian. Exporta cualquier apunte a Word, PDF, Markdown o página web, o todos de una vez.',
    alt: 'Las opciones para exportar un apunte: Word, PDF, Markdown y página web' },
  { id: 'letra', title: 'Más fácil de leer',
    text: 'Nueva tipografía, Atkinson Hyperlegible, pensada para leerse sin esfuerzo, y General Sans en los títulos. Y una ayuda de «Formato y atajos» nueva, con buscador, para tenerlo todo a mano.',
    alt: 'La ayuda de formato y atajos de los apuntes' },
];

// opts: { dark(): boolean, onClose() }
export function openNews(opts) {
  if (document.querySelector('.ob')) return;
  const root = document.createElement('div');
  root.className = 'ob news';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Novedades de Flaski');
  root.tabIndex = -1;
  document.body.appendChild(root);
  document.body.classList.add('ob-open');
  let i = 0;
  const last = SLIDES.length - 1;
  const img = id => `img/novedades/${id}-${opts.dark() ? 'dark' : 'light'}.jpg`;
  const intro = () => `
    <div class="ob-hero"><div class="ob-mark" aria-hidden="true">${icon('sparkles', { size: 32 })}</div>
      <h1>Novedades en Flaski</h1>
      <p class="ob-lead">Hemos mejorado mucho los apuntes y el estudio. Esto es lo más importante:</p>
      <ul class="ob-feats news-list">${SLIDES.slice(1).map((s, k) => `<li><button type="button" class="news-jump" data-ob-to="${k + 1}">${icon(['pencil', 'blocks', 'table', 'sparkles', 'layers', 'brain', 'download', 'book-open-check'][k], { size: 20 })}<span><b>${s.title}</b></span>${icon('chevron-right', { size: 16, cls: 'chev' })}</button></li>`).join('')}</ul></div>`;
  const shot = s => `
    <figure class="ob-shot"><div class="ob-phone"><img src="${img(s.id)}" alt="${s.alt}" width="390" height="760" decoding="async"></div></figure>
    <div class="ob-copy"><h2>${s.title}</h2><p>${s.text}</p></div>`;
  function draw() {
    const s = SLIDES[i];
    root.dataset.slide = s.id;
    root.innerHTML = `
      <div class="ob-top">
        <div class="ob-dots" role="tablist" aria-label="Pantallas">${SLIDES.map((x, k) => `<button type="button" role="tab" class="ob-dot" data-ob-to="${k}" aria-selected="${k === i}" aria-label="Pantalla ${k + 1} de ${SLIDES.length}"></button>`).join('')}</div>
        <button type="button" class="link ob-skip" data-news-close>Cerrar</button>
      </div>
      <div class="ob-body ob-${s.id === 'intro' ? 'welcome' : s.id}" aria-live="polite">${s.id === 'intro' ? intro() : shot(s)}</div>
      <div class="ob-nav">${i ? `<button type="button" class="ghost" data-ob-to="${i - 1}">Atrás</button>` : '<span></span>'}
        ${i < last ? `<button type="button" class="primary" data-ob-to="${i + 1}">${i ? 'Siguiente' : 'Ver las novedades'}</button>` : '<button type="button" class="primary" data-news-close>¡A probarlo!</button>'}</div>`;
    const next = SLIDES[i + 1];
    if (next?.title) { const pre = new Image(); pre.src = img(next.id); }
    root.focus({ preventScroll: true });
    root.scrollTop = 0;
  }
  const go = k => { i = Math.max(0, Math.min(last, k)); draw(); };
  function close() {
    removeEventListener('keydown', onKey, true);
    root.remove();
    document.body.classList.remove('ob-open');
    opts.onClose?.();
  }
  function onKey(e) {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(i + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(i - 1); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  }
  root.addEventListener('click', e => {
    e.stopPropagation();
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.obTo !== undefined) return go(Number(b.dataset.obTo));
    if (b.dataset.newsClose !== undefined) return close();
  });
  let x0 = null;
  root.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  root.addEventListener('touchend', e => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (Math.abs(dx) > 60) go(i + (dx < 0 ? 1 : -1));
  }, { passive: true });
  addEventListener('keydown', onKey, true);
  draw();
}
