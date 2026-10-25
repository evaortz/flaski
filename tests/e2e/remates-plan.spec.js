// Remates del plan, Explorar y el simulacro: «La tienes» por origen (y, de respaldo, por nombre), huecos en la
// vista previa, mínimo de 10 s por pregunta en las estimaciones; la última semana, «Hagamos tu plan» y los arreglos
import { test, expect, openApp, nav, addBuiltinDeck } from './fixtures.js';

const opos = async page => { await nav(page, 'Explorar'); await page.locator('.ex-chip', { hasText: 'Oposiciones' }).click(); };

test('Explorar: un tema de ejemplo añadido lleva su origen y sale «La tienes»', async ({ page }) => {
  await openApp(page);
  await opos(page);
  await page.locator('[data-ex="add-tema"]').first().click();
  await expect(page.locator('#pgTitle')).toBeVisible();   // al añadirlo se abre el apunte
  await opos(page);
  await expect(page.locator('.ex-row [data-ex="open-tema"]')).toHaveText('La tienes');
  expect(await page.evaluate(() => import('/js/comun.js').then(({ S }) => [...S.decks.values()][0].source))).toBe('tema:constitucion-titulo-preliminar');
  // Aunque cambies el nombre del apunte y de la lista, se reconoce por el origen
  await page.evaluate(() => import('/js/comun.js').then(({ S }) => { for (const p of S.pages.values()) p.title = 'Mi tema 1'; for (const d of S.decks.values()) d.name = 'Mi tema 1'; }));
  await nav(page, 'Hoy');
  await opos(page);
  await expect(page.locator('.ex-row [data-ex="open-tema"]')).toHaveText('La tienes');
});

test('Explorar: las listas de antes (sin origen) se reconocen por el nombre sin acentos ni palabras de en medio', async ({ page }) => {
  await openApp(page);
  await page.evaluate(async () => {
    const api = await import('/js/api.js'); const { S } = await import('/js/comun.js');
    const d = await api.createDeck({ owner: S.uid, name: 'La Constitucion · Titulo Preliminar', description: '', source: 'apuntes', folder_id: null });
    S.decks.set(d.id, { tags: [], ...d });
  });
  await opos(page);
  await expect(page.locator('.ex-row [data-ex="open-tema"]')).toHaveText('La tienes');
  await page.locator('.ex-row [data-ex="open-tema"]').click();
  await expect(page.getByRole('heading', { level: 1, name: 'La Constitucion · Titulo Preliminar' })).toBeVisible();
});

test('Explorar: la vista previa pinta los huecos como en la tanda y la respuesta aparte', async ({ page }) => {
  await openApp(page);
  await opos(page);
  await page.locator('.ex-row [data-ex="see-tema"]').first().click();
  await expect(page.locator('#sheetBody .preview li')).toHaveCount(5);
  await expect(page.locator('#sheetBody')).not.toContainText('{{');
  const row = page.locator('#sheetBody .preview li', { hasText: 'ratificada en referéndum' });
  await expect(row.locator('span')).toContainText('[…]');
  await expect(row.locator('b')).toContainText('1978');
});

test('estimaciones con un mínimo de 10 s por pregunta: Hoy y «salen unas X al día» del Plan', async ({ page }) => {
  await openApp(page);
  await nav(page, 'Explorar');
  await page.locator('[data-ex="add-builtin"][data-file="aleman-a2.json"]').click();
  await expect(page.locator('#main [data-builtin="aleman-a2.json"] .go')).toHaveText('La tienes');
  // 40 respuestas de 2 s
  await page.evaluate(() => import('/js/comun.js').then(({ S }) => { const now = Date.now(); S.events = Array.from({ length: 40 }, (_, i) => ({ ms: 2000, t: now - i * 1000, grade: 3 })); }));
  expect(await page.evaluate(() => import('/js/pantallas/estudio.js').then(m => m.shortInfo().secs))).toBe(10);
  await nav(page, 'Hoy');
  const t = await page.locator('#main .hero-go small').textContent();
  const [, min, n] = /(\d+) min · (\d+) pregunta/.exec(t).map(Number);
  expect(min).toBeGreaterThanOrEqual(Math.ceil((n * 10) / 60));
  await nav(page, 'Perfil');
  await page.locator('#main [data-nav="plan"]').click();
  await expect(page.locator('#plSum')).toContainText('Con tus tandas de 10 min salen unas 60 preguntas al día');
});

