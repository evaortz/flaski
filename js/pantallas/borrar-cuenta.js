// Flaski · borrar la cuenta: una pantalla de tres pasos (descargar la copia, lo que se borra y escribir BORRAR)
// y, al terminar, «Tu cuenta se ha borrado». Si algo falla, se dice y la sesión sigue abierta.
import * as api from '../api.js';
import { icon } from '../icons.js';
import { dateKey } from '../srs.js';
import { streaks } from '../charts.js';
import { deleteSnapshot, forgetUser } from '../snapshot.js';
import { $, main, S, esc, errMsg } from '../comun.js';
import { plural, download } from './mazos.js';
import { backupData } from './perfil.js';
import { render } from '../app.js';

const MARK = '<svg class="bye-mark" viewBox="8 8 84 84" fill="currentColor" aria-hidden="true"><circle cx="18" cy="18" r="8.20"/><circle cx="34" cy="18" r="7.30" opacity=".92"/><circle cx="50" cy="18" r="6.40" opacity=".84"/><circle cx="66" cy="18" r="5.50" opacity=".76"/><circle cx="82" cy="18" r="4.60" opacity=".68"/><circle cx="18" cy="34" r="7.30" opacity=".92"/><circle cx="18" cy="50" r="6.40" opacity=".84"/><circle cx="34" cy="50" r="5.50" opacity=".76"/><circle cx="50" cy="50" r="4.60" opacity=".68"/><circle cx="66" cy="50" r="3.70" opacity=".6"/><circle cx="18" cy="66" r="5.50" opacity=".76"/><circle cx="18" cy="82" r="4.60" opacity=".68"/></svg>';
const B = () => S.bye || (S.bye = { file: '', error: '', busy: false });
// Lo que hay (también lo que está en la papelera)
function counts() {
  const tr = [...(S.trash?.values() || [])];
  const decks = S.decks.size + tr.reduce((n, e) => n + e.decks.length, 0), pages = S.pages.size + tr.reduce((n, e) => n + e.pages.length, 0);
  const cards = S.cards.size + tr.reduce((n, e) => n + e.cards.length, 0);
  return [['Listas', decks], ['Apuntes', pages], ['Preguntas y su progreso', cards], ['Simulacros', (S.prefs.sims || []).filter(s => !s.deleted).length],
    ['Racha', plural(streaks(S.log).current, 'día', 'días')], ...(api.social ? [['Amigos', S.friends?.list?.length || 0]] : [])];
}
export function renderBye() {
  const b = B();
  const step = (n, done, title, body) => `<li class="bye-step${done ? ' done' : ''}"><span class="bye-n">${done ? icon('check', { size: 18 }) : n}</span><div><b>${title}</b>${body}</div></li>`;
  main.innerHTML = `<div class="bye-page"><div class="crumbs-row"><button class="back-round" data-nav="settings" aria-label="Volver a Ajustes">${icon('chevron-left', { size: 22 })}</button><button class="link crumb-link" data-nav="settings">Ajustes › Datos</button></div>
    <h1>Borrar tu cuenta</h1>
    <p class="muted">Antes de seguir, guarda lo que quieras conservar.</p>
    <ol class="bye-steps">
      ${step(1, !!b.file, 'Descarga tu copia', `<p class="muted small">Un archivo con todo. Si algún día vuelves, lo restauras y está todo como hoy.</p>
        <button type="button" class="${b.file ? 'bye-got' : 'ghost'}" data-bye="backup">${b.file ? `${icon('check', { size: 16 })} Descargada` : `${icon('download', { size: 16 })} Descargar`}</button>`)}
      ${step(2, false, 'Esto es lo que se borra', `<dl class="bye-box">${counts().map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
        <p class="muted small">${api.mode === 'local' ? 'Se borra todo lo de este navegador.' : 'Las listas que compartiste dejan de verse en Explorar. Tus amigos dejan de ver tu racha.'}</p>`)}
      ${step(3, false, 'Escribe BORRAR para confirmar', `<input id="byeWord" class="bye-word" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Escribe BORRAR para confirmar" placeholder="BORRAR">`)}
    </ol>
    ${b.error ? `<p class="bye-err" role="alert">${esc(b.error)}</p>` : ''}
    <button type="button" class="danger solid primary big bye-go" data-bye="go" disabled>${icon('trash-2', { size: 18 })} Borrar mi cuenta para siempre</button>
    <button type="button" class="link bye-no" data-nav="settings">Mejor no, volver</button></div>`;
}
// Al terminar: la pantalla blanca con el logo; «Cerrar» lleva a entrar (en local, a empezar de nuevo)
export function renderByeDone() {
  const f = S.byeDone?.file;
  main.innerHTML = `<div class="bye-done">${MARK}<h1>Tu cuenta se ha borrado</h1>
    <p>Hemos borrado todo lo tuyo.</p>
    ${f ? `<p>Gracias por estudiar con Flaski. Si vuelves, tu copia te espera en <b>${esc(f)}</b>.</p>` : '<p>Gracias por estudiar con Flaski.</p>'}
    <button type="button" class="ghost big" data-bye="close">Cerrar</button></div>`;
}
const ready = () => (($('#byeWord')?.value || '').trim().toUpperCase() === 'BORRAR');
document.addEventListener('input', e => { if (e.target.id === 'byeWord') { const g = $('[data-bye="go"]'); if (g) g.disabled = !ready() || B().busy; } });
document.addEventListener('click', async e => {
  const b = e.target.closest?.('[data-bye]');
  if (!b) return;
  const st = B();
  if (b.dataset.bye === 'backup') {
    const file = `flaski-copia-${dateKey()}.json`;
    download(JSON.stringify(await backupData(), null, 1), file, 'application/json');
    st.file = file;
    const word = $('#byeWord')?.value || '';
    renderBye(); const w = $('#byeWord'); if (w) { w.value = word; $('[data-bye="go"]').disabled = !ready(); }
    return;
  }
  if (b.dataset.bye === 'go') {
    if (!ready() || st.busy) return;
    st.busy = true; st.error = ''; b.disabled = true; b.lastChild.textContent = ' Borrando…';
    const uid = S.uid;
    try {
      await api.removeAllImages(uid);
      await api.deleteAccount();
    } catch (err) {
      // No se cierra la sesión ni se dice que se ha borrado
      st.busy = false; st.error = `No se ha podido borrar la cuenta: ${errMsg(err)}. No se ha cerrado tu sesión; inténtalo de nuevo.`;
      const word = $('#byeWord')?.value || '';
      renderBye(); const w = $('#byeWord'); if (w) { w.value = word; $('[data-bye="go"]').disabled = !ready(); }
      return;
    }
    S.byeDone = { file: st.file };
    S.bye = null;
    deleteSnapshot(uid).catch?.(() => {}); forgetUser();
    try { localStorage.removeItem('flaski-outbox:' + uid); } catch { /* sin almacenamiento */ }
    return render();
  }
  if (b.dataset.bye === 'close') {
    S.byeDone = null;
    if (api.mode === 'local') return location.reload();
    return render();
  }
});
