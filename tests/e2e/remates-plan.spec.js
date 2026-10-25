// Remates de Explorar: «La tienes» por origen (y, de respaldo, por nombre) y los huecos en la vista previa
// (las del plan de antes se fueron con él: ver plan-c.spec.js y plan2-hoy.spec.js)
import { test, expect, openApp, nav } from './fixtures.js';

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
    // con sus preguntas (una lista vacía es un tema a medias: se ofrece completarlo)
    for (const c of await api.createCards([{ deck_id: d.id, owner: S.uid, front: 'a', back: 'b', type_id: 'basic', template: 't1', fields: { q: 'a', a: 'b' } }])) S.cards.set(c.id, c);
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





