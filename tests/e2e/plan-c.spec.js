// Plan de estudio (paso C): crear un examen, el reparto 70/30 viendo «Así quedaría», varios temas a la vez, fijar
// una fecha, cambiar el orden (con flechas y arrastrando), las tres hojas de «En tu plan» y la migración de un plan
// de antes con etapas
import { test, expect, openApp, nav, openDeck, deckMenu } from './fixtures.js';

const qs = (n, p = 'p') => Array.from({ length: n }, (_, i) => [`${p}${i}`, `r${i}`]);
const OPOS = { folders: ['Oposición', 'Idiomas'], decks: [
  { name: 'T1 · Constitución', folder: 'Oposición', cards: qs(30, 'a') }, { name: 'T2 · Cortes', folder: 'Oposición', cards: qs(30, 'b') },
  { name: 'T3 · Gobierno', folder: 'Oposición', cards: qs(30, 'c') }, { name: 'Vocabulario', folder: 'Idiomas', cards: qs(40, 'v') },
  { name: 'Japonés', cards: qs(10, 'j') },
] };
const toPlan = async page => { await nav(page, 'Perfil'); await page.locator('#main [data-nav="plan"]').click(); await expect(page.getByRole('heading', { name: 'Plan', exact: true })).toBeVisible(); };
// Los exámenes, como los guardaría la hoja (en el plan nuevo)
async function addExams(page, list) {
  await page.evaluate(async list => {
    const api = await import('/js/api.js'); const { S } = await import('/js/comun.js'); const { editPlan2 } = await import('/js/plan2-app.js');
    const { dayKey, addDays } = await import('/js/plan.js');
    const fid = name => [...S.folders.values()].find(f => f.name === name).id;
    const p = editPlan2();
    p.time.week = { mon: 30, tue: 30, wed: 30, thu: 30, fri: 30, sat: 30, sun: 30 };
    for (const [name, days] of list) p.exams.push({ id: 'ex-' + name, name, scope: { folders: [fid(name)], decks: [], pages: [] }, date: addDays(dayKey(), days), order: [], mode: 'seq', shares: {}, fixed: {}, known: [], exclude: [], lastWeek: false, after: null, retention: 0.9 });
    await api.saveSettings(S.uid, S.newPerDay, S.prefs);
  }, list);
  await page.reload();
  await expect(page.locator('#main :is(.spin, .skel)')).toHaveCount(0);
}
const plan = page => page.evaluate(() => import('/js/plan2-app.js').then(m => m.plan2()));