/* ---------------- Plan: la última semana, «Hagamos tu plan» y los arreglos ---------------- */
const JA = 'Japonés · Demo de Flaski', TR = 'Turco · Armonía vocálica';
const dayIn = (page, n) => page.evaluate(async n => { const { dayKey, addDays } = await import('/js/plan.js'); return addDays(dayKey(), n); }, n);
const deckId = (page, name) => page.evaluate(n => import('/js/comun.js').then(({ S }) => [...S.decks.values()].find(d => d.name === n).id), name);
async function openPlan(page) {
  await nav(page, 'Perfil');
  await page.locator('#main [data-nav="plan"]').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Plan de estudio' })).toBeVisible();
}
async function newExam(page, name, days) {
  await page.locator('.pl-sec [data-pl="exam-new"]').last().click();
  await page.locator('#sheetBody .ex-opt', { hasText: name }).click();
  const k = await dayIn(page, days);
  for (let i = 0; i < 6 && !(await page.locator(`[data-pl="exam-day"][data-k="${k}"]`).count()); i++) await page.locator(`[data-pl="exam-month"][data-d="${days > 60 ? 1 : -1}"]`).click();
  await page.locator(`[data-pl="exam-day"][data-k="${k}"]`).click();
}
const need = async page => Number(/≈ (\d+)/.exec(await page.locator('#sheetBody .ex-tip').textContent())[1]);

test('examen nuevo: «solo repasos» la última semana solo a más de 21 días; dentro de esa semana no se activa; la hoja cuenta los días libres', async ({ page }) => {
  await openApp(page);
  await addBuiltinDeck(page, JA);
  await addBuiltinDeck(page, TR);
  await openPlan(page);
  const ja = await deckId(page, JA);
  const left = await page.evaluate(async id => { const { S } = await import('/js/comun.js'); return [...S.cards.values()].filter(c => c.deck_id === id && !S.progress.get(c.id)).length; }, ja);
  // A 30 días: sin la última semana quedan 23 días con nuevas
  await newExam(page, JA, 30);
  expect(await need(page)).toBe(Math.ceil(left / 23));
  await page.locator('[data-pl="exam-save"]').click();
  expect(await page.evaluate(id => import('/js/comun.js').then(({ S }) => S.prefs.plan.nodes[id].lastWeek), ja)).toBe(true);
  // Con 10 días especiales sin estudiar, quedan 13
  await page.evaluate(async () => { const { S } = await import('/js/comun.js'); const { dayKey, addDays } = await import('/js/plan.js'); S.prefs.plan.special = [{ id: 'v', name: 'vacaciones', from: addDays(dayKey(), 1), to: addDays(dayKey(), 10), minutes: 0, at: 1 }]; });
  await page.locator('.pe-row', { hasText: JA }).click();
  await page.locator('[data-pl="exam-edit"]').click();
  expect(await need(page)).toBe(Math.ceil(left / 13));
  await page.keyboard.press('Escape');
  // A 10 días: sin «solo repasos»
  await page.evaluate(() => import('/js/comun.js').then(({ S }) => { S.prefs.plan.special = []; }));
  await openPlan(page);
  await newExam(page, TR, 10);
  await page.locator('[data-pl="exam-save"]').click();
  const tr = await deckId(page, TR);
  expect(await page.evaluate(id => import('/js/comun.js').then(({ S }) => S.prefs.plan.nodes[id].lastWeek), tr)).toBe(false);
  // A 5 días, ya dentro de la última semana: no se puede activar
  await page.evaluate(async id => { const { S } = await import('/js/comun.js'); const { dayKey, addDays } = await import('/js/plan.js'); S.prefs.plan.nodes[id].exam = addDays(dayKey(), 5); }, tr);
  await openPlan(page);
  await page.locator('.pe-row', { hasText: TR }).click();
  await expect(page.locator('#main')).toContainText('Ya estás en la última semana: las nuevas siguen entrando hasta el examen.');
  await expect(page.locator('[data-pl="exam-last"]')).toBeDisabled();
});

test('«Cómo arreglarlo»: con la última semana activada a mano ofrece que sigan entrando nuevas, y nunca un arreglo que no mejora', async ({ page }) => {
  await openApp(page);
  await addBuiltinDeck(page, JA);
  const ja = await deckId(page, JA);
  await page.evaluate(async id => {
    const { S } = await import('/js/comun.js'); const { dayKey, addDays } = await import('/js/plan.js');
    S.prefs.plan.nodes[id] = { exam: addDays(dayKey(), 10), lastWeek: true, after: 'reviews' };
    S.prefs.plan.week = { mon: 15, tue: 15, wed: 15, thu: 15, fri: 15, sat: 15, sun: 15 };
    S.newPerDay = 2;
  }, ja);
  await openPlan(page);
  await expect(page.locator('#plSum')).toContainText('Así no llegas');
  const left = Number(/te faltarían unas (\d+)/.exec(await page.locator('#plSum').textContent())[1]);
  const opt = page.locator('.fix-opt', { hasText: 'Que sigan entrando nuevas hasta el examen' });
  await expect(opt).toHaveCount(1);
  for (const t of await page.locator('.fix-opt small').allTextContents()) {
    const m = /aún te faltarían (\d+)/.exec(t);
    if (m) expect(Number(m[1])).toBeLessThan(left);
  }
  await opt.click();
  await page.locator('[data-pl="fix-apply"]').click();
  expect(await page.evaluate(id => import('/js/comun.js').then(({ S }) => S.prefs.plan.nodes[id].lastWeek), ja)).toBe(false);
});

