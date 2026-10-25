// Compara lo que dicen el plan de ahora (plan.js) y el nuevo (plan2.js) para la demo y para el estado de 945
// preguntas. Desde tests/: node fixtures/comparar.mjs (saca una tabla en Markdown para ESTADO-PLAN.md)
import { readFileSync } from 'node:fs';
import { simulate, normalNew, newOn, addDays, sortStages, decksUnder } from '../../js/plan.js';
import { forecast, today } from '../../js/plan2.js';
import { migrate } from '../../js/plan2-migrar.js';
import { fromRow } from '../../js/rows.js';
import { startOfDay } from '../../js/srs.js';

const read = f => JSON.parse(readFileSync(new URL(f, import.meta.url), 'utf8'));
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fecha = k => (k ? `${Number(k.slice(8))} ${MES[Number(k.slice(5, 7)) - 1]}` : '—');

function datos(name) {
  if (name === 'demo') {
    const d = read('./demo.json');
    return { name: 'Demo (datos de ejemplo)', today: d.today, plan: d.plan, newPerDay: d.newPerDay, tandaMin: d.tandaMin, decks: d.decks, folders: d.folders, cards: d.cards, progress: new Map(d.progress.map(p => [p.card_id, p])), events: d.events, hoy: d.old.hoy };
  }
  const d = read('./oposicion-945.json');
  return { name: '945 preguntas, dos exámenes', today: '2026-10-25', plan: d.settings.prefs.plan, newPerDay: d.settings.new_per_day, tandaMin: d.settings.prefs.study.tandaMin, decks: d.decks, folders: d.folders, cards: d.cards, progress: new Map(d.progress.map(r => [r.card_id, fromRow(r)])), events: d.events, hoy: null };
}

function viejo(D) {
  const decks = new Map(D.decks.map(x => [x.id, x])), folders = new Map(D.folders.map(x => [x.id, x]));
  const remaining = new Map();
  for (const c of D.cards) if (!D.progress.has(c.id)) remaining.set(c.deck_id, (remaining.get(c.deck_id) || 0) + 1);
  const exams = Object.entries(D.plan.nodes || {}).filter(([, n]) => n?.exam).sort((a, b) => a[1].exam.localeCompare(b[1].exam));
  const to = [...exams.map(([, n]) => n.exam), ...sortStages(D.plan.stages).map(s => s.to), addDays(D.today, 120)].sort().at(-1);
  const sim = simulate({ decks, folders, plan: D.plan, newPerDay: D.newPerDay, fallbackMin: D.tandaMin, remaining, from: D.today, to });
  const end = startOfDay(new Date(D.today + 'T12:00:00').getTime()) + 864e5;
  const due = [...D.progress.values()].filter(p => p.due < end).length;
  return {
    hoy: D.hoy ? `${D.hoy.due} repasos y ${D.hoy.newToday} nuevas` : `${due} repasos y ${newOn(D.plan, D.today, D.newPerDay, D.tandaMin)} nuevas (en el Plan, «Hoy toca · 30 preguntas»)`,
    normal: `${normalNew(D.plan, D.newPerDay, D.tandaMin)} nuevas (las de Ajustes)`,
    exams: exams.map(([k, n]) => {
      const ids = k.startsWith('f:') ? decksUnder(k.slice(2), decks, folders).map(d => d.id) : [k];
      const fins = ids.filter(id => remaining.get(id)).map(id => sim.finish.get(id));
      const left = ids.reduce((a, id) => a + (sim.left(n.exam).get(id) || 0), 0);
      return { name: k.startsWith('f:') ? folders.get(k.slice(2)).name : decks.get(k).name, date: n.exam, finish: fins.some(f => !f) ? null : fins.sort().at(-1), late: left > 0 };
    }),
  };
}

function nuevo(D) {
  const plan = migrate(D.plan, { today: D.today, decks: D.decks, folders: D.folders, at: 1 });
  const S = { plan, today: D.today, decks: D.decks, folders: D.folders, cards: D.cards, progress: D.progress, events: D.events, fallbackMin: D.tandaMin };
  const fc = forecast(S), t = today(S), next = fc.days.find((d, i) => i > 0 && d.minutes > 0);
  return {
    hoy: `${t.reviews} repasos y ${t.new} nuevas (${t.minutes} min${t.rest ? ', día libre' : ''}), lo mismo en Hoy y en el Plan`,
    normal: next ? `${next.new} nuevas y ${next.reviews} repasos el ${fecha(next.day)} (${next.minutes} min)` : '—',
    pace: `${fc.pace.secNew} s por nueva, ${fc.pace.secReview} s por repaso${fc.pace.measured ? ` (medido en ${fc.pace.n} respuestas)` : ' (por defecto: no hay respuestas)'}`,
    short: fc.short.length,
    exams: fc.exams,
  };
}

const VERD = { llegas: 'llegas', justo: 'llegas justo', no: 'no llegas' };
for (const name of ['demo', '945']) {
  const D = datos(name), a = viejo(D), b = nuevo(D);
  console.log(`\n### ${D.name} · ${D.today}\n`);
  console.log('| | Plan de ahora | Plan nuevo |\n|---|---|---|');
  console.log(`| Hoy | ${a.hoy} | ${b.hoy} |`);
  console.log(`| Un día normal | ${a.normal} | ${b.normal} |`);
  console.log(`| Ritmo | no lo mide (cuenta preguntas) | ${b.pace} |`);
  console.log(`| Días en que no caben los repasos | no lo mira | ${b.short} |`);
  if (!a.exams.length) console.log('| Exámenes | ninguno | ninguno |');
  a.exams.forEach((e, i) => {
    const n = b.exams[i];
    console.log(`| ${e.name} (${fecha(e.date)}) | acabas el ${fecha(e.finish)} · ${e.late ? 'no llegas' : 'llegas'} | acabas el ${fecha(n.finish)} · ${VERD[n.verdict]}${n.review != null ? ` · ${n.review} días de repaso` : ''} |`);
  });
}
