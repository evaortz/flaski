// El reparto con «Sin examen»: un porcentaje para lo que no tiene examen y, dentro, el peso de cada carpeta
// (Poco, Normal, Mucho); Hoy y el Plan dicen lo mismo y el examen sigue llegando (o avisa)
import { test, expect, openApp, nav, hoyCount, deckMenu } from './fixtures.js';

const qs = (n, p) => Array.from({ length: n }, (_, i) => [`${p}${i}`, `r${i}`]);
const DATA = { folders: ['Auxiliar', 'Lecturas', 'Idiomas'], decks: [
  { name: 'T1 · Constitución', folder: 'Auxiliar', cards: qs(60, 'a') }, { name: 'T2 · Estatuto', folder: 'Auxiliar', cards: qs(60, 'b') },
  { name: 'Novelas', folder: 'Lecturas', cards: qs(50, 'c') }, { name: 'Ensayos', folder: 'Lecturas', cards: qs(50, 'd') },
  { name: 'Turco', folder: 'Idiomas', cards: qs(50, 'e') }, { name: 'Alemán', folder: 'Idiomas', cards: qs(50, 'f') },
] };

async function setup(page, seed) {
  await seed(DATA);
  await openApp(page);
  await page.evaluate(async () => {
    const api = await import('/js/api.js'); const { S } = await import('/js/comun.js'); const { editPlan2 } = await import('/js/plan2-app.js'); const { dayKey, addDays } = await import('/js/plan.js');
    const fid = [...S.folders.values()].find(f => f.name === 'Auxiliar').id;
    const p = editPlan2();
    p.time.week = { mon: 30, tue: 30, wed: 30, thu: 30, fri: 30, sat: 30, sun: 30 };
    p.caps = { ...(p.caps || {}), newPerDay: 20 };
    p.exams.push({ id: 'ex-Aux', name: 'Auxiliar', scope: { folders: [fid], decks: [], pages: [] }, date: addDays(dayKey(), 90), order: [], mode: 'seq', shares: {}, fixed: {}, known: [], exclude: [], lastWeek: false, after: null, retention: 0.9 });
    await api.saveSettings(S.uid, S.newPerDay, S.prefs);
  });
  await page.reload();
  await expect(page.locator('#main :is(.spin, .skel)')).toHaveCount(0);
}
const toPlan = async page => { await nav(page, 'Perfil'); await page.locator('#main [data-nav="plan"]').click(); await expect(page.locator('#main .p2-exrow')).toBeVisible(); };
// Las nuevas de hoy de cada lista sin examen, según la fila «Tus listas» del Plan
const freeByDeck = async page => Object.fromEntries((await page.locator('#main .p2-now-free .p2-now-list li').evaluateAll(lis => lis.map(li => [li.querySelector('span').textContent, parseInt(li.querySelector('b').textContent, 10)]))));

test('«Sin examen» con un 30 % y Mucho a una carpeta: Hoy y el Plan dicen lo mismo, Mucho recibe el doble que Normal y el examen sigue llegando', async ({ page, seed }) => {
  await setup(page, seed);
  await toPlan(page);
  // Desde «Qué toca ahora»: «Cambiar el reparto»
  await page.locator('#main .p2-rep-link').last().click();
  await expect(page.locator('#sheetBody h2')).toHaveText('Cómo repartes las nuevas');
  await expect(page.locator('#sheetBody .p2-freelv li')).toHaveCount(2);
  // En Automático solo se ve el deslizador de «Sin examen»: al moverlo, pasa a «A mi manera»
  await page.locator('#sheetBody input[data-group="split"][data-id="free"]').fill('30');
  await expect(page.locator('#sheetBody input[data-group="split"][data-id="ex-Aux"]')).toBeVisible();
  await expect(page.locator('#sheetBody [data-group="split"] [data-out="free"]')).toHaveText('30 %');
  await expect(page.locator('#sheetBody [data-group="split"] [data-out="ex-Aux"]')).toHaveText('70 %');
  await page.locator('#sheetBody [data-free-key] [data-p2="rep-lvl"][data-v="high"]').first().click();
  await expect(page.locator('#sheetBody [data-free-key]').first()).toContainText('Idiomas');
  await expect(page.locator('#p2Asi')).toContainText(/Así sigues llegando|no llegas|justo/);
  await page.locator('#sheetBody [data-p2="rep-save"]').click();
  await expect(page.locator('#toast')).toContainText('sin examen 30 %');
  await expect(page.locator('#toast')).toContainText('Idiomas mucho');

  // El Plan: 6 sin examen (el 30 % de 20), Idiomas (Mucho) 4 y Lecturas (Normal) 2
  await page.locator('#main .p2-now-free summary').click();
  const by = await freeByDeck(page);
  const idiomas = (by['Turco'] || 0) + (by['Alemán'] || 0), lecturas = (by['Novelas'] || 0) + (by['Ensayos'] || 0);
  expect([idiomas, lecturas]).toEqual([4, 2]);
  await expect(page.locator('#main .p2-now-free summary small')).toContainText('6 nuevas hoy');
  // …y el examen sigue llegando (o el Plan lo dice)
  const row = await page.locator('#main .p2-exrow').textContent();
  expect(row).toMatch(/acabas|no llegas|justo/);

  // Hoy dice lo mismo: 14 de Auxiliar y 6 de las listas
  await nav(page, 'Hoy');
  const h = await hoyCount(page);
  expect(h.new).toBe(20);
  await expect(page.locator('#main .p2-legend')).toContainText('14 nuevas de Auxiliar');
  await expect(page.locator('#main .p2-legend')).toContainText('6 de 4 listas');

  // Ajustes del plan › Reparto lo resume, y se deshace desde el historial
  await toPlan(page);
  await page.locator('#main [data-nav="planSettings"]').last().click();
  await expect(page.locator('#main [data-p2="set-reparto"]')).toContainText('Auxiliar 70 % · Sin examen 30 %');
});

