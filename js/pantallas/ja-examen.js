// Japonés · Prepárate el JLPT: un examen del Plan para el N5 o el N4. Elige la convocatoria; lo que te falta del
// nivel va a una lista nueva («JLPT N5 · lo que te falta», en la carpeta «JLPT N5») y entra en el Plan. Si así no
// llegas, Flaski sube solo las nuevas de cada día (el arreglo del motor del Plan), con «Deshacer».
import { S, esc, toast, fail } from '../comun.js';
import { icon } from '../icons.js';
import { openSheet, closeSheet } from './editor.js';
import { dayKey, addDays, daysBetween, isDay, WEEK, WEEK_NAMES, weekdayOf } from '../plan.js';
import { plan2, stateNow } from '../plan2-app.js';
import { fixes, liveExams } from '../plan2.js';
import { commitPlan } from './plan-guardar.js';
import { longDay, daysLeft } from './plan-ui.js';
import { rubyWord } from '../ja/leer.js';
import { LEVELS, jlptSittings } from '../ja/niveles.js';
import { missingWords } from './ja-nivel.js';
import { go } from '../app.js';

// Si para llegar hicieran falta más nuevas al día que esto, no se sube solo: se queda en «Para llegar» del Plan
export const MAX_AUTO_NEW = 30;
const examId = lvl => 'ex-jlpt-' + lvl;
const deckOf = lvl => [...S.decks.values()].find(d => !d.archived && d.options?.jlpt === lvl);

// Para llegar, el arreglo del motor que menos cambia de los que solo suben nuevas al día y minutos (sin pausar otros
// exámenes ni dejar temas). null si ya llegas; { option } con el arreglo, o { option: null } si ninguno así llega
const AUTO = new Set(['cap', 'minutes', 'cap+minutes']);
export function autoFix(id, state = stateNow()) {
  const fx = fixes(state, id);
  if (!fx.base || fx.base.verdict !== 'no') return null;
  const option = fx.options.find(o => AUTO.has(o.kinds) && !(o.levers.find(l => l.kind === 'cap')?.newPerDay > MAX_AUTO_NEW)) || null;
  return { option };
}

export async function jlptSheet(lvl = 'n5') {
  const t = dayKey(), sit = jlptSittings(t), ex = liveExams(plan2()).find(e => e.id === examId(lvl));
  S.jx = { lvl, date: ex?.date && ex.date > t ? ex.date : sit[0], other: false, onlyExam: true, missing: null };
  S.jx.missing = await missingWords(lvl);
  draw();
}
export function jlptInput(patch) { Object.assign(S.jx, patch); draw(); }

function draw() {
  const x = S.jx, t = dayKey(), L = LEVELS.find(l => l.id === x.lvl), sit = jlptSittings(t), n = x.missing?.length || 0;
  const row = d => `<button type="button" class="jx-sit" role="radio" aria-checked="${!x.other && x.date === d}" data-jx-date="${d}">
      <span class="jx-dot" aria-hidden="true"></span><span><b>${WEEK_NAMES[weekdayOf(d)].replace(/^./, c => c.toUpperCase())} ${longDay(d)}</b><small>${daysLeft(d, t)}${daysBetween(t, d) < 14 ? ' · muy justo' : ''}</small></span></button>`;
  const deck = deckOf(x.lvl);
  openSheet(`<div class="rd jx"><h2 class="sheet-hand">Prepárate el ${L.name}</h2>
    <p class="muted">El examen oficial de japonés. Lo que te falta va a una lista y entra en tu Plan.</p>
    <section><h3 class="rd-h">¿Cuándo es?</h3>
      <div class="jx-sits" role="radiogroup" aria-label="Convocatoria">${sit.map(row).join('')}
        <button type="button" class="jx-sit" role="radio" aria-checked="${x.other}" data-jx-other="1"><span class="jx-dot" aria-hidden="true"></span><span><b>Otra fecha</b><small>la de tu sede, si es distinta</small></span></button></div>
      ${x.other ? `<label class="p2-date">${icon('calendar', { size: 20 })}<input type="date" data-jx-day min="${addDays(t, 1)}" value="${x.date}" aria-label="Fecha del examen"></label>` : ''}
      <p class="muted small">Se hace el primer domingo de julio y de diciembre. Mira la fecha en tu resguardo.</p></section>
    <section><h3 class="rd-h">¿Qué entra?</h3>
      <p>${n ? `Las <b>${n}</b> palabras del ${L.name} que no tienes en tus listas, en ${deck ? `tu lista «${esc(deck.name)}»` : `una lista nueva, «JLPT ${L.name} · lo que te falta»`}.` : `Ya tienes todas las palabras del ${L.name} en tus listas.`} Lo que ya tienes sigue donde está y cuenta igual.</p>
      <div class="set-row"><div class="set-l"><b id="jx-only">Solo como en el examen</b><small>Del japonés al significado, sin escribir: la mitad de preguntas.</small></div><div class="set-c"><label class="switch"><input type="checkbox" role="switch" aria-labelledby="jx-only" data-jx-only ${x.onlyExam ? 'checked' : ''}><span class="slider" aria-hidden="true"></span></label></div></div></section>
    <p class="muted small">Si así no llegas, Flaski sube solo las nuevas de cada día y te lo dice. Se puede deshacer.</p>
    <div class="btnrow"><button class="ghost" data-act="close-sheet">Ahora no</button><span class="spacer"></span><button class="primary" data-act="jx-save" ${isDay(x.date) && x.date > t && n ? '' : 'disabled'}>Preparar el examen</button></div></div>`, { full: true });
}

