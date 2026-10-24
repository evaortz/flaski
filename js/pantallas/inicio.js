// Flaski · pantalla Hoy (sale de app.js)
import { drawStats } from '../stats.js';
import { heatmapView, progressSeries, progressView, innerW, streaks, scrollChartsToEnd } from '../charts.js';
import { icon } from '../icons.js';
import { folderPath } from '../org.js';
import { pageTitle, STATUS } from '../pages.js';
import { examStatus, nextExam, decksUnder, EXAM_NEAR } from '../plan.js';
import { daysLeft } from '../atrasos.js';
import { weekDays } from '../friends.js';
import { $, main, S, esc, plain, cardList, capNote, counts, newPlan, freshByDeck, planNodes, scopeDecks, weakSections, WEAK_SHOWN, backlog, backlogNoNew, nearDecks, daysAway } from '../comun.js';
import { plural } from './mazos.js';
import { statsData, pushAskHTML } from './perfil.js';
import { homeFriendsHTML } from './amigos.js';
import { shortInfo, todayQueue } from './estudio.js';
import { openSheet } from './editor.js';
import { TANDA_MINUTES, tandaSize } from '../tanda.js';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/* ===================== Hoy ===================== */
export function renderHome() {
  if (S.decks.size === 0) {
    main.innerHTML = `<div class="panel">
      <h1>Hola${S.name ? ', ' + esc(S.name) : ''}</h1>
      <p>Todavía no tienes listas. Puedes empezar con una ya hecha o crear la tuya.</p>
      <div class="btnrow"><button class="primary" data-nav="explore">Ver listas para empezar</button><button class="ghost" data-act="new-deck">Crear una lista</button></div></div>`;
    return;
  }
  // Lo que sale hoy, contado con las mismas reglas que la tanda (límites, hermanas…): como Biblioteca
  const all = counts('all'), q = todayQueue('all');
  const avail = q.ids.length;
  const H = S.prefs.home;
  const folders = pendingFolders(), b = backlog(), late = b ? all.dueAll - all.due : 0;
  const back = daysAway() >= 3, hi = `Hola${back ? ' de nuevo' : ''}${S.name ? (back ? ', ' : ' ') + esc(S.name) : ''}`;
  main.innerHTML = `
    <div class="home-l">
    <section class="hero" aria-label="Hoy">
      <h1 class="hero-hi">${hi}${avail ? (back ? '. Hoy tienes' : ', hoy tienes') : ''}</h1>
      <div class="hero-row">
        <div class="hero-num">${avail}</div>
        <div class="hero-side">
          <span class="hero-word">${avail ? (avail === 1 ? 'pregunta!' : 'preguntas!') : 'al día'}</span>
          <span class="hero-band">para hoy</span>
          ${avail ? `<span>${q.due} por repasar</span><span>${newLine(q, folders, b)}</span>` : ''}
          ${late > 0 ? `<span class="hero-late"><button class="link" data-act="atrasos">+${plural(late, 'atrasada', 'atrasadas')}</button>, ${daysLeft(b.until) > 2 ? 'repartidas esta semana' : 'para mañana'}</span>` : ''}
        </div>
      </div>
      ${avail
        ? `${shortHTML(avail)}${capNote(all)}`
        : `<p class="muted">${late > 0 ? 'Hecho lo de hoy. Lo atrasado que queda sigue mañana.' : all.dueAll > all.due ? 'Has llegado al límite de repasos de hoy.' : 'Estás al día. Vuelve mañana o aprende alguna nueva.'}</p>${capNote(all)}
           <button class="ghost big" data-act="more">Estudiar 10 nuevas más</button>`}
      ${lastPageHTML()}
    </section>
    ${weakHTML()}
    ${examHTML()}
    ${H.activity ? activityHTML() : ''}
    </div>
    <div class="home-r">
    ${pushAskHTML()}
    ${H.forecast ? '<section class="hoy-sec lv pg-card" id="pgHost" aria-labelledby="h-pg"></section>' : ''}
    ${homeFriendsHTML()}
    </div>`;
  drawHeatmap();
  drawProgress();
}

