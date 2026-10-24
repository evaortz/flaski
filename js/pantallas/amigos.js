// Flaski · amigos (sale de app.js)
import * as api from '../api.js';
import { dateKey } from '../srs.js';
import { icon } from '../icons.js';
import { LANGS, baseLang } from '../cardtypes.js';
import { formatCode, cleanCode, inviteLink, WEEK_LETTERS, weekTotal, weekDays, ranking, initial } from '../friends.js';
import { streaks } from '../charts.js';
import { $, main, S, esc, toast, errMsg, fail, counts } from '../comun.js';
import { plural, crumbs } from './mazos.js';
import { openSheet } from './editor.js';

/* ===================== amigos ===================== */
// Se cargan aparte de lo demás (no retrasan la app) y se refrescan como mucho una vez por minuto
const FR = () => S.friends || (S.friends = { me: null, list: [], requests: [], cheers: [], loaded: false, missing: false, error: '', at: 0 });
export async function loadFriends(force = false) {
  if (!api.social || !S.uid || S.fromCache) return;
  const f = FR();
  if (!force && f.at && Date.now() - f.at < 60e3) return;
  f.at = Date.now();
  try {
    const [me, list, requests, cheers] = await Promise.all([api.social.me(), api.social.summary(dateKey()), api.social.requests(), api.social.cheers()]);
    Object.assign(f, { me, list: list || [], requests: requests || [], cheers: cheers || [], missing: false, error: '' });
  } catch (e) {
    if (api.social.isMissingFn(e)) f.missing = true; else f.error = errMsg(e);
  }
  f.loaded = true;
  friendsChanged();
}
// Repinta lo que muestra amigos (la pantalla de amigos, la tarjeta de Inicio y el aviso en Perfil)
export function friendsChanged() {
  if (S.view === 'friends') return renderFriends();
  const el = $('#homeFriends');
  if (el && S.view === 'home') el.outerHTML = homeFriendsHTML();
  const badge = $('#frBadge');
  if (badge) { const n = incoming().length; badge.textContent = n; badge.hidden = !n; }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') loadFriends(); });
export const incoming = () => (S.friends?.requests || []).filter(r => r.dir === 'in');
// Ánimos ya mandados hoy (para no ofrecer otro al mismo amigo)
function cheeredToday() {
  try { const c = JSON.parse(localStorage.getItem('flaski-cheered') || 'null'); return c?.day === dateKey() ? new Set(c.ids) : new Set(); } catch { return new Set(); }
}
export function markCheered(id) {
  const ids = cheeredToday(); ids.add(id);
  try { localStorage.setItem('flaski-cheered', JSON.stringify({ day: dateKey(), ids: [...ids] })); } catch {}
}
const avatar = (name, me = false) => `<span class="fr-av${me ? ' me' : ''}" aria-hidden="true">${esc(initial(name))}</span>`;
const langNames = langs => (langs || []).map(b => LANGS.find(l => baseLang(l.id) === b)?.label.split(' (')[0] || b);

// Barras de la semana (lunes a domingo); hoy, marcado
function weekBars(week) {
  const max = Math.max(1, ...week.map(n => Number(n) || 0)), today = (new Date().getDay() + 6) % 7;
  return `<div class="fr-week" aria-label="Repasos de esta semana">${week.map((n, i) => `<span class="fr-day${i === today ? ' today' : ''}${n ? ' on' : ''}" title="${WEEK_LETTERS[i]}: ${plural(n || 0, 'repaso', 'repasos')}">
    <i style="height:${n ? Math.max(12, Math.round((n / max) * 100)) : 0}%"></i><small>${WEEK_LETTERS[i]}</small></span>`).join('')}</div>`;
}

// Ánimos: lo que se ve de cada tipo (los tres que guarda Supabase)
export const CHEERS = [['clap', '¡Ánimo!'], ['go', '¡Tú puedes!'], ['fire', icon('racha', { size: 18, label: 'Fuego' })]];
const cheerText = kind => (CHEERS.find(c => c[0] === kind) || CHEERS[0])[1];

// «Tus amigos» en Hoy: el último ánimo recibido y la clasificación de la semana, con un «¡Ánimo!» para quien no ha estudiado hoy
export function homeFriendsHTML() {
  const f = S.friends;
  if (!api.social || !f?.loaded || f.missing || !S.prefs.home.friends) return '<div id="homeFriends"></div>';
  const head = '<div class="hoy-h"><h2 class="hoy-t" id="h-fr">Tus amigos</h2><button class="link" data-nav="friends">Ver amigos</button></div>';
  if (!f.list.length) {
    return `<section id="homeFriends" class="hoy-sec hoy-fr" aria-labelledby="h-fr">${head}
      <p class="muted small">Invita a alguien y veréis vuestras rachas y quién repasa más cada semana.</p>
      <button class="ghost small-btn" data-nav="friends">${icon('users', { size: 16 })} Invitar a un amigo</button></section>`;
  }
  const c = f.cheers[0];
  const cheer = c ? `<div class="hoy-cheer" role="status">${icon('heart', { size: 18 })}
    <span><b>${esc(c.name || 'Alguien')}</b> te dice: «${cheerText(c.kind)}»</span><button class="link hoy-thanks" data-act="cheers-seen">Gracias</button></div>` : '';
  // Clasificación de la semana: tú y quien comparte su actividad; debajo, sin puesto, quien no la comparte
  const today = dateKey(), days = weekDays(), cheered = cheeredToday();
  const me = { id: '', me: true, name: S.name, shared: true, week: days.map(k => S.log[k] || 0), streak: streaks(S.log).current, today: S.log[today] || 0 };
  const ranked = ranking(me, f.list), rest = f.list.filter(x => !x.shared);
  const top = ranked.slice(0, 5);
  if (!top.some(p => p.me)) top.push(ranked.find(p => p.me));
  const rows = [...top, ...rest].slice(0, Math.max(6, top.length));
  return `<section id="homeFriends" class="hoy-sec hoy-fr" aria-labelledby="h-fr">${head}${cheer}
    <div class="frow-head" aria-hidden="true"><span>esta semana</span><span>racha</span><span>hoy</span></div>
    <ol class="frows">${rows.map(p => friendRow(p, cheered)).join('')}</ol></section>`;
}
// Una fila: puesto, avatar, nombre y preguntas de la semana, los 7 días, la racha y, a la derecha, hoy
function friendRow(p, cheered) {
  const right = p.shared && p.today ? `<span class="frow-ok">${icon('check', { size: 14 })} hoy</span>`
    : p.me ? (pendingToday() ? '<button type="button" class="frow-cheer" data-act="tanda-short">¡Te toca!</button>' : '')
    : cheered.has(p.id) ? `<span class="frow-sent">${icon('heart', { size: 14 })} enviado</span>`
    : `<button type="button" class="frow-cheer" data-cheer="${p.id}" data-cheer-kind="clap" aria-label="Animar a ${esc(p.name || 'tu amigo')}">¡Ánimo!</button>`;
  return `<li class="frow${p.me ? ' me' : ''}"><span class="frow-pos">${p.pos || ''}</span>${avatar(p.name, p.me)}
    <span class="frow-t"><span class="frow-n"><b>${p.me ? 'Tú' : esc(p.name || 'Sin nombre')}</b>${p.shared ? ` · ${plural(weekTotal(p.week), 'pregunta', 'preguntas')}` : ''}</span>${p.shared ? weekDots(p.week) : ''}</span>
    <span class="frow-st">${p.shared ? `${icon(p.streak ? 'racha' : 'racha-apagada', { size: 14 })}<b${p.streak ? '' : ' class="off"'}>${p.streak || 0}</b>` : '<span class="off">—</span>'}</span>
    <span class="frow-hoy">${right}</span></li>`;
}
// Si aún te queda algo para hoy, tu fila ofrece empezar una tanda
const pendingToday = () => { const c = counts('all'); return c.due + c.newToday > 0; };
// Los 7 días de la semana: relleno si estudió, anillo en hoy; los que aún no han llegado, tenues
function weekDots(week) {
  const t = (new Date().getDay() + 6) % 7;
  return `<span class="frow-week" aria-label="Días que ha estudiado esta semana: ${(week || []).filter(Boolean).length}">${Array.from({ length: 7 }, (_, i) =>
    `<i class="${[(week || [])[i] ? 'on' : '', i === t ? 'today' : '', i > t ? 'next' : ''].filter(Boolean).join(' ')}"></i>`).join('')}</span>`;
}

export function renderFriends() {
  const head = `<nav class="crumbs" aria-label="Ruta"><button class="crumb" data-nav="profile">Perfil</button><span class="sep" aria-hidden="true">/</span><span class="crumb crumb-cur">Amigos</span></nav><h1>Amigos</h1>`;
  if (!api.social) {
    main.innerHTML = `${head}<div class="panel"><p>Para tener amigos necesitas una cuenta.</p>
      <p class="muted small">Ahora estás en modo local: tus datos están solo en este navegador. Conecta la app a Supabase (ver README) para crear cuentas.</p></div>`;
    return;
  }
  const f = FR();
  if (!f.loaded && S.fromCache) { main.innerHTML = `${head}<div class="panel"><p>Sin conexión. Tus amigos aparecerán cuando vuelva la red.</p></div>`; return; }
  if (!f.loaded) { loadFriends(true); main.innerHTML = `${head}<div class="empty"><div class="spin" aria-label="Cargando"></div></div>`; return; }
  if (f.missing) {
    main.innerHTML = `${head}<div class="panel"><h2>Falta un paso</h2><p>Para usar amigos, ejecuta otra vez <b>supabase/schema.sql</b> en Supabase (SQL Editor → New query → Run).</p>
      <button class="ghost" data-act="friends-reload">Ya lo he hecho</button></div>`;
    return;
  }
  if (!f.me) {
    main.innerHTML = `${head}<div class="panel"><p>${esc(f.error || 'No se han podido cargar tus amigos.')}</p><button class="ghost" data-act="friends-reload">Reintentar</button></div>`;
    return;
  }
  const cheered = cheeredToday();
  const inc = incoming(), out = f.requests.filter(r => r.dir === 'out'), blocked = f.requests.filter(r => r.dir === 'blocked');
  const card = p => {
    const total = weekTotal(p.week);
    const langs = langNames(p.langs);
    return `<li class="fr-card">
      <div class="fr-top">${avatar(p.name)}<div class="fr-who"><b>${esc(p.name || 'Sin nombre')}</b>
        ${p.shared ? `<span class="fr-meta"><span class="fr-streak">${icon(p.streak ? 'racha' : 'racha-apagada', { size: 14 })} ${plural(p.streak, 'día', 'días')}</span>
          <span class="${p.today ? 'fr-today' : 'muted'}">${p.today ? `${icon('check', { size: 13 })} Hoy, ${plural(p.today, 'repaso', 'repasos')}` : 'Hoy aún no ha estudiado'}</span></span>`
          : '<span class="fr-meta muted">No comparte su actividad</span>'}</div>
        <button type="button" class="iconbtn" data-friend-menu="${p.id}" aria-label="Opciones de ${esc(p.name)}" title="Opciones">${icon('ellipsis', { size: 18 })}</button></div>
      ${p.shared ? `${weekBars(p.week)}<div class="fr-foot"><span class="muted small">${plural(total, 'repaso', 'repasos')} esta semana${langs.length ? ` · ${esc(langs.join(', '))}` : ''}</span>
        <button type="button" class="ghost small-btn" data-cheer="${p.id}" ${cheered.has(p.id) ? 'disabled' : ''}>${cheered.has(p.id) ? 'Ánimo enviado' : '👏 Animar'}</button></div>` : ''}
    </li>`;
  };
  const link = inviteLink(f.me.code);
  main.innerHTML = `${head}
    <section class="panel fr-invite">
      <h2>Invita a tus amigos</h2>
      <p class="muted small">Pásales tu enlace o tu código. Cuando lo acepten, veréis vuestras rachas y los repasos de la semana; nunca vuestras listas ni apuntes.</p>
      <div class="fr-code"><span class="muted small">Tu código</span><b id="frMyCode">${esc(formatCode(f.me.code))}</b></div>
      <div class="btnrow"><button class="primary" data-act="fr-share" data-link="${esc(link)}">${icon('share', { size: 16 })} Compartir enlace</button>
        <button class="ghost" data-act="fr-copy-code">${icon('copy', { size: 16 })} Copiar código</button></div>
      <form data-form="add-friend" class="fr-add" autocomplete="off"><label for="frCode">Añadir con el código de un amigo</label>
        <div class="fr-addrow"><input id="frCode" placeholder="XXXX-XXXX" maxlength="12" autocapitalize="characters" spellcheck="false"><button class="ghost" type="submit">Añadir</button></div></form>
    </section>
    ${inc.length ? `<div class="section-h"><h2>Peticiones</h2></div><ul class="list fr-reqs">${inc.map(r => `<li class="fr-req">${avatar(r.name)}<span><b>${esc(r.name || 'Alguien')}</b> <span class="muted small">quiere ser tu amigo</span></span>
      <span class="btnrow"><button class="primary small-btn" data-fr-accept="${r.id}">Aceptar</button><button class="ghost small-btn" data-fr-reject="${r.id}">Rechazar</button></span></li>`).join('')}</ul>` : ''}
    <div class="section-h"><h2>Tus amigos${f.list.length ? ` · ${f.list.length}` : ''}</h2></div>
    ${f.list.length ? `<ul class="fr-list">${[...f.list].sort((a, b) => weekTotal(b.week) - weekTotal(a.week)).map(card).join('')}</ul>`
      : '<p class="muted">Aún no tienes amigos en Flaski. Comparte tu enlace para empezar.</p>'}
    ${out.length ? `<div class="section-h"><h2>Enviadas</h2></div><ul class="list fr-reqs">${out.map(r => `<li class="fr-req">${avatar(r.name)}<span><b>${esc(r.name || 'Alguien')}</b> <span class="muted small">pendiente</span></span>
      <span class="btnrow"><button class="ghost small-btn" data-fr-cancel="${r.other}">Cancelar</button></span></li>`).join('')}</ul>` : ''}
    <section class="panel fr-privacy"><h2>Privacidad</h2>
      <div class="set-row"><div class="set-l"><b id="frShareL">Compartir mi actividad</b><small>Tus amigos ven tu racha, tus repasos de la semana y los idiomas que estudias.</small></div>
        <div class="set-c"><label class="switch"><input type="checkbox" role="switch" id="frShare" aria-labelledby="frShareL" ${f.me.share ? 'checked' : ''}><span class="slider" aria-hidden="true"></span></label></div></div>
      ${blocked.length ? `<p class="small" style="margin-bottom:4px"><b>Bloqueados</b></p><ul class="list fr-reqs">${blocked.map(r => `<li class="fr-req">${avatar(r.name)}<span>${esc(r.name || 'Alguien')}</span>
        <span class="btnrow"><button class="ghost small-btn" data-fr-unblock="${r.other}">Desbloquear</button></span></li>`).join('')}</ul>` : ''}
    </section>`;
  loadFriends();
}
// Acciones de amigos: cada una llama a Supabase y vuelve a cargar la lista
export async function friendAction(fn, ok) {
  try { await fn(); if (ok) toast(ok); } catch (e) { return fail(e); }
  await loadFriends(true);
}
const ADD_MSG = {
  sent: 'Petición enviada. Cuando la acepte, aparecerá en tu lista.', accepted: '¡Ya sois amigos!', already: 'Ya sois amigos',
  pending: 'Ya le habías enviado una petición', self: 'Ese es tu propio código', not_found: 'No hay nadie con ese código', blocked: 'No se puede añadir a esa persona',
};
export async function addFriend(raw) {
  const code = cleanCode(raw);
  if (!code) return toast('El código tiene 8 letras o números, como ABCD-1234');
  try { const r = await api.social.request(code); toast(ADD_MSG[r] || 'Hecho'); } catch (e) { return fail(e); }
  const inp = $('#frCode'); if (inp) inp.value = '';
  await loadFriends(true);
}
export function friendMenu(id) {
  const p = S.friends?.list.find(x => x.id === id);
  if (!p) return;
  openSheet(`<h2>${esc(p.name || 'Amigo')}</h2>
    <p class="muted small">Amigos desde el ${new Date(p.since).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}.</p>
    <div class="btnrow" style="flex-direction:column;align-items:stretch">
      <button class="ghost" data-fr-remove="${p.id}">Quitar de amigos</button>
      <button class="ghost danger" data-fr-block="${p.id}">Bloquear</button>
      <button class="primary" data-act="close-sheet">Cerrar</button></div>
    <p class="muted small">Si lo bloqueas, deja de ver tu actividad y no puede volver a pedirte amistad.</p>`);
}
// Al abrir un enlace de invitación
export function inviteSheet(code) {
  if (!api.social) return toast('Para añadir amigos necesitas una cuenta');
  openSheet(`<h2>Te han invitado a Flaski</h2>
    <p>Alguien quiere estudiar contigo. Si aceptas, os aparecerá la racha y los repasos de la semana del otro.</p>
    <p class="muted small">Código de la invitación: <b>${esc(formatCode(code))}</b></p>
    <div class="btnrow"><span class="spacer"></span><button class="ghost" data-act="close-sheet">Ahora no</button><button class="primary" data-act="fr-accept-invite" data-code="${esc(code)}">Aceptar la invitación</button></div>`);
}
