// Plan de estudio: qué estudias (Pausa · Repasar · Poco · Normal · Mucho), tu semana y días especiales,
// hoy toca, exámenes, etapas con su orden de temas, «cuando no llegas» y la primera vez
import { test, expect, openApp, nav, addBuiltinDeck, startTanda } from './fixtures.js';

const JA = 'Japonés · Demo de Flaski', TR = 'Turco · Armonía vocálica';
async function twoDecks(page) {
  await openApp(page);
  await addBuiltinDeck(page, JA);
  await addBuiltinDeck(page, TR);
}
async function openPlan(page) {
  await nav(page, 'Perfil');
  await page.locator('#main [data-nav="plan"]').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Plan de estudio' })).toBeVisible();
}
const row = (page, name) => page.locator('.pf-row').filter({ has: page.locator('.pl-name', { hasText: name }) });
async function setLevel(page, name, label) {
  await row(page, name).click();
  await page.locator('#sheetBody .lv-seg').first().getByRole('button', { name: label, exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#sheet')).toBeHidden();
}
const perDay = async (page, name) => Number(/≈ (\d+) nueva/.exec(await row(page, name).locator('.pl-meta').textContent())?.[1] || 0);
// Un día a N días de hoy (días de calendario, «AAAA-MM-DD»)
const dayIn = (page, n) => page.evaluate(async n => { const { dayKey, addDays } = await import('/js/plan.js'); return addDays(dayKey(), n); }, n);
const deckId = (page, name) => page.evaluate(n => import('/js/comun.js').then(({ S }) => [...S.decks.values()].find(d => d.name === n).id), name);

test('pausa: sale de lo de hoy y de las tandas de «Todo», y se recuerda', async ({ page }) => {
  await twoDecks(page);
  await openPlan(page);
  await setLevel(page, JA, 'Pausa');
  await expect(row(page, JA).locator('.pill')).toHaveText('Pausa');
  await nav(page, 'Hoy');
  await startTanda(page);
  for (let i = 0; i < 4; i++) {
    await expect(page.locator('.studybar .where').first()).toContainText('Turco');
    await page.locator('[data-act="reveal"]').click();
    await page.locator('[data-grade="3"]').click();
  }
  await page.locator('.studybar [data-act="exit"]').click();
  await page.reload();
  await expect(page.locator('#main :is(.spin, .skel)')).toHaveCount(0);
  await openPlan(page);
  await expect(row(page, JA).locator('.pill')).toHaveText('Pausa');
});

test('«Repasar»: esa lista ya no da nuevas; Mucho y Poco reparten 4 a 1', async ({ page }) => {
  await twoDecks(page);
  await openPlan(page);
  expect(await perDay(page, JA) + await perDay(page, TR)).toBe(15);
  await setLevel(page, TR, 'Repasar');
  await expect(row(page, TR).locator('.pl-meta')).toHaveText('solo repasos');
  expect(await perDay(page, JA)).toBe(15);
  await setLevel(page, TR, 'Poco');
  await setLevel(page, JA, 'Mucho');
  expect(await perDay(page, JA)).toBe(12);
  expect(await perDay(page, TR)).toBe(3);
  // Sin etapas, el nivel va a los nodos de siempre (peso 2 y 0,5)
  const nodes = await page.evaluate(() => import('/js/comun.js').then(({ S }) => S.prefs.plan.nodes));
  expect(Object.values(nodes).map(n => n.weight).sort()).toEqual([0.5, 2]);
});

test('tu semana: los minutos de hoy son los de la tanda de Hoy; un día especial manda y se puede borrar', async ({ page }) => {
  await twoDecks(page);
  await openPlan(page);
  const wd = await page.evaluate(async () => { const { WEEK, weekdayOf, dayKey } = await import('/js/plan.js'); return WEEK[weekdayOf(dayKey())]; });
  await page.locator(`[data-pl="day"][data-day="${wd}"]`).click();
  await page.locator(`#sheetBody [data-pl="set-day"][data-min="45"]`).click();
  await expect(page.locator(`[data-pl="day"][data-day="${wd}"] b`)).toHaveText('45');
  // Sin fijar, los demás días toman la tanda de Ajustes (10 min)
  await expect(page.locator('[data-pl="day"] b').filter({ hasText: '10' })).toHaveCount(6);
  // El botón dice lo que tardarás en lo de hoy (aquí hay pocas: menos de 45 min)
  const fit = () => page.evaluate(() => import('/js/pantallas/estudio.js').then(m => m.tandaFit(m.todayQueue('all').ids.length).mins));
  await expect(page.locator('#main [data-act="tanda-short"]')).toHaveText(`Empezar la tanda · ${await fit()} min`);
  await nav(page, 'Hoy');
  // La tanda es de 45 min (aquí caben todas las de hoy, así que dice lo que tardarás en ellas)
  expect(await page.evaluate(() => import('/js/pantallas/estudio.js').then(m => m.shortInfo().minutes))).toBe(45);
  await expect(page.locator('#main .hero-min')).toContainText('Hoy, 45 min');
  // Día especial de hoy: 15 min
  await openPlan(page);
  await page.locator('[data-pl="special-new"]').click();
  const t = await dayIn(page, 0);
  await page.locator('#spLabel').fill('vacaciones');
  await page.locator('#spFrom').fill(t);
  await page.locator('#spTo').fill(t);
  await page.locator('#spMin').selectOption('15');
  await page.locator('[data-pl="special-save"]').click();
  await expect(page.locator('.pw-sp')).toContainText('vacaciones · 15 min');
  expect(await page.evaluate(() => import('/js/pantallas/estudio.js').then(m => m.shortInfo().minutes))).toBe(15);
  await expect(page.locator('#main [data-act="tanda-short"]')).toHaveText(`Empezar la tanda · ${await fit()} min`);
  await page.locator('.pw-sp').click();
  await page.locator('[data-pl="special-del"]').click();
  await expect(page.locator('.pw-sp')).toHaveCount(0);
  await expect(page.locator('#main [data-act="tanda-short"]')).toHaveText(`Empezar la tanda · ${await fit()} min`);
  // Lo borrado se queda marcado (para no resucitar al juntar con otro dispositivo)
  expect(await page.evaluate(() => import('/js/comun.js').then(({ S }) => S.prefs.plan.special.map(s => !!s.deleted)))).toEqual([true]);
});

test('nuevo examen en 2 días: «Así no llegas» con tres arreglos; aplicar, deshacer y quitar el examen', async ({ page }) => {
  await twoDecks(page);
  await openPlan(page);
  await page.locator('.pl-sec [data-pl="exam-new"]').last().click();
  await page.locator('#sheetBody .ex-opt', { hasText: JA }).click();
  const k = await dayIn(page, 2);
  for (let i = 0; i < 4 && !(await page.locator(`[data-pl="exam-day"][data-k="${k}"]`).count()); i++) await page.locator('[data-pl="exam-month"][data-d="-1"]').click();
  await page.locator(`[data-pl="exam-day"][data-k="${k}"]`).click();
  await expect(page.locator('#sheetBody .ex-tip')).toContainText('al día');
  await page.locator('[data-pl="exam-save"]').click();
  await expect(page.locator('#plSum')).toContainText('Así no llegas al examen de ' + JA);
  // Sin etapas ni semana: subir las nuevas al día (subir el nivel no mejora nada con una sola lista, y no sale)
  await expect(page.locator('.fix-opt')).toHaveCount(1);
  await page.locator('.fix-opt', { hasText: 'Subir las nuevas al día' }).click();
  await page.locator('[data-pl="fix-apply"]').click();
  expect(await page.evaluate(() => import('/js/comun.js').then(({ S }) => S.newPerDay))).toBeGreaterThan(15);
  await page.locator('#plSum [data-pl="undo"]').click();
  expect(await page.evaluate(() => import('/js/comun.js').then(({ S }) => S.newPerDay))).toBe(15);
  // La ficha del examen: la recta final, después del examen y quitarlo
  await page.locator('.pe-row', { hasText: JA }).click();
  await expect(page.getByRole('heading', { level: 1, name: JA })).toBeVisible();
  await expect(page.locator('#main')).toContainText('faltan 2 días');
  await expect(page.locator('#main')).toContainText('pasa a «Solo repasar»');
  await page.locator('[data-pl="exam-del"]').click();
  await page.locator('#sheetBody [data-act="exam-del-ok"]').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Plan de estudio' })).toBeVisible();
  await expect(page.locator('.pe-row')).toHaveCount(0);
});

test('etapa vigente: cambiar el foco en el Plan cambia la etapa, no el de siempre, y lo dice', async ({ page }) => {
  await twoDecks(page);
  await openPlan(page);
  await page.locator('.pl-sec [data-pl="stage-new"]').click();
  await page.locator('#stName').fill('Solo turco');
  const t = await dayIn(page, 0);
  await page.locator('#stFrom').fill(t);
  await page.locator('#stFrom').dispatchEvent('change');
  const ja = await deckId(page, JA);
  await page.locator(`#sheetBody [data-pl="st-level"][data-key="${ja}"][data-v="paused"]`).click();
  await page.locator('[data-pl="st-save"]').click();
  await expect(page.locator('.ps-card')).toContainText('Solo turco');
  await expect(row(page, JA).locator('.pill')).toHaveText('Pausa');
  await row(page, JA).click();
  await expect(page.locator('#sheetBody .pl-stage-note')).toHaveText('Cambia el foco en la etapa «Solo turco»');
  await page.locator('#sheetBody .lv-seg').getByRole('button', { name: 'Poco', exact: true }).click();
  const p = await page.evaluate(() => import('/js/comun.js').then(({ S }) => ({ nodes: S.prefs.plan.nodes, stages: S.prefs.plan.stages })));
  expect(p.nodes[ja]).toBeUndefined();
  expect(p.stages[0].levels[ja]).toBe('low');
});

test('orden de temas: las nuevas salen solo de la primera lista sin terminar de la carpeta', async ({ page }) => {
  await twoDecks(page);
  const q = await page.evaluate(async ([JA, TR]) => {
    const { S, newPlan } = await import('/js/comun.js'); const { dayKey, addDays } = await import('/js/plan.js');
    S.folders.set('fx', { id: 'fx', name: 'Idiomas', parent_id: null });
    const ja = [...S.decks.values()].find(d => d.name === JA), tr = [...S.decks.values()].find(d => d.name === TR);
    ja.folder_id = 'fx'; tr.folder_id = 'fx';
    const before = Object.fromEntries(newPlan('all'));
    S.prefs.plan.stages = [{ id: 'e1', name: 'Turco primero', from: dayKey(), to: addDays(dayKey(), 20), levels: { 'f:fx': 'high' }, order: { fx: [{ deck: tr.id }, { deck: ja.id }] } }];
    const after = Object.fromEntries(newPlan('all'));
    return { before: [before[ja.id] || 0, before[tr.id] || 0], after: [after[ja.id] || 0, after[tr.id] || 0] };
  }, [JA, TR]);
  expect(q.before[0]).toBeGreaterThan(0);
  expect(q.before[1]).toBeGreaterThan(0);
  expect(q.after).toEqual([0, 15]);
});

test('primera vez: con exámenes y sin etapas, «Hagamos tu plan» propone etapas y «Me vale» las guarda', async ({ page }) => {
  await twoDecks(page);
  const [a, b] = [await dayIn(page, 30), await dayIn(page, 90)];
  await page.evaluate(async ([JA, TR, a, b]) => {
    const { S } = await import('/js/comun.js');
    const id = n => [...S.decks.values()].find(d => d.name === n).id;
    S.prefs.plan.nodes[id(TR)] = { exam: a, lastWeek: true, after: 'reviews' };
    S.prefs.plan.nodes[id(JA)] = { exam: b, lastWeek: true, after: 'reviews' };
  }, [JA, TR, a, b]);
  await openPlan(page);
  await page.locator('#main .pl-start').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Hagamos tu plan' })).toBeVisible();
  await page.locator('[data-pl="start-min"][data-v="60"]').click();
  await expect(page.locator('.psx')).toHaveCount(4);
  await expect(page.locator('.psx').first()).toContainText('Acabar el temario de Turco');
  await page.locator('[data-pl="start-ok"]').click();
  await expect(page.locator('.ps-card')).toHaveCount(4);
  await expect(page.locator('#main .pl-start')).toHaveCount(0);
  // Después del último examen no hay etapa nueva
  const last = await page.evaluate(() => import('/js/comun.js').then(({ S }) => S.prefs.plan.stages.map(s => s.to).sort().at(-1)));
  expect(last).toBe(b);
  expect(await page.evaluate(() => import('/js/comun.js').then(({ S }) => S.prefs.plan.week.mon))).toBe(60);
});

test('ordenador: tocar una barra abre su panel con el nivel @ambos', async ({ page }, info) => {
  test.skip(info.project.name !== 'escritorio', 'el planificador es del ordenador');
  await twoDecks(page);
  await openPlan(page);
  await page.locator('.tp-bar').first().click();
  await expect(page.locator('#ptPanel')).toBeVisible();
  await page.locator('#ptPanel [data-pl="set-level"][data-v="high"]').click();
  await expect(page.locator('#ptPanel [data-v="high"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-pl="mode"][data-v="weeks"]').click();
  await expect(page.locator('.tp-col').first()).not.toHaveText(/^[a-z]{3}$/);
});
