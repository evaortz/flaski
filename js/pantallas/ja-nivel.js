// Japonés · Tu japonés: cuánto llevas del N5 y del N4 (palabras y kanji), con el criterio estricto de js/ja/niveles.js,
// y lo que te falta. Se abre desde Perfil.
import { S, esc } from '../comun.js';
import { openSheet } from './editor.js';
import { memoryOf } from '../fsrs.js';
import { kanjiData } from '../ja/datos.js';
import { jaWords, jaKanjiWords, kanjiCards, KANJI_TYPE } from '../ja/saber.js';
import { jlptData, classify, mineFrom, levelKanji, LEVELS, KNOW_DAYS } from '../ja/niveles.js';
import { plan2 } from '../plan2-app.js';
import { liveExams } from '../plan2.js';
import { dayKey, daysBetween } from '../plan.js';
import { longDay } from './plan-ui.js';

const SHOW = 40;
const stabOf = id => { const p = S.progress.get(id); return p ? memoryOf(p).S : 0; };
// Lo tuyo: cada palabra con la mejor memoria de sus preguntas y cada kanji con la de sus pasos 1 y 2
// Hasta cuándo hay que recordarlo: con un examen JLPT de ese nivel por delante, hasta su día; si no, 3 semanas
export function horizon(lvl) {
  const t = dayKey(), ex = liveExams(plan2()).find(e => e.id === 'ex-jlpt-' + lvl && e.date > t);
  return ex ? { days: Math.max(1, daysBetween(t, ex.date)), date: ex.date } : { days: KNOW_DAYS, date: '' };
}
function mine(days = KNOW_DAYS) {
  const words = new Map();
  for (const [w, x] of jaWords()) words.set(w, { stab: Math.max(0, ...x.cards.map(stabOf)) });
  const kanjiSteps = new Map();
  for (const c of S.cards.values()) {
    const k = c.type_id === KANJI_TYPE && c.fields?.k;
    if (!k || kanjiSteps.has(k)) continue;
    const cs = kanjiCards(k);
    kanjiSteps.set(k, { s1: cs.t1 ? stabOf(cs.t1.id) : 0, s2: cs.t2 ? stabOf(cs.t2.id) : 0 });
  }
  return mineFrom({ words, kanjiSteps, kanjiInWords: jaKanjiWords(), sabidas: S.prefs.ja?.sabidas || [] }, days);
}

// Las palabras del nivel que no tienes en ninguna lista: [{ k, kana, es }]
export async function missingWords(lvl) {
  const data = await jlptData();
  return data ? classify(data[lvl], [], mine()).words.filter(w => w.state === 'missing') : [];
}

// El porcentaje del nivel (palabras y kanji), o null si aún no hay datos (sin conexión la primera vez)
export async function levelPct(lvl) {
  const [data, kanji] = await Promise.all([jlptData(), kanjiData()]);
  return data ? classify(data[lvl], levelKanji(kanji, lvl), mine(horizon(lvl).days)).pct : null;
}

let D = null;   // { data, kanji }
export async function levelSheet() {
  S.jn = S.jn || { lvl: 'n5', kind: 'w', all: false };
  openSheet('<div class="rd jn"><div class="spin" aria-label="Cargando"></div></div>', { full: true });
  const [data, kanji] = await Promise.all([jlptData(), kanjiData()]);
  if (!data) return openSheet('<div class="rd jn"><h2 class="sheet-hand">Tu japonés</h2><p>Necesitas conexión la primera vez para descargar las listas del JLPT.</p><div class="btnrow"><span class="spacer"></span><button class="ghost" data-act="close-sheet">Cerrar</button></div></div>', { full: true });
  D = { data, kanji };
  draw();
}
export function setLevel(patch) { Object.assign(S.jn, patch); if (D) draw(); }

