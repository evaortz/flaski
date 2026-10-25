// El domingo en Hoy (paso D · 7): «Tu semana», el «Simulacro de la semana» y, si vas 2 días o más por detrás, el
// Repaso de la semana a pantalla completa con sus dos opciones. Se apaga en Ajustes del plan
import { test, expect, openApp } from './fixtures.js';
import { readFileSync } from 'node:fs';

const D945 = readFileSync(new URL('../fixtures/oposicion-945.json', import.meta.url), 'utf8');
// Las 945 preguntas (domingo 25 oct, día libre); change(plan) cambia su plan antes de abrir
async function open945(page, time = '2026-10-25T10:00:00', change) {
  await page.clock.install({ time: new Date(time) });
  await page.addInitScript(d => { if (!sessionStorage.getItem('w945')) { sessionStorage.setItem('w945', '1'); localStorage.setItem('flaski-local-v1', d); } }, D945);
  await openApp(page);
  if (change) {
    await page.evaluate(async src => {
      const api = await import('/js/api.js'); const { S } = await import('/js/comun.js'); const { editPlan2 } = await import('/js/plan2-app.js');
      new Function('p', src)(editPlan2());
      await api.saveSettings(S.uid, S.newPerDay, S.prefs);
    }, `(${change})(p)`);
    await page.reload();
    await expect(page.locator('#main :is(.spin, .skel)')).toHaveCount(0);
  }
}
const plan = page => page.evaluate(() => import('/js/plan2-app.js').then(m => m.plan2()));
const saveNow = page => page.evaluate(async () => { const api = await import('/js/api.js'); const { S } = await import('/js/comun.js'); await api.saveSettings(S.uid, S.newPerDay, S.prefs); });

test('domingo libre: «Tu semana» (vas bien) y el Simulacro de la semana como única propuesta; «Refuerza este tema» con lo flojo', async ({ page }) => {
  // Lo previsto se guardó el lunes (sin días: los pasados cuentan lo hecho)
  await open945(page, '2026-10-25T10:00:00', p => { p.weekly = { on: true, seen: null, snap: { week: '2026-10-19', at: '2026-10-19', days: {}, finish: {} } }; });
  const wk = page.locator('#main .p2-wk');
  await expect(wk.getByRole('heading', { name: 'Tu semana' })).toBeVisible();
  await expect(wk.locator('.p2-pill')).toHaveText('vas bien');
  await expect(wk.locator('.p2-wd')).toHaveCount(7);
  await expect(wk).toContainText(/Acabas Auxiliar el \d+ \w+/);
  // El simulacro: lo visto (T1 a T3), con el formato del examen (aquí, de dar la vuelta); es la propuesta principal
  const sim = page.locator('#main .p2-wsim.main');
  await expect(sim).toContainText('Simulacro de la semana · opcional');
  await expect(sim.locator('h2')).toHaveText(/^\d+ preguntas de T1 a T3$/);
  await expect(sim).toContainText('con el formato de tu examen: 40 min, las mal restan');
  const reviews = await page.evaluate(() => import('/js/plan2-app.js').then(m => m.todayPlan().reviews));
  await expect(page.locator('#main .p2-sunfree')).toHaveText(`Hoy es tu día libre. Tocan ${reviews} repasos: si te apetece, 10 min de repasos adelantan el lunes; si no, pasan a mañana.`);
  // El enlace va en línea con el texto
  const ln = await page.locator('#main .p2-sunfree .link').evaluate(b => { const r = b.getBoundingClientRect(), p = b.parentElement.getBoundingClientRect(), lh = parseFloat(getComputedStyle(b.parentElement).lineHeight); return { h: r.height, lh, after: r.left > p.left + 20, margin: getComputedStyle(b).marginLeft }; });
  expect(ln.h).toBeLessThanOrEqual(ln.lh + 1);
  expect(ln.margin).toBe('0px');
  expect(ln.after).toBe(true);
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, fullPage: true });
  await expect(page.locator('#main .p2-tanda')).toHaveCount(0);
  await expect(page.locator('#main .hoy-sim')).toHaveCount(0);
  // «Ver la semana»: la pantalla completa, con «Vas bien»
  await wk.locator('[data-p2="week-open"]').click();
  await expect(page.getByRole('heading', { name: 'Tu semana', level: 1 })).toBeVisible();
  await expect(page.locator('#main .p2-wok')).toContainText('Vas bien');
  await expect(page.locator('#main .p2-wopt')).toHaveCount(0);
  await page.locator('#main [data-p2="week-done"]').click();
  await expect(page.locator('#main .p2-wk')).toBeVisible();
  // Hacer el simulacro y entregarlo en blanco: todo sale flojo y se ofrece reforzarlo
  await page.locator('#main [data-p2="week-sim"]').click();
  await expect(page.locator('.sm-ht b')).toHaveText('Simulacro · Auxiliar · semana');
  await page.locator('.sm-head [data-sim="review"]').click();
  await page.locator('[data-sim="submit"]').click();
  // Las de dar la vuelta: decir que no sabías ninguna
  const self = page.locator('[data-sim="self"][data-v="no"]');
  for (let i = 0, n = await self.count(); i < n; i++) await self.nth(i).click();
  if (await page.locator('[data-sim="finish"]').count()) await page.locator('[data-sim="finish"]').click();
  await expect(page.locator('.sm-score')).toBeVisible();
  const weak = page.locator('.p2-weak li');
  await expect(weak.first()).toContainText('bien');
  await weak.first().locator('[data-p2="week-boost"]').click();
  await expect(page.locator('.p2-weak li').first()).toContainText('Reforzado hasta el');
  expect(Object.keys((await plan(page)).exams.find(e => e.name.startsWith('Auxiliar')).boost || {}).length).toBe(1);
});