test('«Darle más tiempo» desde una carpeta sin examen abre el reparto con esa carpeta marcada', async ({ page, seed }) => {
  await setup(page, seed);
  await nav(page, 'Biblioteca');
  await page.locator('#main [data-folder]').filter({ hasText: 'Lecturas' }).first().click();
  await page.locator('#main [data-p2="entuplan"]').click();
  await page.locator('#sheetBody [data-p2="sheet-more-time"]').click();
  await expect(page.locator('#sheetBody h2')).toHaveText('Cómo repartes las nuevas');
  await expect(page.locator('#sheetBody [data-free-key].p2-focus')).toContainText('Lecturas');
  // …y desde una de sus listas, la carpeta donde está
  await page.keyboard.press('Escape');
  await nav(page, 'Biblioteca');
  await page.locator('#main [data-folder]').filter({ hasText: 'Idiomas' }).first().click();
  await page.locator('#main [data-open]').filter({ hasText: 'Turco' }).first().click();
  await deckMenu(page, '[data-p2="entuplan"]');
  await page.locator('#sheetBody [data-p2="sheet-more-time"]').click();
  await expect(page.locator('#sheetBody [data-free-key].p2-focus')).toContainText('Idiomas');
});

test('las filas de «Sin examen»: Poco, Normal y Mucho en una sola línea, también con un nombre largo @ambos', async ({ page, seed }) => {
  await seed({ ...DATA, decks: [...DATA.decks, { name: 'Por qué se te olvidan las cosas (y cómo evitarlo)', cards: qs(30, 'g') }] });
  await setup(page, async () => {});
  await nav(page, 'Perfil'); await page.locator('#main [data-nav="plan"]').click();
  await page.locator('#main [data-nav="planSettings"]:visible').last().click();
  await page.locator('#main [data-p2="set-reparto"]').click();
  const rows = page.locator('#sheetBody .p2-freelv li');
  await expect(rows).toHaveCount(3);
  for (let k = 0; k < 3; k++) {
    const tops = await rows.nth(k).locator('.seg-b').evaluateAll(bs => bs.map(b => Math.round(b.getBoundingClientRect().top)));
    expect(new Set(tops).size, `fila ${k}`).toBe(1);
    const fits = await rows.nth(k).evaluate(li => [...li.querySelectorAll('.seg-b')].every(b => b.scrollWidth <= b.clientWidth + 1 && b.getBoundingClientRect().right <= li.getBoundingClientRect().right + 1));
    expect(fits).toBe(true);
  }
});

test('desde el reparto, «Pausar alguna o dejarla en solo repasar» lleva a Ajustes del plan › Qué entra, donde se pausa una carpeta', async ({ page, seed }) => {
  await setup(page, seed);
  await toPlan(page);
  await page.locator('#main .p2-rep-link').last().click();
  await page.locator('#sheetBody [data-p2="rep-pause"]').click();
  await expect(page.getByRole('heading', { name: 'Ajustes del plan' })).toBeVisible();
  const row = page.locator('#main .p2-free', { hasText: 'Lecturas' });
  await row.locator('[data-v="paused"]').click();
  await expect(page.locator('#toast')).toContainText('Lecturas');
  await expect(row.locator('[data-v="paused"]')).toHaveAttribute('aria-pressed', 'true');
});

test('el tema de ahora en el camino: sin caja y con el título subrayado @ambos', async ({ page, seed }) => {
  await setup(page, seed);
  await toPlan(page);
  await page.locator('#main .p2-exrow').click();
  const cur = page.locator('.p2-step.p2-cur');
  await expect(cur).toHaveCount(1);
  expect(await cur.evaluate(el => getComputedStyle(el).borderTopWidth)).toBe('0px');
  expect(await cur.locator('b').evaluate(b => getComputedStyle(b).textDecorationLine)).toContain('underline');
});