function draw() {
  const { lvl, kind, all } = S.jn, L = LEVELS.find(l => l.id === lvl);
  const H = horizon(lvl), r = classify(D.data[lvl], levelKanji(D.kanji, lvl), mine(H.days));
  const when = H.date ? `el ${longDay(H.date)}, el día de tu examen` : `dentro de ${KNOW_DAYS / 7} semanas`;
  const pc = (n, t) => (t ? Math.round(100 * n / t) : 0);
  const part = (label, p, k) => `<button type="button" class="jn-part" data-jnk="${k}" aria-pressed="${kind === k}">
      <span class="jn-part-t"><b>${label}</b><span>${p.known} de ${p.total}</span></span>
      <span class="rd-bar" aria-hidden="true"><i class="rd-known" style="width:${pc(p.known, p.total)}%"></i><i class="rd-learning" style="width:${pc(p.learning, p.total)}%"></i></span></button>`;
  const missW = r.words.filter(w => w.state === 'missing'), missK = r.kanji.filter(k => k.state === 'missing');
  const wList = (all ? missW : missW.slice(0, SHOW)).map(w => `<li><span class="jn-w"><b lang="ja">${esc(w.k || w.kana)}</b><span><span>${esc(w.es)}</span>${w.k ? `<small lang="ja">${esc(w.kana)}</small>` : ''}</span></span></li>`).join('');
  const kGrid = missK.map(k => `<button type="button" class="kj-tile is-new" data-kj="${esc(k.k)}" aria-label="${esc(k.k)}"><b lang="ja">${esc(k.k)}</b></button>`).join('');
  const falta = kind === 'k'
    ? (missK.length ? `<div class="kj-grid">${kGrid}</div><p class="muted small">Toca uno para ver qué significa y cómo se lee.</p>` : `<p class="jn-ok">Tienes todos los kanji del ${L.name} en tus listas.</p>`)
    : (missW.length ? `<ul class="rd-list jn-list">${wList}</ul>${!all && missW.length > SHOW ? `<button type="button" class="link" data-jn-all="1">Ver las ${missW.length}</button>` : ''}` : `<p class="jn-ok">Tienes todas las palabras del ${L.name} en tus listas.</p>`);
  openSheet(`<div class="rd jn"><h2 class="sheet-hand">Tu japonés</h2>
    <div class="rd-filter jn-seg" role="group" aria-label="Nivel">${LEVELS.map(l => `<button type="button" data-jn="${l.id}" aria-pressed="${l.id === lvl}">${l.name}</button>`).join('')}</div>
    <div class="rd-sum"><div class="rd-big"><b>${r.pct} %</b><span>del ${L.name}</span></div>
      <p class="small">Lo que recordarás ${when}. Lo que estás aprendiendo aún no cuenta.</p>
      ${part('Palabras', r.w, 'w')}${part('Kanji', r.kj, 'k')}
      <span class="rd-key"><span><i class="rd-known"></i>lo sabes</span><span><i class="rd-learning"></i>aprendiéndolo</span><span><i class="jn-missing"></i>te falta</span></span></div>
    <h3 class="rd-h">Lo que te falta · ${kind === 'k' ? `${missK.length} kanji` : `${missW.length} ${missW.length === 1 ? 'palabra' : 'palabras'}`}</h3>
    ${falta}
    <details class="jn-src"><summary>¿De dónde sale el ${L.name}?</summary>
      <p>Desde 2010 el JLPT no publica qué palabras ni qué kanji entran: esta lista es orientativa, como todas.</p>
      <p><b>Palabras:</b> las listas de Jonathan Waller, las que usa casi todo el mundo (licencia CC BY), con el significado de nuestro diccionario.<br><b>Kanji:</b> los del nivel oficial del examen anterior a 2010 (${L.id === 'n5' ? 'el 4.º' : 'el 3.º'}), que traen los datos de kanji de Flaski.</p>
      <p><b>«Lo sabes»</b> es lo que recordarás ${when}, según tus repasos. Un kanji cuenta cuando sabes qué significa y cómo se lee. Las palabras que marcaste con «Ya me la sé» también cuentan.</p></details>
    <div class="btnrow"><button class="ghost" data-act="close-sheet">Cerrar</button><span class="spacer"></span>${missW.length ? `<button class="primary" data-act="jx-open" data-l="${lvl}">Prepararme el ${L.name}</button>` : ''}</div></div>`, { full: true });
}