export async function jlptSave() {
  const x = S.jx, L = LEVELS.find(l => l.id === x.lvl), t = dayKey();
  if (!isDay(x.date) || x.date <= t) return toast('Elige una fecha a partir de mañana');
  try {
    const { notesToDeck } = await import('../notes.js'), { importParsed } = await import('./explorar.js'), api = await import('../api.js');
    const p = notesToDeck({ name: `JLPT ${L.name} · lo que te falta`, folder: `JLPT ${L.name}`, lang: 'ja-JP',
      notes: x.missing.map(w => ({ type: 'vocab', fields: { w: w.k ? rubyWord(w.k, w.kana) : w.kana, t: w.es, p: '', e: '', n: '' } })) });
    if (x.onlyExam) p.cards = p.cards.filter(c => c.template === 't1');
    const dest = deckOf(x.lvl)?.id || '';
    const { deck } = await importParsed(p, dest);
    if (!dest) {
      const d = await api.updateDeck(deck.id, { options: { ...(deck.options || {}), lang: 'ja-JP', jlpt: x.lvl } });
      S.decks.set(d.id, { tags: [], ...S.decks.get(d.id), ...d });
    }
    const id = examId(x.lvl);
    closeSheet();
    commitPlan(`Examen JLPT ${L.name} guardado`, pl => {
      const old = pl.exams.find(e => e.id === id) || {};
      const e = { order: [], mode: 'seq', shares: {}, fixed: {}, known: [], exclude: [], boost: {}, retention: 0.9, retentionLast: 0.95, approx: false, ...old,
        id, name: `JLPT ${L.name}`, scope: { folders: [], decks: [deck.id], pages: [] }, date: x.date, lastWeek: daysBetween(t, x.date) > 21, after: 'pause' };
      delete e.deleted;
      const i = pl.exams.findIndex(y => y.id === id);
      if (i >= 0) pl.exams[i] = e; else pl.exams.push(e);
      if (!pl.time?.week) pl.time = { ...(pl.time || {}), week: Object.fromEntries(WEEK.map(d => [d, S.prefs.study.tandaMin])) };
    }, { redraw: false, quiet: true });
    // ¿Llegas? Si no, se aplica solo el arreglo del motor que sube nuevas al día y minutos (lo mínimo que llega)
    const fix = autoFix(id), o = fix?.option;
    if (o) {
      const cap = o.levers.find(l => l.kind === 'cap'), min = o.levers.find(l => l.kind === 'minutes');
      const what = [cap ? `${cap.newPerDay} nuevas al día (antes ${cap.from})` : '', min ? `${min.add} min más al día` : ''].filter(Boolean).join(' y ');
      commitPlan(`Para llegar al ${L.name}: ${what}`, pl => {
        if (cap) pl.caps = { ...(pl.caps || {}), newPerDay: cap.newPerDay };
        if (min) pl.time = { ...pl.time, week: { ...o.plan.time.week } };
      }, { redraw: false });
    } else toast(fix ? `Examen JLPT ${L.name} guardado. Así no llegas a todo: mira «Para llegar»` : `Examen JLPT ${L.name} guardado: llegas`);
    go('exam', { examId: id });
  } catch (e) { fail(e); }
}
