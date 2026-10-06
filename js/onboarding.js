// Presentación de bienvenida: unas pantallas con capturas de la app (img/onboarding, se regeneran con
// «npm run capturas» en tests/) y una última para arrancar según lo que quieras estudiar.
// No sabe nada del estado de la app: recibe lo que necesita y avisa con onFinish(elección).
import { icon } from './icons.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SLIDES = [
  { id: 'welcome' },
  { id: 'estudiar', title: 'Estudia solo lo que toca',
    text: 'Cada día Flaski te enseña las tarjetas que estás a punto de olvidar. Tú dices cómo te ha ido y la app decide cuándo volver a enseñártelas: cuanto mejor la sabes, más tarda en volver.',
    alt: 'Una tarjeta de japonés con su respuesta y los botones Otra vez, Difícil, Bien y Fácil' },
  { id: 'tipos', title: 'Una tarjeta para cada cosa',
    text: 'Vocabulario, huecos, opción múltiple, dictado, kanji trazo a trazo… Cada mazo sabe qué estudias y el editor te propone los tipos de tarjeta que encajan.',
    alt: 'El selector de tipos de tarjeta en un mazo de alemán' },
  { id: 'apuntes', title: 'Tus apuntes, unidos a tus tarjetas',
    text: 'Selecciona cualquier parte de tus apuntes para convertirla en tarjeta. Verás de un vistazo qué partes dominas y cuáles te cuestan, y podrás repasar un tema entero de una vez.',
    alt: 'Unos apuntes de historia con cada parte coloreada según cómo se llevan sus tarjetas' },
  { id: 'ia', title: 'Mazos hechos con IA',
    text: 'Pídele a ChatGPT, Gemini o Claude un mazo sobre lo que quieras y pégalo aquí. Flaski revisa cada tarjeta antes de añadirla y te dice si algo no está bien.',
    alt: 'La vista previa de un mazo de inglés pegado desde una IA' },
  { id: 'start' },
];

