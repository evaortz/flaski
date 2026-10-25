// Plan nuevo (paso B, interruptor de pruebas «plan2»): Hoy, el Plan y la tanda leen today() del motor.
// «Hecho por hoy» desde Hoy, el Plan y una lista; «Hoy solo tengo…»; pausa y vuelta; Tu tiempo; por qué esta pregunta
import { test, expect, openApp, nav, answer, openDeck } from './fixtures.js';

const DAY = 864e5;
const qs = (n, p = 'p') => Array.from({ length: n }, (_, i) => [`${p}${i}`, `r${i}`]);
const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('flaski-plan2', '1'); } catch {} });
});
// Cambia el plan nuevo (S.prefs.plan2), lo guarda y vuelve a abrir la app
async function setPlan(page, week, extra = {}) {
  await page.evaluate(async ([week, extra]) => {
    const api = await import('/js/api.js'); const { S } = await import('/js/comun.js'); const { editPlan2 } = await import('/js/plan2-app.js');
    const p = editPlan2();
    p.time.week = week;
    Object.assign(p.time, extra);
    await api.saveSettings(S.uid, S.newPerDay, S.prefs);
  }, [week, extra]);
  await page.reload();
  await expect(page.locator('#main :is(.spin, .skel)')).toHaveCount(0);
}
const every = m => Object.fromEntries(WEEK.map(d => [d, m]));
const toPlan = async page => { await nav(page, 'Perfil'); await page.locator('#main [data-nav="plan"]').click(); await expect(page.getByRole('heading', { name: 'Plan de estudio' })).toBeVisible(); };

test('40 repasos y 5 min: caben 25; tras la tanda de Hoy, «Hecho por hoy» en Hoy y en el Plan, y lo que sobra, como enlace', async ({ page, seed }) => {
  await seed({ decks: [{ name: 'Repaso', cards: qs(40), studied: { due: 0, interval: 10 } }] });
  await openApp(page);
  await setPlan(page, every(5));
  // El plan no miente: no caben todos
  await expect(page.locator('#main .p2-tanda')).toContainText('Tu tanda de hoy · 5 min');
  await expect(page.locator('#main .p2-legend')).toHaveText('40 repasos');
  await expect(page.locator('#main .p2-short')).toHaveText('Hoy tienes 40 repasos y 5 min: caben 25. Lo que quede pasa a mañana.');
  await page.locator('#main .p2-go').click();
  await expect(page.locator('.studybar')).toBeVisible();
  for (let i = 0; i < 25; i++) await answer(page, 3);
  await nav(page, 'Hoy');
  await expect(page.locator('#main .hero h1')).toHaveText('Hecho por hoy');
  await expect(page.locator('#main .day-done')).toContainText('25 preguntas');
  await expect(page.locator('#main .p2-go, #main .hero-go')).toHaveCount(0);
  await expect(page.locator('#main .day-rest')).toHaveText(/^Quedan 15 repasos · otra tanda de \d+ min$/);
  await toPlan(page);
  await expect(page.locator('#main .day-done')).toContainText('Hecho por hoy');
  await expect(page.locator('#main [data-act="tanda-short"]')).toHaveCount(0);
  await expect(page.locator('#main .day-rest')).toHaveText(/^Quedan 15 repasos/);
});

test('«Hecho por hoy» tras la tanda del Plan y tras estudiar desde una lista', async ({ page, seed }) => {
  await seed({ decks: [{ name: 'Repaso', cards: qs(40), studied: { due: 0, interval: 10 } }] });
  await openApp(page);
  await setPlan(page, every(5));
  // Desde el Plan: «Hoy toca» con los mismos números que Hoy
  await toPlan(page);
  await expect(page.locator('#main .section-h:has(#h-today) .sec-note')).toContainText('40 preguntas');
  await expect(page.locator('#main .ht-why')).toHaveText('Hoy 0 nuevas: tienes 5 min y 40 repasos, y caben 25.');
  await page.locator('#main [data-act="tanda-short"]').click();
  for (let i = 0; i < 12; i++) await answer(page, 3);
  // …y el resto desde la lista
  await openDeck(page, 'Repaso');
  await page.locator('#main [data-start]').first().click();
  for (let i = 0; i < 13; i++) await answer(page, 3);
  await nav(page, 'Hoy');
  await expect(page.locator('#main .hero h1')).toHaveText('Hecho por hoy');
  await expect(page.locator('#main .day-done')).toContainText('25 preguntas');
});

test('el domingo libre, Hoy y el Plan dicen el mismo número de repasos', async ({ page, seed }) => {
  await seed({ decks: [{ name: 'Repaso', cards: qs(48), studied: { due: 0, interval: 10 } }] });
  await openApp(page);
  await setPlan(page, every(0));
  await expect(page.locator('#main .hero h1')).toHaveText('Hoy es tu día libre');
  await expect(page.locator('#main .hero .p2-n')).toHaveText('48 repasos');
  await toPlan(page);
  await expect(page.locator('#main .section-h:has(#h-today) .sec-note')).toContainText('48 preguntas');
  await expect(page.locator('#main .ht-legend')).toContainText('repasos · 48');
});

