// Flaski · pantalla Hoy (sale de app.js)
import { drawStats } from '../stats.js';
import { heatmapView, progressSeries, progressView, innerW, streaks, scrollChartsToEnd } from '../charts.js';
import { icon } from '../icons.js';
import { folderPath } from '../org.js';
import { pageTitle, STATUS } from '../pages.js';
import { examStatus, daysTo } from '../plan.js';
import { weekDays } from '../friends.js';
import { $, main, S, esc, plain, cardList, capNote, counts, newPlan, freshByDeck, planNodes, scopeDecks, weakSections } from '../comun.js';
import { plural } from './mazos.js';
import { statsData, pushAskHTML } from './perfil.js';
import { homeFriendsHTML } from './amigos.js';

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
  const all = counts('all');
  const avail = all.due + all.newToday;
  const H = S.prefs.home;
  const folders = pendingFolders();
  main.innerHTML = `
    <div class="home-l">
    <section class="hero" aria-label="Hoy">
      <h1 class="hero-hi">Hola${S.name ? ' ' + esc(S.name) : ''}${avail ? ', hoy tienes' : ''}</h1>
      <div class="hero-row">
        <div class="hero-num">${avail}</div>
        <div class="hero-side">
          <span class="hero-word">${avail ? (avail === 1 ? 'pregunta!' : 'preguntas!') : 'al día'}</span>
          <span class="hero-band">para hoy</span>
          ${avail ? `<span>${all.due} por repasar</span><span>${plural(all.newToday, 'nueva', 'nuevas')}${folders ? ` · ${plural(folders, 'carpeta', 'carpetas')}` : ''}</span>` : ''}
        </div>
      </div>
      ${avail
        ? `<button class="primary big hero-go" data-start="all">Empezar una tanda</button>${capNote(all)}`
        : `<p class="muted">${all.dueAll > all.due ? 'Has llegado al límite de repasos de hoy.' : 'Estás al día. Vuelve mañana o aprende alguna nueva.'}</p>${capNote(all)}
           <button class="ghost big" data-act="more">Estudiar 10 nuevas más</button>`}
      ${lastPageHTML()}
    </section>
    ${weakHTML()}
    </div>
    <div class="home-r">
    ${pushAskHTML()}
    ${examHTML()}
    ${H.forecast ? '<section class="hoy-sec lv pg-card" id="pgHost" aria-labelledby="h-pg"></section>' : ''}
    ${H.activity ? activityHTML() : ''}
    ${homeFriendsHTML()}
    </div>`;
  drawHeatmap();
  drawProgress();
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
  const label = st => STATUS.find(s => s.id === st)?.label.toLowerCase() || '';
  const items = rows.slice(0, 3).map(r => {
    const where = [...folderPath(S.folders, r.page.folder_id).map(f => f.name), ...(r.block ? [pageTitle(r.page)] : [])].join(' › ');
    const title = r.block ? plain(r.block.text).trim() || pageTitle(r.page) : pageTitle(r.page);
    return `<li><button class="hoy-weak st-${r.status}" data-open-page="${r.page.id}" data-open-block="${r.block?.id || ''}">
      <i class="hoy-dot" aria-hidden="true"></i><span class="hoy-weak-t"><b>${esc(title)}</b>${where ? `<small>${esc(where)}</small>` : ''}</span>
      <span class="hoy-pill">${label(r.status)}</span></button></li>`;
  }).join('');
  const c = counts('weak'), n = c.due + c.newToday;
  return `<section class="hoy-sec hoy-flojea" aria-labelledby="h-weak">
    <h2 class="hoy-t hoy-t-line" id="h-weak">Lo que flojea</h2>
    <ul class="hoy-weak-list">${items}</ul>
    ${n ? `<button class="pill-tint hoy-weak-go" data-start="weak">Repasar solo lo que flojea · ${n}</button>` : ''}
  </section>`;
}

// El examen más cercano del plan de estudio
function examHTML() {
  const N = planNodes(), now = Date.now();
  const next = Object.entries(N).map(([key, n]) => ({ key, exam: n?.exam, days: daysTo(n?.exam, now) }))
    .filter(x => x.days != null && x.days >= 0 && (x.key.startsWith('f:') ? S.folders.has(x.key.slice(2)) : S.decks.has(x.key)))
    .sort((a, b) => a.days - b.days)[0];
  if (!next) return '';
  const perDay = newPlan('all', { steady: true }), remaining = freshByDeck(c => S.decks.get(c.deck_id) && !S.decks.get(c.deck_id).archived);
  const ex = examStatus(next.key, { decks: S.decks, folders: S.folders, nodes: N, remaining, perDay, now });
  const name = next.key.startsWith('f:') ? S.folders.get(next.key.slice(2)).name : S.decks.get(next.key).name;
  const d = new Date(next.exam + 'T12:00:00');
  const left = ex.days === 0 ? 'es hoy' : ex.days === 1 ? 'falta 1 día' : `faltan ${ex.days} días`;
  return `<button class="hoy-exam" data-nav="plan">
    <span class="hoy-cal" aria-hidden="true"><i></i><b>${d.getDate()}</b></span>
    <span class="hoy-exam-t"><small>Examen de ${esc(name)} · ${d.getDate()} ${MONTHS[d.getMonth()]}</small><b>${left}</b>
      <span class="${ex.late ? 'hoy-late' : 'hoy-ok'}">${ex.late ? 'así no te da tiempo' : 'vas a buen ritmo'} · ver el plan</span></span>
    ${icon('chevron-right', { size: 18 })}</button>`;
}

// «Tu actividad»: esta semana, el calendario de 6 meses y la meta diaria
function activityHTML() {
  const week = weekDays().map(k => S.log[k] || 0), days = week.filter(Boolean).length, total = week.reduce((a, n) => a + n, 0);
  const goal = S.prefs.home.goal;
  const keys = [1, 2, 3, 4].map(l => `<i class="hm-key l${l}"></i>`).join('');
  return `<section class="hoy-sec hoy-act" aria-labelledby="h-act">
    <div class="hoy-h"><h2 class="hoy-t" id="h-act">Tu actividad</h2><span class="hoy-note">últimos 6 meses</span></div>
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