test('crear un examen: qué entra, cuándo y cuánto tiempo, con el resultado en vivo', async ({ page, seed }) => {
  await seed(OPOS);
  await openApp(page);
  await toPlan(page);
  await expect(page.locator('#main .p2-vt')).toHaveText('Sin exámenes a la vista');
  await page.locator('#main .p2-add').click();
  await expect(page.locator('#sheetBody h2')).toHaveText('Nuevo examen');
  await page.locator('#sheetBody [data-p2="new-pick"]').selectOption({ label: 'Oposición' });
  await expect(page.locator('#sheetBody')).toContainText('3 temas · 90 preguntas · 0 vistas');
  const date = await page.evaluate(() => import('/js/plan.js').then(m => m.addDays(m.dayKey(), 40)));
  await page.locator('#p2nDate').fill(date);
  await expect(page.locator('#p2nDays')).toContainText('faltan 40 días');
  await page.locator('#sheetBody [data-p2="new-time"][data-v="30"]').click();
  await expect(page.locator('#sheetBody [data-p2="new-time"][data-v="30"]')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#sheetBody .p2-result h3')).toHaveText('Llegas');
  await expect(page.locator('#sheetBody .p2-result')).toContainText('Acabas el temario el');
  // 40 días: la última semana, solo repasar, viene puesta
  await expect(page.locator('#sheetBody [data-p2="new-lw"]')).toBeChecked();
  await page.locator('#sheetBody [data-p2="new-save"]').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Oposición' })).toBeVisible();
  await expect(page.locator('#main .p2-path .p2-step')).toHaveCount(6);   // 3 temas, repaso, última semana y examen
  await nav(page, 'Perfil');
  await page.locator('#main [data-nav="plan"]').click();
  await expect(page.locator('#main .p2-vt')).toHaveText('Llegas al examen');
  await expect(page.locator('#main .p2-exrow')).toContainText('Oposición');
  // Y se puede deshacer
  const p = await plan(page);
  expect(p.exams.filter(e => !e.deleted)).toHaveLength(1);
  expect(p.history[0].what).toBe('Examen guardado');
});

test('reparto 70/30 entre dos exámenes, viendo «Así quedaría»; y se deshace', async ({ page, seed }) => {
  await seed(OPOS);
  await openApp(page);
  await addExams(page, [['Oposición', 60], ['Idiomas', 120]]);
  await toPlan(page);
  await page.locator('#main [data-nav="planSettings"]').last().click();
  await expect(page.getByRole('heading', { name: 'Ajustes del plan' })).toBeVisible();
  await page.locator('#main [data-p2="set-reparto"]').click();
  await expect(page.locator('#sheetBody h2')).toHaveText('Cómo repartes las nuevas');
  await page.locator('#sheetBody [data-p2="rep-split"][data-v="manual"]').click();
  await page.locator('#sheetBody input[data-group="split"][data-id="ex-Oposición"]').fill('70');
  await expect(page.locator('#sheetBody [data-group="split"] [data-out="ex-Oposición"]')).toHaveText('70 %');
  await expect(page.locator('#sheetBody [data-group="split"] [data-out="ex-Idiomas"]')).toHaveText('30 %');
  await expect(page.locator('#p2Asi')).toContainText('Así sigues llegando');
  await expect(page.locator('#p2Asi')).toContainText('Oposición: acabas el temario el');
  await page.locator('#sheetBody [data-p2="rep-save"]').click();
  await expect(page.locator('#toast')).toContainText('Reparto 70/30');
  await expect(page.locator('#main [data-p2="set-reparto"]')).toContainText('Oposición 70 % · Idiomas 30 %');
  await page.locator('#toast .ta-btn').click();
  await expect(page.locator('#main [data-p2="set-reparto"]')).toContainText('Automático');
});

test('varios temas a la vez: «Varios a la vez» con porcentajes que suman 100, y Hoy reparte entre ellos', async ({ page, seed }) => {
  await seed(OPOS);
  await openApp(page);
  await addExams(page, [['Oposición', 60]]);
  await toPlan(page);
  await page.locator('#main .p2-exrow').click();
  await page.locator('#main [data-p2="mode"][data-v="parallel"]').click();
  await expect(page.locator('#sheetBody')).toContainText('Dentro de Oposición');
  // Tres temas: 50, 30 y 20
  await expect(page.locator('#sheetBody [data-group="within"] output')).toHaveText(['50 %', '30 %', '20 %']);
  await page.locator('#sheetBody input[data-group="within"]').first().fill('60');
  await expect(page.locator('#sheetBody [data-group="within"] output')).toHaveText(['60 %', '24 %', '16 %']);
  await page.locator('#sheetBody [data-p2="rep-save"]').click();
  await expect(page.locator('#main [data-p2="mode"][data-v="parallel"]')).toHaveAttribute('aria-pressed', 'true');
  // Hoy salen nuevas de los tres temas a la vez (y el goteo de lo que no tiene examen)
  const n = await page.evaluate(async () => { const { S } = await import('/js/comun.js'); const m = await import('/js/plan2-app.js'); return Object.keys(m.todayPlan().newBy).filter(id => /^T\d/.test(S.decks.get(id).name)).length; });
  expect(n).toBe(3);
});

test('fijar una fecha a un tema: «Así quedaría» y el camino lo dice', async ({ page, seed }) => {
  await seed(OPOS);
  await openApp(page);
  await addExams(page, [['Oposición', 60]]);
  await toPlan(page);
  await page.locator('#main .p2-exrow').click();
  await page.locator('#main [data-p2="fix-date"]').click();
  await page.locator('#p2fdT').selectOption({ label: 'T3 · Gobierno' });
  const date = await page.evaluate(() => import('/js/plan.js').then(m => m.addDays(m.dayKey(), 5)));
  await page.locator('#p2fdD').fill(date);
  await expect(page.locator('#p2Asi')).toContainText('Oposición: acabas el temario el');
  await page.locator('#sheetBody [data-p2="fd-save"]').click();
  await expect(page.locator('#main .p2-step', { hasText: 'T3 · Gobierno' })).toContainText('antes del');
  const fin = await page.evaluate(() => import('/js/plan2-app.js').then(m => m.forecastNow().exams[0].topics.find(t => t.id && t.fresh === 30 && t.finish).finish));
  expect(fin <= date).toBe(true);
});

test('cambiar el orden con las flechas: el camino empieza por el tema que subes', async ({ page, seed }) => {
  await seed(OPOS);
  await openApp(page);
  await addExams(page, [['Oposición', 60]]);
  await toPlan(page);
  await page.locator('#main .p2-exrow').click();
  await page.locator('#main [data-p2="order"]').click();
  await page.locator('#p2Order [data-p2="order-move"][data-d="-1"]').nth(1).click();
  await expect(page.locator('#p2Order .p2-ord b')).toHaveText(['T2 · Cortes', 'T1 · Constitución', 'T3 · Gobierno']);
  await page.locator('#main [data-p2="order-done"]').click();
  await expect(page.locator('#main .p2-path .p2-step b').first()).toHaveText('T2 · Cortes');
});

test('cambiar el orden arrastrando por el asa @ambos', async ({ page, seed }) => {
  await seed(OPOS);
  await openApp(page);
  await addExams(page, [['Oposición', 60]]);
  await toPlan(page);
  await page.locator('#main .p2-exrow').click();
  await page.locator('#main [data-p2="order"]').click();
  const h = page.locator('#p2Order .p2-ord-h').first(), last = page.locator('#p2Order .p2-ord').last();
  const a = await h.boundingBox(), b = await last.boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2, b.y + b.height - 4, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('#p2Order .p2-ord b')).toHaveText(['T2 · Cortes', 'T3 · Gobierno', 'T1 · Constitución']);
  expect((await plan(page)).exams[0].order[2]).toBeTruthy();
});

