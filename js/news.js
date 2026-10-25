// Novedades: una pantalla con lo nuevo de la última versión. Ahora, el vídeo «Así es Flaski» (img/novedades).
// Usa el mismo marco que la presentación de bienvenida.
// No sabe nada del estado de la app: recibe lo que necesita y avisa con onClose().
import { icon } from './icons.js';

// Cambia NEWS_VERSION en cada versión con novedades: a quien no las haya visto se le enseñan al entrar
export const NEWS_VERSION = '2026-10-video';
// true: salen siempre (para revisarlas); false: una sola vez por versión
export const NEWS_ALWAYS = false;

const VIDEO = 'img/novedades/flaski-asi-es.mp4', POSTER = 'img/novedades/flaski-asi-es.jpg';
// ¿Hay novedades que enseñar?
export const hasNews = () => true;

// opts: { online: boolean, onClose() }. El vídeo empieza solo al tocar «Reproducir» (un gesto: así iOS deja que
// suene); al acabar, «¡A probarlo!» cierra. Se cierre como se cierre (Cerrar, Escape o «¡A probarlo!»), el vídeo se para
export function openNews(opts = {}) {
  if (document.querySelector('.ob')) return;
  const online = opts.online ?? navigator.onLine;
  const root = document.createElement('div');
  root.className = 'ob news';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'newsT');
  root.tabIndex = -1;
  root.innerHTML = `
    <div class="ob-top"><span></span><button type="button" class="link ob-skip" data-news-close>Cerrar</button></div>
    <div class="ob-body news-video">
      <div class="news-head"><h1 id="newsT">Así es Flaski</h1><p>Todo lo que puedes hacer, de un vistazo</p></div>
      <div class="news-frame">
        <video playsinline preload="none" poster="${POSTER}" aria-label="Vídeo: así es Flaski">${online ? `<source src="${VIDEO}" type="video/mp4">` : ''}</video>
        ${online ? `<button type="button" class="news-play" data-news-play aria-label="Reproducir">${icon('play', { size: 30 })}<span>Reproducir</span></button>`
          : '<p class="news-off" role="status">Necesitas conexión para ver el vídeo</p>'}
      </div>
    </div>
    <div class="ob-nav news-nav"></div>`;
  document.body.appendChild(root);
  document.body.classList.add('ob-open');
  const video = root.querySelector('video'), nav = root.querySelector('.news-nav');
  root.focus({ preventScroll: true });

  function play() {
    root.querySelector('[data-news-play]')?.remove();
    video.controls = true;
    video.muted = false;
    video.play().catch(() => { /* sin conexión o sin permiso: quedan los controles del vídeo */ });
    video.focus({ preventScroll: true });
  }
  video.addEventListener('ended', () => {
    if (nav.firstChild) return;
    nav.innerHTML = '<button type="button" class="primary" data-news-close>¡A probarlo!</button>';
    nav.querySelector('button').focus({ preventScroll: true });
  });
  function close() {
    removeEventListener('keydown', onKey, true);
    try { video.pause(); video.removeAttribute('src'); video.querySelector('source')?.remove(); video.load(); } catch { /* ya parado */ }
    root.remove();
    document.body.classList.remove('ob-open');
    opts.onClose?.();
  }
  // Escape cierra; el foco no sale de la pantalla mientras está abierta
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    const els = [...root.querySelectorAll('button, video[controls]')].filter(el => el.offsetParent !== null);
    if (!els.length) return;
    const first = els[0], last = els.at(-1);
    if (e.shiftKey && (document.activeElement === first || document.activeElement === root)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    else if (!root.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  }
  root.addEventListener('click', e => {
    e.stopPropagation();
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.newsPlay !== undefined) return play();
    if (b.dataset.newsClose !== undefined) return close();
  });
  addEventListener('keydown', onKey, true);
}
