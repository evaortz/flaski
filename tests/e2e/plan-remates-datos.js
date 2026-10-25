// Datos y comprobaciones de plan-remates.spec.js
import { expect, openApp, nav } from './fixtures.js';

const qs = (n, p = 'p') => Array.from({ length: n }, (_, i) => [`${p}${i}`, `r${i}`]);
export const LARGO = 'Turco · Vocabulario y Verbos A1 Avanzado';
const DATA = { folders: ['Turco A1', 'Inglés'], decks: [
  { name: LARGO, folder: 'Turco A1', cards: qs(12, 'a') }, { name: 'Turco · Gramática', folder: 'Turco A1', cards: qs(40, 'b') },
  { name: 'Turco · Lecturas', folder: 'Turco A1', cards: qs(40, 'c') }, { name: 'Phrasal verbs', folder: 'Inglés', cards: qs(8, 'e') },
] };
// Dos exámenes: Turco A1 (el tema largo ya sabido) a 70 días e Inglés, con poco temario, a 60 (acaba enseguida: «acabas el…» cerca de «hoy»)
export async function setup(page, seed) {
  await seed(DATA);
  await openApp(page);
  await page.evaluate(async () => {
    const api = await import('/js/api.js'); const { S } = await import('/js/comun.js'); const { editPlan2 } = await import('/js/plan2-app.js'); const { dayKey, addDays } = await import('/js/plan.js');
    const fid = n => [...S.folders.values()].find(f => f.name === n).id, did = n => [...S.decks.values()].find(d => d.name === n).id;
    const p = editPlan2();
    p.time.week = { mon: 30, tue: 30, wed: 30, thu: 30, fri: 30, sat: 30, sun: 30 };
    const ex = (name, days, known = []) => ({ id: 'ex-' + name, name, scope: { folders: [fid(name)], decks: [], pages: [] }, date: addDays(dayKey(), days), order: [], mode: 'seq', shares: {}, fixed: {}, known, exclude: [], lastWeek: false, after: null, retention: 0.9 });
    p.exams.push(ex('Turco A1', 70, [did('Turco · Vocabulario y Verbos A1 Avanzado')]), ex('Inglés', 60));
    await api.saveSettings(S.uid, S.newPerDay, S.prefs);
  });
  await page.reload();
  await expect(page.locator('#main :is(.spin, .skel)')).toHaveCount(0);
  await nav(page, 'Perfil');
  await page.locator('#main [data-nav="plan"]').click();
}
// La barra ocupa casi todo el ancho de su fila y sus etiquetas no se montan
export async function checkBars(page, sel) {
  const rows = page.locator(sel);
  await expect(rows.first()).toBeVisible();
  for (let k = 0; k < await rows.count(); k++) {
    // (las etiquetas se colocan al pintarse la barra: se espera a que estén)
    await expect.poll(() => rows.nth(k).evaluate(row => {
      const bar = row.querySelector('.pb-bar'), R = row.getBoundingClientRect(), B = bar.getBoundingClientRect();
      const spans = [...row.querySelectorAll('.pb-lab > span')].map(s => s.getBoundingClientRect());
      const overlap = spans.some((a, i) => spans.some((b, j) => i < j && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1));
      const out = spans.some(s => s.left < R.left - 1 || s.right > R.right + 1);
      return `${B.width / R.width > 0.9 ? 'ancha' : 'estrecha'} · ${overlap ? 'se montan' : 'sin montarse'} · ${out ? 'se sale' : 'dentro'}`;
    })).toBe('ancha · sin montarse · dentro');
  }
}