test('«En tu plan»: la carpeta del examen, uno de sus temas y una lista sin examen', async ({ page, seed }) => {
  await seed(OPOS);
  await openApp(page);
  await addExams(page, [['Oposición', 60]]);
  // La carpeta con examen
  await nav(page, 'Biblioteca');
  await page.locator('#main [data-folder]').filter({ hasText: 'Oposición' }).first().click();
  await page.locator('#main [data-p2="entuplan"]').click();
  await expect(page.locator('#sheetBody .p2-sheet-k')).toContainText('Oposición · en tu plan');
  // El examen se lleva el 80 % y lo que no tiene examen, el resto
  await expect(page.locator('#sheetBody')).toContainText('Se lleva el 80 % de tus nuevas');
  await expect(page.locator('#sheetBody')).toContainText('Ahora: T1 · Constitución');
  await page.locator('#sheetBody [data-p2="sheet-exam"]').last().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Oposición' })).toBeVisible();
  // Un tema: «Ya me lo sé» y «Este tema no cae»
  await nav(page, 'Biblioteca');
  await page.locator('#main [data-folder]').filter({ hasText: 'Oposición' }).first().click();
  await page.locator('#main [data-open]').filter({ hasText: 'T2 · Cortes' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'T2 · Cortes' })).toBeVisible();
  await deckMenu(page, '[data-p2="entuplan"]');
  await expect(page.locator('#sheetBody h2')).toHaveText('T2 · Cortes');
  await expect(page.locator('#sheetBody')).toContainText('Oposición · 30 preguntas, 0 vistas');
  await page.locator('#sheetBody [data-p2="topic-known"]').click();
  await expect(page.locator('#toast')).toContainText('T2: ya lo sabes');
  expect((await plan(page)).exams[0].known).toHaveLength(1);
  await deckMenu(page, '[data-p2="entuplan"]');
  await page.locator('#sheetBody [data-p2="topic-out"]').click();
  expect((await plan(page)).exams[0].exclude).toHaveLength(1);
  // Una lista sin examen: Activo | Solo repasar | Pausa y «Ponerle examen»
  await openDeck(page, 'Japonés');
  await deckMenu(page, '[data-p2="entuplan"]');
  await expect(page.locator('#sheetBody')).toContainText('No tiene examen');
  await page.locator('#sheetBody [data-p2="free-set"][data-v="reviews"]').click();
  const p = await plan(page);
  expect(Object.values(p.free)).toEqual(['reviews']);
  await deckMenu(page, '[data-p2="entuplan"]');
  await expect(page.locator('#sheetBody [data-p2="free-set"][data-v="reviews"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#sheetBody [data-p2="sheet-new-exam"]').click();
  await expect(page.locator('#sheetBody h2')).toHaveText('Nuevo examen');
  await expect(page.locator('#sheetBody [data-p2="new-pick"]')).toHaveValue(/./);
});