test('una semana sin estudiar: el domingo se abre el Repaso de la semana; «Repartir lo que falta» pone unos minutos más la semana que viene', async ({ page }) => {
  // El lunes se guarda lo previsto
  await open945(page, '2026-10-26T10:00:00');
  await expect(page.locator('#main .p2-tanda')).toBeVisible();
  expect((await plan(page)).weekly.snap.week).toBe('2026-10-26');
  await saveNow(page);
  // El domingo, sin haber estudiado nada
  await page.clock.setSystemTime(new Date('2026-11-01T10:00:00'));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Tu semana', level: 1 })).toBeVisible();
  await expect(page.locator('#main .p2-wbehind h2')).toHaveText(/^Vas \d+ días por detrás$/);
  await expect(page.locator('#main .p2-wstats .p2-wbar').first()).toContainText('Días que estudiaste0 de 6');
  const opts = page.locator('#main .p2-wopt');
  await expect(opts).toHaveCount(2);
  await expect(opts.first()).toHaveAttribute('aria-checked', 'true');
  await expect(opts.first()).toContainText(/Repartir las \d+ que faltan en la semana/);
  await expect(opts.first()).toContainText('de lunes a sábado');
  await expect(opts.first()).toContainText(/Vuelves al \d+ \w+/);
  await expect(opts.nth(1)).toContainText(/Dejarlo asíEl plan se mueve \d+ días/);
  // Elegir y volver a elegir; con «Repartir», Hecho pone los días especiales de la semana que viene
  await opts.nth(1).click();
  await expect(opts.nth(1)).toHaveAttribute('aria-checked', 'true');
  await opts.first().click();
  await page.locator('#main [data-p2="week-done"]').click();
  await expect(page.locator('#main .p2-wk')).toBeVisible();
  const p = await plan(page);
  expect(p.time.special.filter(s => s.id.startsWith('rec-')).map(s => s.from)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07']);
  expect(p.time.special.find(s => s.from === '2026-11-02').minutes).toBeGreaterThan(45);
  expect(p.history[0].what).toMatch(/^Recuperas la semana: \d+ nuevas más al día, de lunes a sábado$/);
  expect(p.weekly.seen).toBe('2026-11-01');
  // Ya visto hoy: al volver a entrar no se abre solo
  await saveNow(page);
  await page.reload();
  await expect(page.locator('#main .p2-wk')).toBeVisible();
});

test('el primer domingo (sin lo previsto de antes) no hay semana que mirar', async ({ page }) => {
  await open945(page);
  await expect(page.locator('#main .hero')).toBeVisible();
  await expect(page.locator('#main .p2-wk')).toHaveCount(0);
  expect((await plan(page)).weekly.snap.at).toBe('2026-10-25');
});

test('domingo con tanda: la tanda va primero y la semana y el simulacro debajo; apagado en Ajustes del plan, nada', async ({ page }) => {
  await open945(page, '2026-10-25T10:00:00', p => { p.time.week = { ...p.time.week, sun: 30 }; p.weekly = { on: true, seen: null, snap: { week: '2026-10-19', at: '2026-10-19', days: {}, finish: {} } }; });
  await expect(page.locator('#main .p2-tanda')).toBeVisible();
  await expect(page.locator('#main .hero ~ .p2-wk')).toBeVisible();
  await expect(page.locator('#main .p2-wsim:not(.main)')).toContainText('Hacer el simulacro');
  await expect(page.locator('#main .p2-sunfree')).toHaveCount(0);
  // Apagado: ni la semana ni el simulacro
  await page.evaluate(async () => { const { editPlan2 } = await import('/js/plan2-app.js'); const { render } = await import('/js/app.js'); editPlan2().weekly.on = false; render(); });
  await expect(page.locator('#main .p2-tanda')).toBeVisible();
  await expect(page.locator('#main .p2-wk')).toHaveCount(0);
  await expect(page.locator('#main .p2-wsim')).toHaveCount(0);
});