test('«Hagamos tu plan»: recta final del 25 % (entre 2 y 7 días), los minutos cambian las nuevas y nunca propone no llegar', async ({ page }) => {
  await openApp(page);
  await addBuiltinDeck(page, JA);
  const ja = await deckId(page, JA);
  const [t, ex] = [await dayIn(page, 0), await dayIn(page, 8)];
  await page.evaluate(async ([id, ex]) => { const { S } = await import('/js/comun.js'); S.prefs.plan.nodes[id] = { exam: ex, lastWeek: false, after: 'reviews' }; }, [ja, ex]);
  await openPlan(page);
  await page.locator('#main .pl-start').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Hagamos tu plan' })).toBeVisible();
  const stages = await page.evaluate(() => import('/js/comun.js').then(({ S }) => S.planStart.stages.map(s => [s.from, s.to])));
  expect(stages).toEqual([[t, await dayIn(page, 5)], [await dayIn(page, 6), ex]]);
  // Nunca «Así no llegas»: la propuesta dice cuántas nuevas hacen falta
  await expect(page.locator('.st-verdict.bad')).toHaveCount(0);
  await expect(page.locator('.pls-npd')).toContainText(/(Para llegar|Con) \d+ nuevas al día/);
  // Con el examen lejos, 15 min y 1 h no proponen lo mismo
  await page.evaluate(async id => { const { S } = await import('/js/comun.js'); const { dayKey, addDays } = await import('/js/plan.js'); S.prefs.plan.nodes[id].exam = addDays(dayKey(), 200); }, ja);
  await page.locator('[data-pl="start-min"][data-v="15"]').click();
  const a = await page.evaluate(() => import('/js/comun.js').then(({ S }) => S.planStart.npd));
  await page.locator('[data-pl="start-min"][data-v="60"]').click();
  const b = await page.evaluate(() => import('/js/comun.js').then(({ S }) => S.planStart.npd));
  expect(b).toBeGreaterThan(a);
  await page.locator('[data-pl="start-ok"]').click();
  expect(await page.evaluate(() => import('/js/comun.js').then(({ S }) => S.newPerDay))).toBe(b);
});

test('móvil: en la tira de etapas, una etapa de 1 día mide al menos 28 px y se puede tocar', async ({ page }, info) => {
  test.skip(info.project.name !== 'movil', 'la tira es del móvil');
  await openApp(page);
  await addBuiltinDeck(page, JA);
  await page.evaluate(async () => {
    const { S } = await import('/js/comun.js'); const { dayKey, addDays } = await import('/js/plan.js');
    const d = [...S.decks.values()][0], t = dayKey();
    S.prefs.plan.stages = [{ id: 'e1', name: 'Larga', from: t, to: addDays(t, 120), levels: { [d.id]: 'normal' }, order: {}, at: 1 },
      { id: 'e2', name: 'Un día', from: addDays(t, 121), to: addDays(t, 121), levels: { [d.id]: 'high' }, order: {}, at: 1 }];
  });
  await openPlan(page);
  const seg = page.locator('.ps-seg[data-id="e2"]');
  expect((await seg.boundingBox()).width).toBeGreaterThanOrEqual(28);
  await seg.click();
  await expect(page.locator('#stName')).toHaveValue('Un día');
});

test('Plan › Hoy toca: dice el porqué de las nuevas de hoy («Hoy 20 nuevas: tienes 90 min») y nunca pasa del doble', async ({ page }) => {
  await openApp(page);
  await addBuiltinDeck(page, JA);
  await page.evaluate(async () => {
    const { S } = await import('/js/comun.js'); const { WEEK, weekdayOf, dayKey } = await import('/js/plan.js');
    S.newPerDay = 10;
    S.prefs.plan.week = Object.fromEntries(WEEK.map(d => [d, 30]));
    S.prefs.plan.week[WEEK[weekdayOf(dayKey())]] = 90;
  });
  await openPlan(page);
  await expect(page.locator('.ht-why')).toHaveText('Hoy 20 nuevas: tienes 90 min, más que un día normal (39 min). Como mucho, el doble.');
});
