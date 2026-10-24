// La primera vez: ¿qué quieres estudiar? → (oposición o examen: cuál y cuándo) → trae tu tema → tema subido →
// primera tanda (la empieza la app). Usa el mismo diálogo a pantalla completa que la presentación (.ob).
// No sabe nada del estado de la app: recibe lo que necesita y avisa con onFinish(elección).
import { icon } from './icons.js';
import { ideasFromAnswer } from './entender.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Temas de ejemplo (carpeta temas/): para quien no tiene nada que subir; también entran en los datos de ejemplo
export const TEMAS = [
  { file: 'temas/constitucion-titulo-preliminar.md', cards: 'temas/constitucion-titulo-preliminar.json', title: 'La Constitución · Título Preliminar', text: 'Para oposiciones: los artículos 1 a 9', drawing: 'balanza-color' },
  { file: 'temas/por-que-se-te-olvidan-las-cosas.md', cards: 'temas/por-que-se-te-olvidan-las-cosas.json', title: 'Por qué se te olvidan las cosas', text: 'Cómo funciona la memoria y por qué repasar así', drawing: 'brujula' },
];
// Las preguntas de un tema de ejemplo (temas/*.json, las que debería sacar un buen sugeridor) como preguntas de
// Flaski: { typeId, fields, answer } (answer: el texto con el que se busca su bloque en el apunte)
const items = r => String(r).split(' · ').map(x => x.trim()).filter(Boolean);
export function temaCards(list) {
  return list.map(x => {
    const q = x.pregunta, a = x.respuesta, hole = /\{\{(.+?)\}\}/.exec(q)?.[1] || a;
    if (x.tipo === 'cloze') return { typeId: 'cloze', fields: { x: q, e: '' }, answer: hole };
    if (x.tipo === 'number') return { typeId: 'number', fields: { q, a }, answer: a };
    if (x.tipo === 'choice') return { typeId: 'choice', fields: { q, a, w: (x.incorrectas || []).join('; ') }, answer: a };
    if (x.tipo === 'truefalse') {
      const [, vf, why = ''] = /^(Verdadero|Falso)\s*(?:\((.*)\))?/i.exec(a) || [, a, ''];
      return { typeId: 'truefalse', fields: { s: q, v: /^f/i.test(vf) ? 'F' : 'V', n: why }, answer: why || q };
    }
    if (x.tipo === 'match') return { typeId: 'match', fields: { t: q, p: items(a).join('\n') }, answer: items(a)[0].split('=').pop().trim() };
    if (x.tipo === 'steps') return { typeId: 'steps', fields: { q, s: items(a).join('\n') }, answer: items(a)[0] };
    // Clasificar solo si cada parte es «grupo: elementos»; si no, una básica con la lista
    if (x.tipo === 'sort' && items(a).every(g => g.includes(':'))) return { typeId: 'sort', fields: { q, g: items(a).join('\n') }, answer: items(a)[0].split(':').pop().split(',')[0].trim() };
    if (x.tipo === 'sort') return { typeId: 'basic', fields: { q, a: items(a).map(i => '- ' + i).join('\n') }, answer: items(a)[0] };
    // Explícalo y ¿Qué pasaría si…?: sus ideas clave salen de la respuesta
    if (x.tipo === 'explain') return { typeId: 'explain', fields: { q, k: ideasFromAnswer(a).join('\n'), n: '' }, answer: a };
    if (x.tipo === 'whatif') return { typeId: 'whatif', fields: { s: q, p: '', e: '', k: ideasFromAnswer(a).join('\n'), n: '' }, answer: a };
    return { typeId: 'basic', fields: { q, a }, answer: a };
  });
}
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const monthText = ym => { const [y, m] = String(ym || '').split('-').map(Number); return y && m ? `${MONTHS[m - 1]} de ${y}` : ''; };
// El tipo de archivo, para su etiqueta (PDF, Word…)
export const fileKind = name => { const e = String(name).split('.').pop().toLowerCase(); return e === 'pdf' ? 'pdf' : e === 'docx' ? 'word' : ['md', 'markdown', 'zip'].includes(e) ? 'md' : 'txt'; };
const KIND_LABEL = { pdf: 'PDF', word: 'Word', md: 'MD', txt: 'TXT', example: 'MD' };