// La línea de las nuevas: cuántas y de dónde (el examen cercano o cuántas carpetas); sin nuevas mientras se reparte lo atrasado
function newLine(q, folders, b) {
  const n = q.fresh;
  if (!n && b) return 'sin nuevas hasta ponerte al día';
  if (!n && backlogNoNew()) return 'sin nuevas por hoy';
  const ex = nextExam(planNodes(), S.decks, S.folders);
  let k = 0;
  if (n && ex && ex.days <= EXAM_NEAR) { const ids = examDeckIds(ex.key); k = q.ids.filter(id => !S.progress.get(id) && ids.has(S.cards.get(id)?.deck_id)).length; }
  // Las del examen, las mismas que le da el plan: «15 nuevas · 6 de Alemán · A2» (todas: «6 nuevas · Alemán · A2»)
  const from = k ? ` · ${k < n ? `${k} de ` : ''}${esc(examName(ex.key))}` : folders ? ` · ${plural(folders, 'carpeta', 'carpetas')}` : '';
  return `${plural(n, 'nueva', 'nuevas')}${from}`;
}
// Las listas de un examen (de una lista o de todas las de una carpeta)
const examDeckIds = key => new Set(key.startsWith('f:') ? decksUnder(key.slice(2), S.decks, S.folders).map(x => x.id) : [key]);
const examName = key => (key.startsWith('f:') ? S.folders.get(key.slice(2)).name : S.decks.get(key).name);
// Hoja de «+N atrasadas»: por qué se reparten y, si quieres, hacerlas todas hoy
export function backlogSheet() {
  const b = backlog();
  if (!b) return;
  const all = counts('all'), late = all.dueAll - all.due, until = new Date(b.until + 'T12:00:00');
  openSheet(`<div class="atrasos"><h2>Lo atrasado, poco a poco</h2>
    <p>Mientras no estabas se han juntado preguntas. Para que la vuelta no se haga cuesta arriba, te las repartimos hasta el ${['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][until.getDay()]} ${until.getDate()}: hoy te tocan ${plural(all.due, 'repaso', 'repasos')} y quedan ${late} para los próximos días.</p>
    <p class="muted">Hasta que te pongas al día no entran preguntas nuevas${nearDecks().size ? ', salvo las que pide tu examen' : ''}.</p>
    <div class="btnrow"><button class="primary" data-act="close-sheet">Vale</button><button class="ghost" data-act="atrasos-all">Hacerlas todas hoy</button></div></div>`);
}

// «Empezar una tanda · N min · M preguntas», la tanda de siempre («las X de hoy») y cambiar la duración
function shortHTML(avail) {
  const { minutes, n, secs } = shortInfo(), m = Math.min(n, avail);
  const mins = m < n ? Math.max(1, Math.round((m * secs) / 60)) : minutes;
  return `<button class="primary big hero-go" data-act="tanda-short"><span class="hero-go-t">Empezar una tanda<small>${mins} min · ${plural(m, 'pregunta', 'preguntas')}</small></span></button>
    <div class="hero-more">${avail > m ? `<button class="hero-all" data-start="all"><span class="hero-m">o hacer las ${avail} de hoy</span><span class="hero-d">Hacer las ${avail} de hoy</span></button>` : ''}
      <button class="link hero-min" data-act="tanda-min">${icon('pencil', { size: 15 })} Tanda de ${minutes} min<span class="hero-d"> · cambiar</span></button></div>`;
}

// Hoja «¿Cuánto suele durar tu rato de estudio?»: la primera tanda y «Tanda de N min»
const TANDA_LABELS = { 5: 'una parada o dos', 10: 'un trayecto corto', 15: 'un trayecto medio', 20: 'un trayecto largo' };
export function tandaSheet() {
  const cur = S.prefs.study.tandaMin, { secs } = shortInfo();
  openSheet(`<div class="tanda-dur"><h2>¿Cuánto suele durar tu rato de estudio?</h2>
    <p class="muted">Haremos tandas que quepan justo. Se ajustan solas a tu ritmo.</p>
    <div class="tanda-opts" role="group" aria-label="Duración de la tanda">${TANDA_MINUTES.map(m => `<button type="button" class="tanda-opt" data-tanda-min="${m}" aria-pressed="${m === cur}">
      <b>${m} min</b><span>${TANDA_LABELS[m]}</span><small>unas ${tandaSize(m, secs)} preguntas</small></button>`).join('')}</div>
    <p class="muted small tanda-note">Lo cambias cuando quieras en Ajustes.</p>
    <button class="primary big" data-act="tanda-go">Empezar · ${cur} min</button></div>`);
}

