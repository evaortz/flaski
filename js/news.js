// Novedades: la hoja con lo nuevo de la última versión. Arriba, el vídeo «Lo nuevo» (media/, sin sonido);
// debajo, lo mismo en texto para quien no lo vea. Con «reducir movimiento» no se reproduce solo.
// No sabe nada del estado de la app: recibe lo que necesita y avisa con onClose() y onTry().
import { icon } from './icons.js';

// Cambia NEWS_VERSION en cada versión con novedades: a quien no las haya visto se le enseñan al entrar
// (año-mes, y un número detrás si hay más de una en el mismo mes)
export const NEWS_VERSION = '2026-10-2';
// true: salen siempre (para revisarlas); false: una sola vez por versión
export const NEWS_ALWAYS = false;

export const NEWS_VIDEO = 'media/flaski-lo-nuevo-720x1280.mp4';
export const NEWS_POSTER = 'media/portada.jpg';

// Lo mismo que cuenta el vídeo, escena a escena
const ITEMS = [
  ['layout-dashboard', 'El mapa de lo que sabes', 'Cada tema en casillas de colores: lo que te sabes, lo que llevas a medias y lo que se te resiste.'],
  ['eye-off', 'Repasar dentro del apunte', 'Tapa lo que pusiste en negrita y destápalo, con los mismos botones de la tanda.'],
  ['brain', 'Preguntas para entender', '«Explícalo con tus palabras» y «¿Qué pasaría si…?», para ir más allá de memorizar.'],
  ['timer', 'Simulacro de examen', 'Con tiempo, penalización y tu nota, y los fallos van directos al repaso.'],
  ['calendar', 'Un plan hasta el examen', 'Tu semana, etapas y cuánto te toca cada día para llegar.'],
  ['palette', 'Colores y pegatinas', 'Elige tu color y ordena con carpetas y etiquetas de colores.'],
  ['compass', 'Explorar', 'Temas listos para empezar, listas de tus amigos y de la comunidad.'],
];

// opts: { onClose(), onTry() } (onTry: «Probar el simulacro»; después también se llama a onClose)
export function openNews(opts = {}) {
  if (document.querySelector('.ob')) return;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.createElement('div');
  root.className = 'ob news';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'newsTitle');
  root.tabIndex = -1;
  root.innerHTML = `
    <div class="ob-top"><span></span><button type="button" class="link ob-skip" data-news-close>Cerrar</button></div>
    <div class="news-body">
      <h1 id="newsTitle">Lo nuevo en Flaski</h1>
      <div class="news-video${still ? ' is-still' : ''}">
        <video src="${NEWS_VIDEO}" poster="${NEWS_POSTER}" muted playsinline loop ${still ? 'preload="none"' : 'autoplay'} aria-label="Vídeo con lo nuevo de Flaski, sin sonido"></video>
        ${still ? `<button type="button" class="news-play" data-news-play>${icon('play', { size: 20 })} Ver el vídeo</button>` : ''}
      </div>
      <ul class="news-items">${ITEMS.map(([ic, t, d]) => `<li>${icon(ic, { size: 20 })}<span><b>${t}</b>${d}</span></li>`).join('')}</ul>
      <div class="news-btns"><button type="button" class="primary big" data-news-try>Probar el simulacro</button><button type="button" class="ghost big" data-news-close>Cerrar</button></div>
    </div>`;
  document.body.appendChild(root);
  document.body.classList.add('ob-open');
  root.focus({ preventScroll: true });
  const video = root.querySelector('video');
  function close() {
    removeEventListener('keydown', onKey, true);
    video.pause();
    root.remove();
    document.body.classList.remove('ob-open');
    opts.onClose?.();
  }
  function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); close(); } }
  root.addEventListener('click', e => {
    e.stopPropagation();
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.newsPlay !== undefined) { b.remove(); video.controls = true; video.play().catch(() => {}); return; }
    if (b.dataset.newsTry !== undefined) { close(); opts.onTry?.(); return; }
    if (b.dataset.newsClose !== undefined) close();
  });
  addEventListener('keydown', onKey, true);
}