// opts: { langs, examples() (las listas de ejemplo, que pueden llegar más tarde), defaultLang, drawings: { id: svg }, readFile(file, say), readText(text), readExample(tema),
//         analyze(page) → { sections: [títulos], total, first }, onFinish(choice) }
// page (lo que devuelven las lecturas): { title, blocks, name, kind, pages }
// choice: null (ir a Hoy) · { kind: 'lang', lang } · { kind: 'example', file } · { kind: 'ia' | 'anki', folder }
//         · { kind: 'tanda' | 'review' | 'open', folder, page }   (folder: { name, exam: 'AAAA-MM' | '', icon } o null)
export function openFirstRun(opts) {
  const root = document.createElement('div');
  root.className = 'ob fr';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Empieza con Flaski');
  root.tabIndex = -1;
  document.body.appendChild(root);
  document.body.classList.add('ob-open');
  // step: que · idioma · examen · tema · pegar · ejemplos · leyendo · listo
  const st = { step: 'que', what: null, name: '', exam: '', noExam: false, cal: false, calYear: new Date().getFullYear(), how: 'notes', lang: opts.defaultLang || 'en-GB', page: null, info: null, error: '', status: '' };
  const trail = [];
  const drawing = id => opts.drawings?.[id] || '';
  const isExam = () => st.what === 'opo' || st.what === 'uni';
  const folder = () => (isExam() && st.name.trim() ? { name: st.name.trim().slice(0, 80), exam: st.noExam ? '' : st.exam, icon: st.what === 'opo' ? 'd:balanza' : 'd:economia' } : null);
  const temaTitle = () => (st.what === 'opo' ? 'Trae tu tema 1' : 'Trae tus apuntes');
  const heroName = () => st.name.trim() || (st.what === 'opo' ? 'Tu oposición' : 'Tu asignatura');
  const heroWhen = () => (st.noExam ? 'sin fecha de examen' : st.exam ? `examen en ${monthText(st.exam)}` : '');

  const fold = (cls, title, text, art, what) => `<button type="button" class="fr-fold${cls}" data-fr-what="${what}"><span class="fr-fold-art" aria-hidden="true">${art}</span><b>${title}</b><small>${text}</small></button>`;
  const dots = k => `<span class="fr-dots" role="img" aria-label="Paso ${k} de 3">${[1, 2, 3].map(i => `<i${i === k ? ' class="on"' : i < k ? ' class="past"' : ''}></i>`).join('')}</span>`;
  const top = k => `<div class="fr-top"><button type="button" class="fr-back" data-fr-back aria-label="Atrás">${icon('chevron-left', { size: 20 })}</button>${k ? dots(k) : ''}<span class="fr-top-end"></span></div>`;
  const card = (attrs, ic, title, text) => `<button type="button" class="fr-card" ${attrs}>${ic}<span class="fr-card-t"><b>${title}</b><small>${text}</small></span>${icon('chevron-right', { size: 18 })}</button>`;

  // El mes del examen: año con flechas y los 12 meses (los ya pasados, apagados)
  const calendar = () => {
    const now = new Date(), y = st.calYear, nowY = now.getFullYear();
    const key = i => `${y}-${String(i + 1).padStart(2, '0')}`;
    return `<div class="fr-cal" role="group" aria-label="Mes del examen">
      <div class="fr-cal-h"><button type="button" class="fr-cal-y" data-fr-year="-1" aria-label="Año anterior" ${y <= nowY ? 'disabled' : ''}>${icon('chevron-left', { size: 18 })}</button><b>${y}</b><button type="button" class="fr-cal-y" data-fr-year="1" aria-label="Año siguiente" ${y >= nowY + 6 ? 'disabled' : ''}>${icon('chevron-right', { size: 18 })}</button></div>
      <div class="fr-cal-m">${MONTHS.map((m, i) => `<button type="button" data-fr-month="${key(i)}" aria-label="${m} de ${y}" aria-pressed="${st.exam === key(i)}" ${y === nowY && i < now.getMonth() ? 'disabled' : ''}>${m.slice(0, 3)}</button>`).join('')}</div>
    </div>`;
  };
  const redraw = () => { const y = root.scrollTop; draw(); root.scrollTop = y; };
  const screens = {
    que: () => `<div class="fr-body">
        <p class="fr-brand">Flaski</p>
        <h1 class="fr-h">¿Qué quieres estudiar?</h1>
        <p class="fr-lead">Elige uno y en un minuto harás tu primera tanda.</p>
        <div class="fr-folds">
          ${fold('', 'Un idioma', 'con audio y corrección', drawing('gramatica-japones'), 'idioma')}
          ${fold(' is-deep', 'Una oposición', 'tu temario, tema a tema', drawing('balanza-color'), 'opo')}
          ${fold(' is-deep', 'La uni', 'o cualquier examen', drawing('economia'), 'uni')}
          ${fold('', 'Vengo de Anki', 'me llevo mi progreso', icon('copy', { size: 44 }), 'anki')}
        </div>
        ${card('data-fr-what="otra"', `<span class="fr-card-art" aria-hidden="true">${drawing('brujula')}</span>`, 'Otra cosa', 'lo que te apetezca aprender')}
      </div>
      <p class="fr-foot">Ya sé cómo va · <button type="button" class="link" data-fr-done>ir a Hoy</button></p>`,
    idioma: () => {
      const ex = opts.examples().filter(e => e.lang && e.lang.split('-')[0] === st.lang.split('-')[0]);
      return `${top(0)}<div class="fr-body">
        <h1 class="fr-h">¿Qué idioma?</h1>
        <p class="fr-lead">Crearemos una lista con audio y corrección para ese idioma.</p>
        <select id="frLang" aria-label="Idioma">${opts.langs.map(l => `<option value="${l.id}" ${l.id === st.lang ? 'selected' : ''}>${esc(l.label)}</option>`).join('')}</select>
        ${ex.length ? `<p class="fr-label">O empieza con una ya hecha</p>
        <ul class="fr-list">${ex.map(e => `<li>${card(`data-fr-example="${esc(e.file)}"`, icon('copy', { size: 22 }), esc(e.name), `${e.count} preguntas`)}</li>`).join('')}</ul>` : ''}
      </div>
      <div class="fr-cta"><button type="button" class="primary big" data-fr-go="lang">Crear mi lista</button></div>`;
    },
    examen: () => {
      const opo = st.what === 'opo';
      const how = (id, ic, title, text, badge = '') => `<label class="fr-how${st.how === id ? ' is-on' : ''}"><input type="radio" name="frHow" value="${id}" ${st.how === id ? 'checked' : ''}>
          <span class="fr-how-ic">${icon(ic, { size: 22 })}</span><span class="fr-how-t"><b>${title}${badge ? ` <em>${badge}</em>` : ''}</b><small>${text}</small></span><span class="fr-radio" aria-hidden="true">${icon('check', { size: 16 })}</span></label>`;
      return `${top(1)}<div class="fr-body">
        <h1 class="fr-h">${opo ? 'Tu oposición' : 'Tu examen'}</h1>
        <div class="fr-hero"><span class="fr-hero-art" aria-hidden="true">${drawing(opo ? 'balanza-color' : 'economia')}</span><small>tu carpeta</small><b id="frHeroName">${esc(heroName())}</b><small id="frHeroWhen">${heroWhen()}</small></div>
        <label class="fr-label" for="frName">${opo ? '¿Cuál?' : '¿Qué estudias?'}</label>
        <input id="frName" maxlength="80" value="${esc(st.name)}" placeholder="Ej.: ${opo ? 'Auxiliar Administrativo del Estado' : 'Historia del Arte'}" autocomplete="off">
        <label class="fr-label" for="frExam">¿Cuándo es el examen?</label>
        <div class="fr-row"><div class="fr-month"><button type="button" id="frExam" class="fr-month-b${st.exam && !st.noExam ? '' : ' is-empty'}" data-fr-cal aria-expanded="${st.cal}" ${st.noExam ? 'disabled' : ''}><span>${st.exam && !st.noExam ? esc(monthText(st.exam)) : 'Elige el mes'}</span>${icon('chevron-down', { size: 18 })}</button>${st.cal && !st.noExam ? calendar() : ''}</div><button type="button" class="fr-pill" data-fr-noexam aria-pressed="${st.noExam}">Aún no lo sé</button></div>
        <p class="fr-label" id="frHowL">¿Cómo empiezas?</p>
        <div class="fr-hows" role="radiogroup" aria-labelledby="frHowL">
          ${how('notes', 'file-text', 'Subo mis apuntes', `PDF, Word… lo que tengas${opo ? ' del tema 1' : ''}`, 'lo más rápido')}
          ${how('ia', 'message-square', 'Le pido preguntas a una IA', 'Te damos las instrucciones para ChatGPT, Gemini o Claude')}
          ${how('anki', 'download', 'Importo de Anki', 'Tus mazos, con su progreso')}
        </div>
      </div>
      <div class="fr-cta"><button type="button" class="primary big" data-fr-go="examen">Seguir</button></div>`;
    },
    tema: () => `${top(2)}<div class="fr-body">
        <h1 class="fr-h">${temaTitle()}</h1>
        <p class="fr-lead">Sube el archivo o pega el texto.</p>
        <label class="fr-drop" id="frDrop"><input type="file" id="frFile" accept=".pdf,.docx,.md,.markdown,.txt,.zip,.html,.htm">
          <span class="fr-drop-ic">${icon('upload', { size: 28 })}</span><b>Sube tu archivo</b><small>Toca para elegirlo o arrástralo aquí</small>
          <span class="fr-kinds"><i class="k-pdf">PDF</i><i class="k-word">Word</i><i class="k-md">Markdown</i><i class="k-notion">Notion</i><i class="k-obs">Obsidian</i></span></label>
        ${st.error ? `<p class="error" role="alert">${esc(st.error)}</p>` : ''}
        <div class="fr-or"><span>o</span></div>
        ${card('data-fr-step="pegar"', icon('clipboard', { size: 24 }), 'Pega el texto', 'De una web, un correo o donde lo tengas')}
      </div>
      <p class="fr-foot">¿Aún no tienes apuntes? <button type="button" class="link" data-fr-step="ejemplos">Prueba con un tema de ejemplo</button></p>`,
    pegar: () => `${top(2)}<div class="fr-body">
        <h1 class="fr-h">Pega el texto</h1>
        <p class="fr-lead">Los títulos y las negritas ayudan a encontrar preguntas.</p>
        <textarea id="frText" rows="10" placeholder="Pega aquí tus apuntes" aria-label="Tus apuntes"></textarea>
        ${st.error ? `<p class="error" role="alert">${esc(st.error)}</p>` : ''}
      </div>
      <div class="fr-cta"><button type="button" class="primary big" data-fr-go="pegar">Seguir</button></div>`,
    ejemplos: () => `${top(2)}<div class="fr-body">
        <h1 class="fr-h">Un tema de ejemplo</h1>
        <p class="fr-lead">Se guarda como un apunte tuyo: puedes leerlo, cambiarlo o borrarlo.</p>
        <ul class="fr-list">${TEMAS.map((t, i) => `<li>${card(`data-fr-tema="${i}"`, `<span class="fr-card-art" aria-hidden="true">${drawing(t.drawing)}</span>`, esc(t.title), esc(t.text))}</li>`).join('')}</ul>
      </div>`,
    leyendo: () => `${top(2)}<div class="fr-body fr-center"><p class="fr-lead" role="status" id="frStatus">${esc(st.status)}</p></div>`,
    listo: () => {
      const p = st.page, { first: n, total, sections } = st.info;
      const meta = [p.pages ? `${p.pages} ${p.pages === 1 ? 'página' : 'páginas'}` : '', p.kind === 'example' ? 'tema de ejemplo' : 'convertido en apunte'].filter(Boolean).join(' · ');
      return `${top(2)}<div class="fr-body">
        <h1 class="fr-h">${temaTitle()}</h1>
        <p class="fr-lead">PDF, Word, Markdown, Notion u Obsidian.</p>
        <div class="fr-file"><span class="fr-file-k k-${p.kind}">${KIND_LABEL[p.kind] || 'TXT'}</span><span class="fr-card-t"><b>${esc(p.name)}</b><small>${meta}</small></span>${icon('check', { size: 24 })}</div>
        ${sections.length ? `<p class="fr-label">Hemos encontrado ${sections.length === 1 ? '1 apartado' : `${sections.length} apartados`}</p>
        <ol class="fr-secs">${sections.slice(0, 5).map((t, i) => `<li${i ? '' : ' class="on"'}><i>${i + 1}</i><span>${esc(t)}</span>${i ? '' : '<em>empiezas aquí</em>'}</li>`).join('')}${sections.length > 5 ? `<li class="more">y ${sections.length - 5} más</li>` : ''}</ol>` : ''}
        <div class="fr-sug">${total ? `<h2>${icon('sugerencia', { size: 26 })} ${total === 1 ? '1 pregunta posible' : `${total} preguntas posibles`}</h2>
          <p>Empezamos con ${n} del principio.${total > n ? ' Las demás te esperan en tu apunte y las revisas cuando quieras.' : ''}</p>`
          : '<h2>Sin preguntas a la vista</h2><p>No hemos encontrado preguntas en este texto. Ábrelo y crea las tuyas seleccionando lo importante.</p>'}</div>
      </div>
      <div class="fr-cta">${n ? `<button type="button" class="primary big fr-go2" data-fr-go="tanda"><b>Hacer mi primera tanda</b><small>${n === 1 ? '1 pregunta' : `${n} preguntas`} · unos ${Math.max(1, Math.round(n / 3))} min</small></button>
        <p class="fr-links"><button type="button" class="link" data-fr-go="review">Ver ${n === 1 ? 'la pregunta' : `las ${n}`} antes</button> · <button type="button" class="link" data-fr-back>cambiar de archivo</button></p>`
        : '<button type="button" class="primary big" data-fr-go="open">Abrir mi apunte</button><p class="fr-links"><button type="button" class="link" data-fr-back>cambiar de archivo</button></p>'}</div>`;
    },
  };

  function draw() {
    root.dataset.step = st.step;
    root.innerHTML = `<div class="fr-wrap">${screens[st.step]()}</div>`;
    root.focus({ preventScroll: true });
    root.scrollTop = 0;
  }
  function to(step) { if (!['leyendo', 'listo'].includes(st.step)) trail.push(st.step); st.step = step; st.error = ''; draw(); }
  function goBack() { const prev = trail.pop(); if (prev) { st.step = prev; st.error = ''; draw(); } }
  function finish(c) {
    removeEventListener('keydown', onKey, true);
    root.remove();
    document.body.classList.remove('ob-open');
    opts.onFinish(c);
  }
  // Desde fuera (p. ej. al cargar los datos de ejemplo) se cierra como «ir a Hoy»
  root.addEventListener('ob-close', () => finish(null));
  function onKey(e) {
    if (e.key !== 'Escape' || e.target.closest?.('input,textarea,select')) return;
    if (st.cal) { e.preventDefault(); st.cal = false; redraw(); return root.querySelector('#frExam')?.focus(); }
    if (st.step !== 'que') { e.preventDefault(); goBack(); }
  }
  // Un apunte leído (de un archivo, pegado o de ejemplo) → la pantalla con sus apartados y preguntas
  async function load(read, status) {
    const from = st.step;
    st.status = status; to('leyendo');
    try {
      const page = await read(t => { const el = root.querySelector('#frStatus'); if (el) el.textContent = t; });
      if (!page?.blocks?.length) throw new Error('No hemos encontrado texto que convertir en apunte.');
      st.page = page; st.info = opts.analyze(page);
      st.step = 'listo'; draw();
    } catch (err) {
      console.error(err);
      trail.pop();
      st.step = from; draw();
      st.error = err?.message || 'No se ha podido leer el archivo.'; draw();
    }
  }
  const readFile = f => load(say => opts.readFile(f, say), `Leyendo «${f.name}»…`);
  root.addEventListener('click', e => {
    // Los clics del diálogo no siguen hasta la app (puede haberse cerrado ya)
    e.stopPropagation();
    if (st.cal && !e.target.closest('.fr-month')) { st.cal = false; redraw(); }
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.frBack !== undefined) return goBack();
    if (d.frDone !== undefined) return finish(null);
    if (d.frWhat) {
      st.what = d.frWhat;
      if (d.frWhat === 'idioma') return to('idioma');
      if (d.frWhat === 'anki') return finish({ kind: 'anki', folder: null });
      if (d.frWhat === 'otra') return to('tema');
      return to('examen');
    }
    if (d.frStep) return to(d.frStep);
    if (d.frNoexam !== undefined) { st.noExam = !st.noExam; st.cal = false; return redraw(); }
    if (d.frCal !== undefined) { st.cal = !st.cal; if (st.exam) st.calYear = +st.exam.slice(0, 4); redraw(); return root.querySelector(st.cal ? '.fr-cal [aria-pressed="true"], .fr-cal-m button:not(:disabled)' : '#frExam')?.focus(); }
    if (d.frYear) { st.calYear += +d.frYear; redraw(); return root.querySelector(`[data-fr-year="${d.frYear}"]:not(:disabled)`)?.focus() || root.querySelector('.fr-cal-m button:not(:disabled)')?.focus(); }
    if (d.frMonth) { st.exam = d.frMonth; st.cal = false; redraw(); return root.querySelector('#frExam')?.focus(); }
    if (d.frExample) return finish({ kind: 'example', file: d.frExample });
    if (d.frTema !== undefined) { const t = TEMAS[+d.frTema]; return load(() => opts.readExample(t), `Abriendo «${t.title}»…`); }
    if (d.frGo === 'lang') return finish({ kind: 'lang', lang: root.querySelector('#frLang').value });
    if (d.frGo === 'examen') {
      if (!st.name.trim()) { const i = root.querySelector('#frName'); i.setAttribute('aria-invalid', 'true'); return i.focus(); }
      if (st.how === 'notes') return to('tema');
      return finish({ kind: st.how, folder: folder() });
    }
    if (d.frGo === 'pegar') {
      const text = root.querySelector('#frText').value;
      if (!text.trim()) return root.querySelector('#frText').focus();
      return load(() => opts.readText(text), 'Leyendo el texto…');
    }
    if (['tanda', 'review', 'open'].includes(d.frGo)) return finish({ kind: d.frGo, folder: folder(), page: st.page });
  });
  root.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'frName') { st.name = t.value; t.removeAttribute('aria-invalid'); const h = root.querySelector('#frHeroName'); if (h) h.textContent = heroName(); }
  });
  root.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'frLang') { st.lang = t.value; draw(); root.querySelector('#frLang')?.focus(); }
    if (t.name === 'frHow') { st.how = t.value; root.querySelectorAll('.fr-how').forEach(l => l.classList.toggle('is-on', l.contains(t))); }
    if (t.id === 'frFile' && t.files?.[0]) readFile(t.files[0]);
  });
  // Arrastrar un archivo a la zona de subir
  root.addEventListener('dragover', e => { const z = e.target.closest?.('#frDrop'); if (z) { e.preventDefault(); z.classList.add('is-over'); } });
  root.addEventListener('dragleave', e => e.target.closest?.('#frDrop')?.classList.remove('is-over'));
  root.addEventListener('drop', e => { if (e.target.closest?.('#frDrop')) { e.preventDefault(); const f = e.dataTransfer?.files?.[0]; if (f) readFile(f); } });
  addEventListener('keydown', onKey, true);
  draw();
}
