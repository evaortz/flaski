// Flaski · pantalla Hoy (sale de app.js)
import { drawStats } from '../stats.js';
import { heatmapView, progressSeries, progressView, innerW, streaks, scrollChartsToEnd } from '../charts.js';
import { icon } from '../icons.js';
import { folderPath } from '../org.js';
import { pageTitle, STATUS, isEmptyPage } from '../pages.js';
import { weekDays } from '../friends.js';
import { $, main, S, esc, plain, cardList, weakSections, WEAK_SHOWN, daysAway } from '../comun.js';
import { plural } from './mazos.js';
import { statsData, pushAskHTML } from './perfil.js';
import { homeFriendsHTML } from './amigos.js';
import { shortSize, todayQueue, freshLeft, dayDone, restLink } from './estudio.js';
import { openSheet } from './editor.js';
import { TANDA_MINUTES } from '../tanda.js';
import { heroHTML as p2Hero, examCardHTML as p2Exam, lateRowHTML } from './plan-tiempo.js';
import { keepWeekSnap, weekAuto, sundayOn, sundayFreeHTML, sundayStudyHTML } from './plan-semana.js';
import { todayPlan } from '../plan2-app.js';
import { go } from '../app.js';


/* ===================== Hoy ===================== */
export function renderHome() {
  if (S.decks.size === 0) {
    main.innerHTML = `<div class="panel">
      <h1>Hola${S.name ? ', ' + esc(S.name) : ''}</h1>
      <p>Todavía no tienes listas. Puedes empezar con una ya hecha o crear la tuya.</p>
      <div class="btnrow"><button class="primary" data-nav="explore">Ver listas para empezar</button><button class="ghost" data-act="new-deck">Crear una lista</button></div></div>`;
    return;
  }
  // Lo previsto de la semana (para el domingo) y, si vas 2 días o más por detrás, el Repaso de la semana
  keepWeekSnap();
  if (weekAuto()) return go('week');
  // Lo de hoy, con las cuentas del plan (plan2.js): la tanda, «Hecho por hoy», el día libre o la pausa
  const sunday = sundayOn(), free = sunday && todayPlan().rest;
  const q = todayQueue('all'), H = S.prefs.home;
  const back = daysAway() >= 3, hi = `Hola${back ? ' de nuevo' : ''}${S.name ? (back ? ', ' : ' ') + esc(S.name) : ''}`;
  const fresh = q.ids.length ? 0 : Math.min(10, freshLeft('all'));
  const done = dayDone();
  main.innerHTML = `
    <div class="home-l">
    <section class="hero" aria-label="Hoy">
      ${free ? sundayFreeHTML(lateRowHTML()) : done ? doneHTML(done, q) : p2Hero({ hi, back, fresh })}
    ${lastPageHTML()}
    </section>
    ${sunday && !free ? sundayStudyHTML() : ''}
    ${weakHTML()}
    ${p2Exam({ simBtn: !sunday })}
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

// «Hecho por hoy»: lo que has hecho y, si queda algo, la otra tanda como enlace (lo que quede pasa a mañana)
const doneHTML = (done, q) => `<h1 class="hero-hi hero-done">Hecho por hoy</h1>
      <p class="day-done">${plural(done.n, 'pregunta', 'preguntas')} · ${done.minutes} min</p>
      ${q.ids.length ? `<p class="day-next">Lo que queda pasa a mañana. ${restLink(q)}</p>` : ''}`;
// Hoja «¿Cuánto suele durar tu rato de estudio?»: la primera tanda y «Tanda de N min»
const TANDA_LABELS = { 5: 'una parada o dos', 10: 'un trayecto corto', 15: 'un trayecto medio', 20: 'un trayecto largo' };
export function tandaSheet() {
  const cur = S.prefs.study.tandaMin;
  openSheet(`<div class="tanda-dur"><h2>¿Cuánto suele durar tu rato de estudio?</h2>
    <p class="muted">Haremos tandas que quepan justo. Se ajustan solas a tu ritmo.</p>
    <div class="tanda-opts" role="group" aria-label="Duración de la tanda">${TANDA_MINUTES.map(m => `<button type="button" class="tanda-opt" data-tanda-min="${m}" aria-pressed="${m === cur}">
      <b>${m} min</b><span>${TANDA_LABELS[m]}</span><small>unas ${shortSize(m)} preguntas</small></button>`).join('')}</div>
    <p class="muted small tanda-note">Lo cambias cuando quieras en Ajustes.</p>
    <button class="primary big" data-act="tanda-go">Empezar · ${cur} min</button></div>`);
}

// «Lo dejaste aquí»: el último apunte que editaste, para seguir con él
function lastPageHTML() {
  const used = new Set(cardList().map(c => c.page_id));
  const last = [...S.pages.values()].filter(p => !isEmptyPage(p, used.has(p.id))).sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))[0];
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