test('un plan de antes con etapas se migra al entrar: exámenes, etapas en Ajustes del plan y la copia v1', async ({ page, seed }) => {
  await seed(OPOS);
  await openApp(page);
  await page.evaluate(async () => {
    const api = await import('/js/api.js'); const { S } = await import('/js/comun.js'); const { dayKey, addDays } = await import('/js/plan.js');
    const f = [...S.folders.values()].find(x => x.name === 'Oposición').id, t = dayKey();
    S.prefs.plan = { nodes: { ['f:' + f]: { exam: addDays(t, 50), lastWeek: true, after: 'paused' } }, week: { mon: 30, tue: 30, wed: 30, thu: 30, fri: 30, sat: 60, sun: 0 }, special: [], stages: [{ id: 'st1', name: 'Primero la Constitución', from: t, to: addDays(t, 20), levels: { ['f:' + f]: 'high' }, order: {}, at: 1 }], simGoal: {}, sim: {}, startDone: true, lateOk: '' };
    await api.saveSettings(S.uid, S.newPerDay, S.prefs);
  });
  await page.reload();
  await expect(page.locator('#main :is(.spin, .skel)')).toHaveCount(0);
  const p = await plan(page);
  expect(p.v).toBe(2);
  expect(p.exams.map(e => [e.name, e.lastWeek, e.after])).toEqual([['Oposición', true, 'pause']]);
  expect(p.stages.map(s => s.name)).toEqual(['Primero la Constitución']);
  expect(p.v1.plan.nodes).toBeTruthy();
  expect(p.time.week.sat).toBe(60);
  await toPlan(page);
  await expect(page.locator('#main .p2-exrow')).toContainText('Oposición');
  await page.locator('#main [data-nav="planSettings"]').last().click();
  await expect(page.locator('#main [data-p2="stage"]').first()).toContainText('Primero la Constitución');
  // Guardado: al volver a entrar sigue igual (no se migra dos veces)
  await page.reload();
  expect((await plan(page)).exams).toHaveLength(1);
});

test('lo que no tiene examen: en pausa sale de Hoy y de la tanda; en «Solo repasar» no da nuevas', async ({ page, seed }) => {
  await seed({ decks: [{ name: 'Japonés', cards: qs(20, 'j') }, { name: 'Turco', cards: qs(20, 't') }] });
  await openApp(page);
  const set = async (name, v) => {
    await nav(page, 'Biblioteca');
    await page.locator('#main [data-open]').filter({ hasText: name }).first().click();
    await deckMenu(page, '[data-p2="entuplan"]');
    await page.locator(`#sheetBody [data-p2="free-set"][data-v="${v}"]`).click();
  };
  await set('Japonés', 'paused');
  await nav(page, 'Hoy');
  const by = () => page.evaluate(async () => { const { S } = await import('/js/comun.js'); const m = await import('/js/plan2-app.js'); return Object.keys(m.todayPlan().newBy).map(id => S.decks.get(id).name); });
  expect(await by()).toEqual(['Turco']);
  await page.locator('#main .p2-go').click();
  const go = page.locator('#sheetBody [data-act="tanda-go"]');
  if (await go.isVisible().catch(() => false)) await go.click();
  for (let i = 0; i < 3; i++) {
    await expect(page.locator('.studybar .where').first()).toContainText('Turco');
    await page.locator('[data-act="reveal"]').click();
    await page.locator('[data-grade="3"]').click();
  }
  await page.locator('.studybar [data-act="exit"]').click();
  // Se recuerda al volver a entrar; y «Solo repasar» tampoco da nuevas
  await page.reload();
  await expect(page.locator('#main :is(.spin, .skel)')).toHaveCount(0);
  expect(await by()).toEqual(['Turco']);
  await set('Turco', 'reviews');
  expect(await by()).toEqual([]);
});