// Carpetas (de primer nivel) con algo que estudiar hoy
function pendingFolders() {
  const live = scopeDecks('all'), now = Date.now(), decks = new Set();
  for (const [id, n] of newPlan('all')) if (n > 0) decks.add(id);
  for (const c of S.cards.values()) { const p = S.progress.get(c.id); if (p && p.due <= now && live.has(c.deck_id)) decks.add(c.deck_id); }
  const roots = new Set();
  for (const id of decks) { const top = folderPath(S.folders, S.decks.get(id)?.folder_id)[0]; if (top) roots.add(top.id); }
  return roots.size;
}

// «Lo dejaste aquí»: el último apunte que editaste, para seguir con él
function lastPageHTML() {
  const last = [...S.pages.values()].sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))[0];
  if (!last) return '';
  return `<button class="hoy-last" data-page="${last.id}"><span class="hoy-last-k">Lo dejaste aquí</span><b>${esc(pageTitle(last))}</b>${icon('chevron-right', { size: 16 })}</button>`;
}

// «Lo que flojea»: los apartados de tus apuntes que te cuestan o toca repasar
function weakHTML() {
  const rows = weakSections();
  if (!rows.length) return '';
  const shown = rows.slice(0, WEAK_SHOWN);
  const items = shown.map(r => {
    // Una lista con preguntas sueltas: su nombre, su carpeta y cuántas te cuestan
    if (r.deck) {
      const at = folderPath(S.folders, r.deck.folder_id).map(f => f.name).join(' › ');
      return `<li><button class="hoy-weak st-weak" data-open="${r.deck.id}">
      <i class="hoy-dot" aria-hidden="true"></i><span class="hoy-weak-t"><b>${esc(r.deck.name)}</b>${at ? `<small>${esc(at)}</small>` : ''}</span>
      <span class="hoy-pill">${r.hard === 1 ? '1 te cuesta' : `${r.hard} te cuestan`}</span></button></li>`;
    }
    const where = [...folderPath(S.folders, r.page.folder_id).map(f => f.name), ...(r.block ? [pageTitle(r.page)] : [])].join(' › ');
    const title = r.block ? plain(r.block.text).trim() || pageTitle(r.page) : pageTitle(r.page);
    return `<li><button class="hoy-weak st-${r.status}" data-open-page="${r.page.id}" data-open-block="${r.block?.id || ''}">
      <i class="hoy-dot" aria-hidden="true"></i><span class="hoy-weak-t"><b>${esc(title)}</b>${where ? `<small>${esc(where)}</small>` : ''}</span>
      <span class="hoy-pill">${r.status === 'weak' ? (r.flojas.length === 1 ? '1 te cuesta' : `${r.flojas.length} te cuestan`) : `${r.flojas.length} por repasar`}</span></button></li>`;
  }).join('');
  // El botón repasa justo lo que dicen las píldoras de encima
  const n = new Set(shown.flatMap(r => r.flojas.map(c => c.id))).size;
  return `<section class="hoy-sec hoy-flojea" aria-labelledby="h-weak">
    <h2 class="hoy-t hoy-t-line" id="h-weak">Lo que flojea</h2>
    <ul class="hoy-weak-list">${items}</ul>
    ${n ? `<button class="pill-tint hoy-weak-go" data-start="weak">Repasar solo lo que flojea · ${n}</button>` : ''}
  </section>`;
}

// El examen más cercano del plan de estudio. Cerca (a 14 días o menos), cuántas necesitas al día
function examHTML() {
  const N = planNodes(), now = Date.now();
  const next = nextExam(N, S.decks, S.folders, now);
  if (!next) return '';
  const perDay = newPlan('all', { steady: true }), remaining = freshByDeck(c => S.decks.get(c.deck_id) && !S.decks.get(c.deck_id).archived);
  const ex = examStatus(next.key, { decks: S.decks, folders: S.folders, nodes: N, remaining, perDay, now });
  const d = new Date(next.exam + 'T12:00:00');
  const left = ex.days === 0 ? 'es hoy' : ex.days === 1 ? 'falta 1 día' : `faltan ${ex.days} días`;
  // Al día: las nuevas que pide el examen y los repasos de sus listas que tocan hoy.
  const ids = examDeckIds(next.key);
  const dueNow = [...S.cards.values()].filter(c => ids.has(c.deck_id) && S.progress.get(c.id)?.due <= now).length;
  // Si se reparte lo atrasado, sus repasos también van repartidos
  const b = backlog(), reviews = b ? Math.ceil(dueNow / daysLeft(b.until, now)) : dueNow;
  const need = ex.days >= 1 && ex.days <= EXAM_NEAR ? ex.need + reviews : 0;
  const [cls, say] = ex.late ? ['hoy-late', 'así no te da tiempo'] : need ? ['hoy-tight', `necesitas ${need === 1 ? '' : 'unas '}${need} al día`] : ex.tight ? ['hoy-tight', 'vas con el tiempo justo'] : ['hoy-ok', 'vas a buen ritmo'];
  return `<button class="hoy-exam" data-nav="plan">
    <span class="hoy-cal" aria-hidden="true"><i></i><b>${d.getDate()}</b></span>
    <span class="hoy-exam-t"><small>Examen de ${esc(examName(next.key))} · ${d.getDate()} ${MONTHS[d.getMonth()]}</small><b>${left}</b>
      <span class="${cls}">${say} · ver el plan</span></span>
    ${icon('chevron-right', { size: 18 })}</button>`;
}

