// Los atrasos con el plan: la fila de Hoy y del Plan, su hoja (repartirlas o hacerlas todas hoy), «¿adelantas 10
// atrasadas?» en vez de nuevas de más, y el final de la tanda cuando ya has hecho los minutos del día
import { test, expect, openApp, nav, answer, hoyCount } from './fixtures.js';
import { readFileSync } from 'node:fs';

const D945 = readFileSync(new URL('../fixtures/oposicion-945.json', import.meta.url), 'utf8');
// Las 945 preguntas, de vuelta tras 19 días sin estudiar (viernes 13 nov, 30 min)
async function back945(page) {
  await page.clock.install({ time: new Date('2026-11-13T10:00:00') });
  await page.addInitScript(d => { if (!sessionStorage.getItem('b945')) { sessionStorage.setItem('b945', '1'); localStorage.setItem('flaski-local-v1', d); } }, D945);
  await openApp(page);
}
const lateIn = async page => page.evaluate(() => import('/js/plan2-app.js').then(m => m.lateNow()));

test('de vuelta tras unos días: «N atrasadas · las repartes hasta el…» en Hoy y en el Plan; repartirlas o hacerlas todas hoy', async ({ page }) => {
  await back945(page);
  const l = await lateIn(page);
  expect(l.n).toBeGreaterThan(100);
  expect(l.until > '2026-11-13').toBe(true);
  const row = page.locator('#main .p2-late');
  await expect(row).toContainText(`${l.n} atrasadas`);
  await expect(row).toContainText(/las repartes hasta el (lunes|martes|miércoles|jueves|viernes|sábado|domingo)/);
  const text = await row.textContent();
  // Mientras tanto no caben todos los repasos: sin nuevas
  expect((await hoyCount(page)).new).toBe(0);
  await expect(page.locator('#main .p2-short')).toBeVisible();
  // El Plan dice lo mismo en «Qué toca ahora»
  await nav(page, 'Perfil');
  await page.locator('#main [data-nav="plan"]').click();
  await expect(page.locator('#main .p2-late')).toHaveText(text);
  // La hoja: cuántas, hasta cuándo, menos nuevas mientras tanto y las dos opciones
  await page.locator('#main .p2-late').click();
  await expect(page.locator('#sheetBody h2')).toHaveText('Lo atrasado, poco a poco');
  await expect(page.locator('#sheetBody')).toContainText(`${l.n} repasos atrasados`);
  await expect(page.locator('#sheetBody')).toContainText('Mientras tanto entran menos nuevas');
  await page.locator('#sheetBody [data-p2="late-spread"]').click();
  await expect(page.locator('#sheet')).toBeHidden();
  await expect(page.locator('#main .p2-late')).toHaveText(text);
  // «Hacerlas todas hoy»: la tanda de hoy las lleva todas, aunque pasen de tus minutos
  await nav(page, 'Hoy');
  await page.locator('#main .p2-late').click();
  await page.locator('#sheetBody [data-p2="late-all"]').click();
  await expect(page.locator('#main .p2-short')).toHaveCount(0);
  await expect(page.locator('#main .p2-late')).toContainText('las haces hoy');
  const due = await page.evaluate(async () => { const { S } = await import('/js/comun.js'); const end = new Date(); end.setHours(24, 0, 0, 0); return [...S.progress.values()].filter(p => p.due < end.getTime()).length; });
  expect((await hoyCount(page)).reviews).toBe(due);
  const size = await page.evaluate(async () => { const { shortSize } = await import('/js/pantallas/estudio.js'); return shortSize(30); });
  expect(size).toBe(due);
});

test('con atrasos, al acabar una tanda no se ofrecen nuevas de más: «¿Adelantas 10 atrasadas?»', async ({ page }) => {
  await back945(page);
  // El final de una tanda de una lista (sin minutos), con atrasos pendientes
  await page.evaluate(async () => {
    const { S } = await import('/js/comun.js'); const { go } = await import('/js/app.js');
    S.session = { scope: 'all', queue: [], done: 3, revealed: false, tally: { 1: 0, 2: 0, 3: 3, 4: 0 }, undo: null, st: null, startedAt: Date.now() - 60e3, minutes: 0, picked: false };
    go('study');
  });
  await expect(page.getByRole('heading', { name: '¡Tanda hecha!' })).toBeVisible();
  await expect(page.locator('.done-go button', { hasText: 'nuevas más' })).toHaveCount(0);
  await page.locator('.done-go [data-p2="late-10"]').click();
  await expect(page.locator('.studybar .left')).toContainText('pregunta 1 de 10 · repaso');
});

test('al acabar la tanda que completa los minutos del día: «Volver a Hoy» y lo que queda, con los mismos minutos que en Hoy', async ({ page, seed }) => {
  await seed({ decks: [{ name: 'Repaso', cards: Array.from({ length: 40 }, (_, i) => [`p${i}`, `r${i}`]), studied: { due: 0, interval: 10 } }] });
  await openApp(page);
  await page.evaluate(async () => {
    const api = await import('/js/api.js'); const { S } = await import('/js/comun.js'); const { editPlan2 } = await import('/js/plan2-app.js');
    editPlan2().time.week = { mon: 5, tue: 5, wed: 5, thu: 5, fri: 5, sat: 5, sun: 5 };
    await api.saveSettings(S.uid, S.newPerDay, S.prefs);
  });
  await page.reload();
  await expect(page.locator('#main :is(.spin, .skel)')).toHaveCount(0);
  await page.locator('#main .p2-go').click();
  for (let i = 0; i < 25; i++) await answer(page, 3);
  // El final: «Hecho por hoy», sin «Otra tanda» como botón principal, y lo que queda como enlace
  await expect(page.locator('.done h2')).toHaveText('Hecho por hoy');
  await expect(page.locator('.done-go .primary')).toHaveText('Volver a Hoy');
  await expect(page.locator('.done-go', { hasText: 'Otra tanda' })).toHaveCount(0);
  const rest = await page.locator('.done .day-rest').textContent();
  expect(rest).toMatch(/^Quedan 15 repasos · otra tanda de \d+ min$/);
  await page.locator('.done-go .primary').click();
  await expect(page.locator('#main .hero h1')).toHaveText('Hecho por hoy');
  await expect(page.locator('#main .day-rest')).toHaveText(rest);
});