// opts: { name, langs: [{id,label}], examples: [{file,name,lang,count}], defaultLang, dark, onFinish(choice) }
// choice: null (solo mirar) · { kind: 'lang', lang } · { kind: 'example', file } · { kind: 'notes' } · { kind: 'ia' } · { kind: 'explore' }
export function openOnboarding(opts) {
  const root = document.createElement('div');
  root.className = 'ob';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Te damos la bienvenida a Flaski');
  root.tabIndex = -1;
  document.body.appendChild(root);
  document.body.classList.add('ob-open');
  let i = 0, lang = opts.defaultLang || 'en-GB', open = null;
  const last = SLIDES.length - 1;
  const img = id => `img/onboarding/${id}-${opts.dark() ? 'dark' : 'light'}.jpg`;

  const welcome = () => `
    <div class="ob-hero"><div class="ob-mark" aria-hidden="true">F</div>
      <h1>${opts.name ? `Hola, ${esc(opts.name)}` : 'Te damos la bienvenida a Flaski'}</h1>
      <p class="ob-lead">Aprende cualquier cosa y no la olvides: flashcards con repaso espaciado, apuntes unidos a tus tarjetas y mazos para cualquier tema.</p>
      <ul class="ob-feats">
        <li>${icon('brain', { size: 20 })}<span><b>Recuerda más estudiando menos.</b> Cada tarjeta vuelve justo cuando la ibas a olvidar.</span></li>
        <li>${icon('notebook-text', { size: 20 })}<span><b>De tus apuntes a tus tarjetas.</b> Y de cada tarjeta, de vuelta a su apunte.</span></li>
        <li>${icon('wifi-off', { size: 20 })}<span><b>Siempre contigo.</b> En el móvil como una app, también sin conexión.</span></li>
      </ul></div>`;
  const shot = s => `
    <figure class="ob-shot"><div class="ob-phone"><img src="${img(s.id)}" alt="${esc(s.alt)}" width="390" height="760" decoding="async"></div></figure>
    <div class="ob-copy"><h2>${s.title}</h2><p>${s.text}</p></div>`;
  const choice = (kind, ic, title, text, extra = '') => `
    <li class="ob-opt${open === kind ? ' is-open' : ''}"><button type="button" class="ob-optbtn" data-ob-pick="${kind}" aria-expanded="${open === kind}">
      <span class="ob-optic">${icon(ic, { size: 22 })}</span><span class="ob-opttxt"><b>${title}</b><small>${text}</small></span>${icon('chevron-right', { size: 18, cls: 'chev' })}</button>${extra}</li>`;
  const start = () => {
    const ex = opts.examples.filter(e => e.lang && e.lang.split('-')[0] === lang.split('-')[0]);
    const langPanel = open === 'lang' ? `<div class="ob-optpanel">
        <label for="obLang">¿Qué idioma?</label>
        <div class="ob-row"><select id="obLang">${opts.langs.map(l => `<option value="${l.id}" ${l.id === lang ? 'selected' : ''}>${esc(l.label)}</option>`).join('')}</select>
          <button type="button" class="primary" data-ob-go="lang">Crear mi mazo</button></div>
        ${ex.length ? `<p class="hint">O empieza con uno ya hecho:</p><ul class="ob-examples">${ex.map(e => `<li><button type="button" class="ghost small-btn" data-ob-example="${esc(e.file)}">${esc(e.name)} <span class="muted">· ${e.count} tarjetas</span></button></li>`).join('')}</ul>` : ''}
      </div>` : '';
    return `<div class="ob-copy ob-copy-start"><h2>¿Por dónde quieres empezar?</h2><p>Puedes cambiar de idea cuando quieras: todo está en la barra de abajo.</p></div>
      <ul class="ob-opts">
        ${choice('lang', 'languages', 'Aprender un idioma', 'Un mazo con audio y corrección para ese idioma', langPanel)}
        ${choice('notes', 'file-text', 'Empezar con mis apuntes', 'Escribe o pega tus apuntes y crea tarjetas desde ellos')}
        ${choice('ia', 'copy', 'Pedirle un mazo a una IA', 'Te damos las instrucciones para copiarlas en tu IA')}
        ${choice('explore', 'compass', 'Ver mazos de ejemplo', 'Japonés, turco y más, listos para estudiar')}
      </ul>
      <button type="button" class="link ob-later" data-ob-done>Ahora no, prefiero mirar</button>`;
  };

  function draw() {
    const s = SLIDES[i];
    root.dataset.slide = s.id;
    root.innerHTML = `
      <div class="ob-top">
        <div class="ob-dots" role="tablist" aria-label="Pantallas">${SLIDES.map((x, k) => `<button type="button" role="tab" class="ob-dot" data-ob-to="${k}" aria-selected="${k === i}" aria-label="Pantalla ${k + 1} de ${SLIDES.length}"></button>`).join('')}</div>
        ${i < last ? '<button type="button" class="link ob-skip" data-ob-to="' + last + '">Saltar</button>' : ''}
      </div>
      <div class="ob-body ob-${s.id}" aria-live="polite">${s.id === 'welcome' ? welcome() : s.id === 'start' ? start() : shot(s)}</div>
      ${i < last ? `<div class="ob-nav">${i ? '<button type="button" class="ghost" data-ob-to="' + (i - 1) + '">Atrás</button>' : '<span></span>'}
        <button type="button" class="primary" data-ob-to="${i + 1}">${i ? 'Siguiente' : 'Empezar'}</button></div>` : ''}`;
    // La siguiente captura, ya cargada
    const next = SLIDES[i + 1];
    if (next && next.title) { const pre = new Image(); pre.src = img(next.id); }
    // El foco va al diálogo (los lectores de pantalla leen la pantalla nueva y Tab sigue funcionando)
    root.focus({ preventScroll: true });
    root.scrollTop = 0;
  }
  function go(k) { i = Math.max(0, Math.min(last, k)); draw(); }
  function finish(c) {
    removeEventListener('keydown', onKey, true);
    root.remove();
    document.body.classList.remove('ob-open');
    opts.onFinish(c);
  }
  function onKey(e) {
    if (e.target.id === 'obLang') return;
    if (e.key === 'ArrowRight') { e.preventDefault(); go(i + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(i - 1); }
    else if (e.key === 'Escape') { e.preventDefault(); i === last ? finish(null) : go(last); }
  }
  root.addEventListener('click', e => {
    // Los clics de la presentación no siguen hasta la app (la presentación puede haberse cerrado ya)
    e.stopPropagation();
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.obTo !== undefined) return go(Number(d.obTo));
    if (d.obDone !== undefined) return finish(null);
    if (d.obPick) {
      if (d.obPick === 'lang') { open = open === 'lang' ? null : 'lang'; return draw(); }
      return finish({ kind: d.obPick });
    }
    if (d.obGo === 'lang') return finish({ kind: 'lang', lang: root.querySelector('#obLang').value });
    if (d.obExample) return finish({ kind: 'example', file: d.obExample });
  });
  root.addEventListener('change', e => { if (e.target.id === 'obLang') { lang = e.target.value; const y = root.scrollTop; draw(); root.scrollTop = y; root.querySelector('#obLang')?.focus(); } });
  // Deslizar a los lados en el móvil
  let x0 = null;
  root.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  root.addEventListener('touchend', e => {
    if (x0 == null || i === last) return;
    const dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (Math.abs(dx) > 60) go(i + (dx < 0 ? 1 : -1));
  }, { passive: true });
  addEventListener('keydown', onKey, true);
  draw();
}
