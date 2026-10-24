// Plan de estudio: pausar mazos, «solo repasos», repartir el foco y fechas de examen
import { test, expect, openApp, nav, addBuiltinDeck } from './fixtures.js';

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
const row = (page, name) => page.locator('.pl-row').filter({ has: page.locator('.pl-name', { hasText: name }) });
async function setState(page, name, label) {
  const r = row(page, name);
  if (!(await r.evaluate(el => el.open))) await r.locator('summary').click();
  await row(page, name).locator('[data-plstate]').getByRole('button', { name: label, exact: true }).click();
}

test('en pausa: sale de lo de hoy y de las sesiones de «Todo», y se recuerda', async ({ page }) => {
  await twoDecks(page);
  await openPlan(page);
  await setState(page, JA, 'En pausa');
  await expect(row(page, JA).locator('.pl-meta')).toContainText('En pausa');
  await nav(page, 'Hoy');
  // La sesión de «Todo» no trae tarjetas del mazo en pausa
  await page.locator('#main [data-start="all"]').click();
  for (let i = 0; i < 4; i++) {
    await expect(page.locator('.studybar .where').first()).toContainText('Turco');
    await page.locator('[data-act="reveal"]').click();
    await page.locator('[data-grade="3"]').click();
  }
  await page.locator('.studybar [data-act="exit"]').click();
  // Y se recuerda al recargar
  await page.reload();
  await expect(page.locator('#main .spin')).toHaveCount(0);
  await openPlan(page);
  await expect(row(page, JA).locator('.pl-meta')).toContainText('En pausa');
});

test('solo repasos: ese mazo ya no da nuevas', async ({ page }) => {
  await twoDecks(page);
  await openPlan(page);
  await setState(page, TR, 'Solo repasos');
  await expect(row(page, TR).locator('.pl-meta')).toContainText('Solo repasos');
  await expect(row(page, TR).locator('.pl-meta')).not.toContainText('nueva');
  await expect(row(page, JA).locator('.pl-meta')).toContainText('≈ 15 nuevas al día');
});

test('el foco reparte las nuevas de cada día entre los mazos', async ({ page }) => {
  await twoDecks(page);
  await openPlan(page);
  const perDay = async name => Number(/≈ (\d+) nueva/.exec(await row(page, name).locator('.pl-meta').textContent())?.[1] || 0);
  const a0 = await perDay(JA), b0 = await perDay(TR);
  expect(a0 + b0).toBe(15);
  await row(page, JA).locator('summary').click();
  const slider = row(page, JA).locator('[data-plw]');
  await slider.evaluate(el => { el.value = '80'; el.dispatchEvent(new Event('change', { bubbles: true })); });
  await expect(row(page, JA).locator('.pl-meta')).toContainText('80 %');
  await expect(row(page, TR).locator('.pl-meta')).toContainText('20 %');
  expect(await perDay(JA)).toBe(12);
  expect(await perDay(TR)).toBe(3);
  await page.locator('[data-act="plan-equal"]').click();
  await expect(row(page, JA).locator('.pl-meta')).toContainText('50 %');
});

test('fecha de examen: avisa si a ese ritmo no da tiempo', async ({ page }) => {
  await twoDecks(page);
  await openPlan(page);
  await row(page, JA).locator('summary').click();
  const d = new Date(Date.now() + 2 * 864e5);
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await row(page, JA).locator('[data-plexam]').fill(iso);
  await expect(row(page, JA).locator('.pl-meta')).toContainText('examen en 2 días');
  await expect(row(page, JA).locator('.pl-warn')).toContainText('no te da tiempo');
  // El examen se lleva primero las nuevas que necesita
  const n = Number(/≈ (\d+) nueva/.exec(await row(page, JA).locator('.pl-meta').textContent())[1]);
  expect(n).toBe(15);
  await row(page, JA).locator('[data-plclear]').click();
  await expect(row(page, JA).locator('.pl-warn')).toHaveCount(0);
});
