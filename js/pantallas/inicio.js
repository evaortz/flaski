// Flaski · pantalla de Inicio (sale de app.js)
import { dateKey } from '../srs.js';
import { drawStats } from '../stats.js';
import { heatmapView, HM_PERIODS, progressSeries, progressView, innerW, nextLine, PG_PERIODS, streaks, scrollChartsToEnd } from '../charts.js';
import { icon } from '../icons.js';
import { sortDecks } from '../org.js';
import { $, main, S, esc, cardList, deckIcon, deckName, capNote, counts, planMeta } from '../comun.js';
import { plural } from './mazos.js';
import { H } from './apuntes.js';
import { statsData, tabs, pushAskHTML } from './perfil.js';
import { homeFriendsHTML } from './amigos.js';
import { go } from '../app.js';

/* ===================== inicio ===================== */
export function renderHome() {
  if (S.decks.size === 0) {
    main.innerHTML = `<div class="panel">
      <h1>Hola${S.name ? ', ' + esc(S.name) : ''}</h1>
      <p>Todavía no tienes mazos. Puedes empezar con uno ya hecho o crear el tuyo.</p>
      <div class="btnrow"><button class="primary" data-nav="explore">Ver mazos para empezar</button><button class="ghost" data-act="new-deck">Crear un mazo</button></div></div>`;
    return;
  }
  const all = counts('all');
  const avail = all.due + all.newToday;
  const homeStats = new Map([...S.decks.values()].map(d => [d.id, counts(d.id)]));
  const decks = sortDecks([...S.decks.values()].filter(d => !d.archived), 'due', homeStats).map(d => {
    const c = homeStats.get(d.id); const n = c.due + c.newToday;
    return `<li><button class="deck" data-start="${d.id}" ${n ? '' : 'disabled'}>${deckIcon(d)}
      <span class="info"><span class="dname">${esc(d.name)}</span><span class="meta">${c.due} por repasar${c.dueAll > c.due ? ` (+${c.dueAll - c.due} tras el límite)` : ''} · ${c.newToday} nuevas · ${c.total} en total${planMeta(d)}</span></span>
      <span class="go">${n ? 'Estudiar' : c.total ? 'Al día' : 'Vacío'}</span></button></li>`;
  }).join('');
  const h = new Date().getHours();
  const hello = h < 6 ? 'Buenas noches' : h < 14 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
  const H = S.prefs.home;
  const st = streaks(S.log);
  // Meta diaria (Ajustes → Estudio diario): respuestas de hoy frente a la meta
  const doneToday = S.log[dateKey(Date.now())] || 0;
  const goal = H.goal > 0 ? `<div class="goal" aria-label="Meta diaria"><div class="goal-h"><span>Meta diaria</span><b>${doneToday >= H.goal ? `${icon('check', { size: 14 })} ` : ''}${Math.min(doneToday, H.goal)} / ${H.goal}</b></div>
      <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${H.goal}" aria-valuenow="${Math.min(doneToday, H.goal)}"><span style="width:${Math.min(100, Math.round((doneToday / H.goal) * 100))}%"></span></div></div>` : '';
  main.innerHTML = `
    <div class="home-l">
    <section class="hero" aria-label="Hoy">
      <h1 class="hero-hi">${hello}${S.name ? ', ' + esc(S.name) : ''}${avail ? ', tienes' : ''}</h1>
      <div class="hero-row">
        <div class="hero-num">${avail}</div>
        <div class="hero-side">
          <span class="hero-word">${avail ? (avail === 1 ? 'tarjeta!' : 'tarjetas!') : 'al día'}</span>
          <span class="hero-band">para hoy</span>
          ${avail ? `<span>${all.due} por repasar</span><span>${plural(all.newToday, 'nueva', 'nuevas')}</span>` : ''}
        </div>
      </div>
      ${avail
        ? `<button class="primary big hero-go" data-start="all">Empezar a estudiar</button>${capNote(all)}`
        : `<p class="muted">${all.dueAll > all.due ? 'Has llegado al límite de repasos de hoy.' : 'Estás al día. Vuelve mañana o aprende alguna nueva.'}</p>${capNote(all)}
           <button class="ghost big" data-act="more">Estudiar 10 nuevas más</button>`}
      ${goal}
    </section>
    </div>
    <div class="home-r">
    ${pushAskHTML()}
    ${homeFriendsHTML()}
    ${H.activity ? `<section class="chart-card lv" data-live aria-labelledby="h-act">
      <div class="lv-h"><h2 class="lv-k" id="h-act">Actividad<span class="lv-day"></span></h2>${tabs('home.activityPeriod', HM_PERIODS.map(p => [p.id, p.short]))}</div>
      <div class="lv-big"><b class="lv-n">${st.current}</b><span class="lv-of">${st.current === 1 ? 'día' : 'días'} de racha${st.current ? ` ${icon('fire', { size: 16, cls: 'flame' })}` : ''}</span></div>
      <p class="lv-sub" id="hmSum"></p>
      <div id="hmHost" class="hm-host"></div>
    </section>` : ''}
    ${H.forecast ? '<section class="chart-card lv pg-card" id="pgHost" aria-labelledby="h-pg"></section>' : ''}
    </div>
    ${H.decks ? `<div class="home-decks"><div class="section-h"><h2>Tus mazos</h2><button class="link small" data-nav="decks">ver todos</button></div>
    <ul class="list">${decks}</ul></div>` : ''}`;
  drawHeatmap();
  drawProgress();
}
// «mar 14» a partir de una clave AAAA-MM-DD
const fmtDay = k => { const d = new Date(k + 'T12:00:00'); return `${['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][d.getDay()]} ${d.getDate()}`; };
// Calendario de actividad: el periodo elegido (al cambiarlo, los cuadrados se recolocan con una transición)
export function drawHeatmap() {
  const host = $('#hmHost');
  if (!host) return;
  const st = streaks(S.log);
  const r = heatmapView(host, S.log, S.prefs.home.activityPeriod || 'y1', Math.floor(host.clientWidth), st.frozen);
  const sum = $('#hmSum');
  // El comodín de la semana: un día sin estudiar no corta la racha (ver streaks en charts.js)
  const fz = st.freeze.available ? 'Comodín de la semana disponible' : `Comodín usado el ${fmtDay(st.freeze.usedOn)}`;
  if (sum) sum.innerHTML = `<span class="st-freeze" title="Si un día no estudias, la racha sigue: un comodín por semana, para un día suelto">${icon('snowflake', { size: 14 })} ${fz}</span> · Mejor racha: ${plural(st.best, 'día', 'días')} · ${plural(r.active, 'día', 'días')} estudiando · ${plural(r.total, 'repaso', 'repasos')} en ${r.text}`;
  scrollChartsToEnd(host);
}
// Tu progreso: cuántas tarjetas te sabes cada día del periodo y lo que te queda por aprender
export function drawProgress({ animate = true } = {}) {
  const host = $('#pgHost');
  if (!host) return;
  const cards = cardList(), period = S.prefs.home.progressPeriod || 'm3';
  const focused = host.contains(document.activeElement) && document.activeElement.dataset.v;
  progressView(host, {
    series: progressSeries({ events: S.events, cards, progress: S.progress, period }),
    width: Math.max(280, innerW(host)), title: 'Tu progreso', animate,
    tabs: tabs('home.progressPeriod', PG_PERIODS.map(p => [p.id, p.label])),
    next: cards.length ? nextLine(cards, S.progress) : '', deckName: id => S.decks.get(id)?.name || '',
  });
  if (focused) host.querySelector(`[data-v="${focused}"]`)?.focus();
}

let resizeT;
window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (S.view === 'home') { drawHeatmap(); drawProgress({ animate: false }); } if (S.view === 'stats' && statsData) drawStats(main, statsData); }, 150); });
