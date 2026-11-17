// Japonés · el aviso de bienvenida a lo nuevo (niveles del JLPT): sale una vez a quien estudia japonés, al abrir la
// app y estando en Hoy (nunca encima de la bienvenida, las novedades u otra hoja, ni en plena tanda). Se recuerda en
// este navegador y en la cuenta (prefs.seen.ja, se sincroniza).
import { S } from '../comun.js';
import { openSheet } from './editor.js';
import { hasJapanese } from '../ja/saber.js';
import { levelPct } from './ja-nivel.js';
import { savePrefsSoon } from './perfil.js';

export const JA_INTRO = '2026-11-jlpt';
const KEY = 'flaski-ja-intro';
const seen = () => { let v = ''; try { v = localStorage.getItem(KEY) || ''; } catch { /* sin almacenamiento */ } return v === 'never' || v === JA_INTRO || S.prefs.seen?.ja === JA_INTRO; };
const busy = () => !!document.querySelector('.ob, .news') || S.view !== 'home' || !document.getElementById('sheet')?.hidden || !!S.session;

let wait = 0;
export function maybeJaIntro() {
  if (!S.uid || S.recovery || S.fromCache || !navigator.onLine || !hasJapanese() || seen()) return;
  if (busy()) {
    if (!wait) wait = setInterval(() => { if (busy()) return; clearInterval(wait); wait = 0; maybeJaIntro(); }, 700);
    return;
  }
  show();
}

async function show() {
  try { localStorage.setItem(KEY, JA_INTRO); } catch { /* sin almacenamiento */ }
  S.prefs.seen = { ...(S.prefs.seen || {}), ja: JA_INTRO };
  savePrefsSoon();
  const pct = await levelPct('n5').catch(() => null);
  if (busy()) return;
  const row = (k, cls, t, d) => `<li><span class="jin-ic ${cls}" lang="ja" aria-hidden="true">${k}</span><span><b>${t}</b><small>${d}</small></span></li>`;
  openSheet(`<div class="jin"><span class="jin-bg" lang="ja" aria-hidden="true">日本語</span>
    <h2 class="sheet-hand">¡Novedades de japonés!</h2>
    <p>Ahora Flaski sabe qué entra en el N5 y en el N4 del JLPT y cuánto llevas tú.</p>
    ${pct !== null ? `<div class="jin-pct"><b>${pct} %</b><span><span>del N5 ya lo sabes de verdad</span><span class="jin-bar" aria-hidden="true"><i style="width:${pct}%"></i></span></span></div>` : ''}
    <ul class="jin-list">
      ${row('試', 'c1', 'Prepárate el examen', 'Elige la convocatoria: lo que te falta entra en tu Plan, y si no llegas sube solo lo de cada día.')}
      ${row('文', 'c2', 'Toda la gramática del N5', '12 apuntes cortos con preguntas como las del examen, en Explorar.')}
      ${row('読', 'c3', 'Leer japonés de verdad', 'Pega un texto en un apunte y toca «Leer»: ves cuánto entiendes.')}
    </ul>
    <div class="jin-btns"><button class="primary big" data-act="ja-nivel">Ver mi nivel</button><button class="link" data-act="close-sheet">Ahora no</button></div></div>`);
}