test('Tu tiempo: un día especial manda sobre tu semana ese día, y se puede borrar', async ({ page, seed }) => {
  await seed({ decks: [{ name: 'Turco', cards: qs(40, 't') }] });
  await openApp(page);
  await addExams(page, []);
  await nav(page, 'Perfil');
  await page.locator('#main [data-nav="plan"]').click();
  await page.locator('#main [data-p2="time"]').first().click();
  await page.locator('#main [data-p2="special"]').last().click();
  await page.locator('#spLabel').fill('Puente');
  const t = await page.evaluate(() => import('/js/plan.js').then(m => m.dayKey()));
  await page.locator('#spFrom').fill(t);
  await page.locator('#spTo').fill(t);
  await page.locator('#spMin').selectOption('5');
  await page.locator('#sheetBody [data-p2="special-save"]').click();
  await expect(page.locator('#main .p2-sp')).toContainText('Puente');
  await nav(page, 'Hoy');
  await expect(page.locator('#main .p2-tanda')).toContainText('Tu tanda de hoy · 5 min');
  // Borrarlo: vuelve la semana (30 min)
  await nav(page, 'Perfil');
  await page.locator('#main [data-nav="plan"]').click();
  await page.locator('#main [data-p2="time"]').first().click();
  await page.locator('#main .p2-sp').click();
  await page.locator('#sheetBody [data-p2="special-del"]').click();
  await expect(page.locator('#main .p2-sp')).toHaveCount(0);
  await nav(page, 'Hoy');
  await expect(page.locator('#main .p2-tanda')).toContainText('Tu tanda de hoy · 30 min');
});

test('examen en 6 días: «Así no llegas», «Para llegar» con arreglos que llegan; aplicar, deshacer y quitar el examen', async ({ page, seed }) => {
  await seed(OPOS);
  await openApp(page);
  await addExams(page, [['Oposición', 6]]);
  await toPlan(page);
  await expect(page.locator('#main .p2-vt')).toHaveText('Así no llegas a Oposición');
  await expect(page.locator('#main .p2-verdict')).toContainText('preguntas sin ver');
  // Los arreglos se calculan al abrir, sin bloquear
  const fixes = page.locator('#p2Fixes .p2-fix');
  await expect(fixes.first()).toBeVisible();
  expect(await fixes.count()).toBeGreaterThanOrEqual(1);
  for (const f of await fixes.all()) await expect(f.locator('.p2-tag')).toContainText(/^Llegas/);
  await expect(page.locator('#p2Fixes [data-p2="fix-apply"]')).toHaveText('Aplicar la primera');
  await page.locator('#p2Fixes [data-p2="fix-apply"]').click();
  await expect(page.locator('#main .p2-vt')).toHaveText(/^Llegas/);
  // Deshacer: vuelve a no llegar
  await page.locator('#toast .ta-btn').click();
  await expect(page.locator('#main .p2-vt')).toHaveText('Así no llegas a Oposición');
  // «Lo dejo así»: no vuelve a proponerlo
  await expect(page.locator('#p2Fixes .p2-fix').first()).toBeVisible();
  await page.locator('#p2Fixes [data-p2="late-ok"]').click();
  await expect(page.locator('#p2Fixes')).toHaveCount(0);
  // Quitar el examen desde su pantalla
  await page.locator('#main .p2-exrow').click();
  await page.locator('#main [data-p2="exam-del"]').click();
  await page.locator('#sheetBody [data-p2="exam-del-ok"]').click();
  await expect(page.locator('#main .p2-vt')).toHaveText('Sin exámenes a la vista');
});