test('«Hoy solo tengo 10 min» cambia solo hoy: menos nuevas, y se vuelve a lo de siempre', async ({ page, seed }) => {
  await seed({ decks: [{ name: 'Temario', cards: qs(100) }] });
  await openApp(page);
  await setPlan(page, every(45));
  // 45 min: las 15 nuevas al día de Ajustes (el tope)
  await expect(page.locator('#main .p2-legend')).toHaveText('15 nuevas');
  await page.locator('#main [data-p2="today-min"]').click();
  await page.locator('#sheetBody [data-p2="today-set"][data-min="5"]').click();
  // 5 min a 40 s por nueva: 7
  await expect(page.locator('#main .p2-tanda')).toContainText('Tu tanda de hoy · 5 min');
  await expect(page.locator('#main .p2-legend')).toHaveText('7 nuevas');
  await expect(page.locator('#main .p2-less')).toContainText('Hoy, 5 min.');
  const week = await page.evaluate(() => import('/js/plan2-app.js').then(m => m.plan2().time.week.mon));
  expect(week).toBe(45);
  await page.locator('#main .p2-less [data-p2="today-reset"]').click();
  await expect(page.locator('#main .p2-legend')).toHaveText('15 nuevas');
  // Mañana ya no cuenta
  await page.locator('#main [data-p2="today-min"]').click();
  await page.locator('#sheetBody [data-p2="today-set"][data-min="10"]').click();
  await expect(page.locator('#main .p2-tanda')).toContainText('10 min');
  await page.clock.install({ time: new Date(Date.now() + DAY) });
  await page.reload();
  await expect(page.locator('#main .p2-tanda')).toContainText('Tu tanda de hoy · 45 min');
});

test('pausa de 3 días y vuelta: en pausa no toca nada; al volver, el plan sigue', async ({ page, seed }) => {
  await seed({ decks: [{ name: 'Temario', cards: qs(60) }, { name: 'Repaso', cards: qs(20, 'x'), studied: { due: 1, interval: 5 } }] });
  await openApp(page);
  await setPlan(page, every(30));
  await nav(page, 'Perfil');
  await page.locator('#main [data-nav="plan"]').click();
  await page.locator('#main [data-p2="time"]').click();
  await expect(page.getByRole('heading', { name: 'Tu tiempo' })).toBeVisible();
  await page.locator('#main [data-p2="pause"]').click();
  const to = await page.evaluate(() => import('/js/plan.js').then(m => m.addDays(m.dayKey(), 2)));
  await page.locator('#psTo').fill(to);
  await page.locator('#sheetBody [data-p2="pause-save"]').click();
  await expect(page.locator('#main .p2-pause')).toContainText('En pausa hasta el');
  await nav(page, 'Hoy');
  await expect(page.locator('#main .hero h1')).toHaveText('Estás en pausa');
  // Pasados los 3 días: la tanda vuelve, con los repasos que se juntaron
  await page.clock.install({ time: new Date(Date.now() + 3 * DAY) });
  await page.reload();
  await expect(page.locator('#main .p2-tanda')).toContainText('Tu tanda de hoy · 30 min');
  await expect(page.locator('#main .p2-legend')).toContainText('20 repasos');
});

test('Tu tiempo: más minutos el día de hoy dan más nuevas en Hoy, y «Cuánto te cunde» lo cuenta @ambos', async ({ page, seed }) => {
  await seed({ decks: [{ name: 'Temario', cards: qs(100) }] });
  await openApp(page);
  await setPlan(page, every(5));
  await expect(page.locator('#main .p2-legend')).toHaveText('7 nuevas');
  await nav(page, 'Perfil');
  await page.locator('#main [data-nav="plan"]').click();
  await page.locator('#main [data-p2="time"]').click();
  await expect(page.locator('#main .p2-cunde')).toContainText('40 s');
  await expect(page.locator('#main .p2-cunde')).toContainText('Aún tienes pocas respuestas');
  await expect(page.locator('#p2Cunde')).toHaveText(/Un día de 5 min da para unos \d+ repasos? y \d+ nuevas/);
  const wd = await page.evaluate(() => import('/js/plan.js').then(m => ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'][m.weekdayOf(m.dayKey())]));
  await page.locator(`#p2w-${wd}`).fill('10');
  await expect(page.locator(`#p2w-${wd} + output`)).toHaveText('10 min');
  await expect(page.locator('#p2WeekTotal')).toHaveText('40 min a la semana');
  await nav(page, 'Hoy');
  await expect(page.locator('#main .p2-legend')).toHaveText('15 nuevas');
  await expect(page.locator('#main .p2-tanda')).toContainText('10 min');
});

test('en la tanda, al mantener pulsada la pregunta, dice por qué sale', async ({ page, seed }) => {
  await seed({ decks: [{ name: 'T3 · Cortes Generales', cards: qs(5) }] });
  await openApp(page);
  await setPlan(page, every(30));
  await page.locator('#main .p2-go').click();
  const card = page.locator('article.card');
  const box = await card.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await expect(page.locator('.p2-why')).toHaveText('Es nueva de T3 · Cortes Generales');
});

test('sin el interruptor, Hoy sigue como antes', async ({ page, seed }) => {
  await page.addInitScript(() => { try { localStorage.removeItem('flaski-plan2'); } catch {} });
  await seed({ decks: [{ name: 'Temario', cards: qs(30) }] });
  await openApp(page);
  await expect(page.locator('#main .hero-num')).toBeVisible();
  await expect(page.locator('#main .p2-tanda')).toHaveCount(0);
});