// «mar 14» a partir de una clave AAAA-MM-DD
const fmtDay = k => { const d = new Date(k + 'T12:00:00'); return `${['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][d.getDay()]} ${d.getDate()}`; };
// «Tu actividad»: la racha, esta semana, el calendario de 6 meses y la meta diaria
function activityHTML() {
  const st = streaks(S.log);
  // El comodín de la semana: un día sin estudiar no corta la racha (ver streaks en charts.js). Sin racha no sale
  const fz = st.freeze.available ? 'Comodín de la semana disponible' : `Comodín usado el ${fmtDay(st.freeze.usedOn)}`;
  const week = weekDays().map(k => S.log[k] || 0), days = week.filter(Boolean).length, total = week.reduce((a, n) => a + n, 0);
  const goal = S.prefs.home.goal;
  const keys = [1, 2, 3, 4].map(l => `<i class="hm-key l${l}"></i>`).join('');
  return `<section class="hoy-sec hoy-act" aria-labelledby="h-act">
    <div class="hoy-h"><h2 class="hoy-t" id="h-act">Tu actividad</h2><span class="hoy-note">últimos 6 meses</span></div>
    <p class="hoy-streak"><span>${icon(st.current ? 'racha' : 'racha-apagada', { size: 16, cls: 'flame' })} Racha de ${plural(st.current, 'día', 'días')}</span>${st.current ? `<span class="st-freeze" title="Si un día no estudias, la racha sigue: un comodín por semana, para un día suelto">${icon('comodin', { size: 16 })} ${fz}</span>` : ''}</p>
    <p class="hoy-week">esta semana: ${plural(days, 'día', 'días')} · ${plural(total, 'pregunta', 'preguntas')}</p>
    <div id="hmHost" class="hm-host"></div>
    <div class="hoy-hm-foot">
      <span>${goal > 0 ? `Meta: <b>${goal} al día</b> · <button class="link" data-act="goal-change">cambiar</button>` : `Sin meta diaria · <button class="link" data-act="goal-change">poner una</button>`}</span>
      <span class="hoy-key">nada <i class="hm-key l0"></i> · ${keys}${goal > 0 ? ' <i class="hm-key hm-key-goal"></i> · meta' : ''}</span>
    </div>
  </section>`;
}

// Calendario de actividad: los últimos 6 meses, con los días en que llegaste a la meta
export function drawHeatmap() {
  const host = $('#hmHost');
  if (!host) return;
  heatmapView(host, S.log, 'm6', Math.floor(host.clientWidth) + 28, streaks(S.log).frozen, { goal: S.prefs.home.goal, below: true });
  scrollChartsToEnd(host);
}
// Cómo va lo que sabes: consolidadas, jóvenes y por aprender (lo que estás aprendiendo cuenta como por aprender)
export function drawProgress({ animate = true } = {}) {
  const host = $('#pgHost');
  if (!host) return;
  const cards = cardList(), period = S.prefs.home.progressPeriod || 'm3';
  const series = progressSeries({ events: S.events, cards, progress: S.progress, period }).map(x => ({ ...x, m1: 0 }));
  progressView(host, {
    series, width: Math.max(280, innerW(host)), title: 'Cómo va lo que sabes', animate,
    tabs: '<span class="hoy-note">todas las carpetas</span>', deckName: id => S.decks.get(id)?.name || '',
  });
  host.querySelector('.lv-k')?.setAttribute('id', 'h-pg');
}

let resizeT;
window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (S.view === 'home') { drawHeatmap(); drawProgress({ animate: false }); } if (S.view === 'stats' && statsData) drawStats(main, statsData); }, 150); });
