// Arreglos de la auditoría de noviembre (cada uno con lo que se rompía)
import { test, expect, openApp, nav, openDeck } from './fixtures.js';

const qs = (n, p = 'p') => Array.from({ length: n }, (_, i) => [`${p}${i}`, `r${i}`]);

// .p2-wd se usaba también para los días del Repaso de la semana (domingo) y, al ir después en plan2.css, ponía los
// días de Tu tiempo en columna (nombre, barra y minutos uno debajo de otro)
test('Tu tiempo: cada día en una fila (nombre, barra y minutos) @ambos', async ({ page, seed }) => {
  await seed({ decks: [{ name: 'Turco', cards: qs(10, 't') }] });
  await openApp(page);
  await page.evaluate(() => import('/js/app.js').then(({ go }) => go('planTime')));
  await expect(page.getByRole('heading', { level: 1, name: 'Tu tiempo' })).toBeVisible();
  const row = page.locator('#main .p2-wd').first();
  await expect(row).toHaveCSS('display', 'grid');
  const [l, r, o] = await Promise.all(['label', 'input[type=range]', 'output'].map(s => row.locator(s).boundingBox()));
  expect(Math.abs(l.y + l.height / 2 - (r.y + r.height / 2))).toBeLessThan(12);   // en la misma línea
  expect(o.x).toBeGreaterThan(r.x);
});

// Desde la tanda, «Ver en los apuntes» abre el apunte sin cerrar la tanda (para «Volver al estudio»). Si desde ahí se
// iba a otra sección con la barra de abajo, la tanda seguía viva: cualquier apunte ofrecía volver a una tanda vieja
test('salir a otra sección desde un apunte deja la tanda: ya no sale «Volver al estudio»', async ({ page, seed }) => {
  await seed({ decks: [{ name: 'Historia', cards: qs(3, 'h') }], pages: [{ md: '# Casos\n\nEl locativo.' }] });
  await openApp(page);
  // En plena tanda, al apunte (como «Ver en los apuntes»)
  await page.evaluate(async () => {
    const { startSession } = await import('/js/pantallas/estudio.js'); const { S } = await import('/js/comun.js'); const { go } = await import('/js/app.js');
    startSession('all'); go('page', { pageId: [...S.pages.keys()][0] });
  });
  await expect(page.locator('[data-act="back-study"]')).toBeVisible();
  await nav(page, 'Hoy');
  await page.evaluate(async () => { const { S } = await import('/js/comun.js'); const { go } = await import('/js/app.js'); go('page', { pageId: [...S.pages.keys()][0] }); });
  await expect(page.locator('#main .nb-text').first()).toBeVisible();
  await expect(page.locator('[data-act="back-study"]')).toHaveCount(0);
});

// Borrar una pregunta en plena tanda y valorar la siguiente antes de «Deshacer»: se volvía a la cola de antes y la
// recién valorada salía otra vez (contaba dos veces). Ahora solo vuelve la borrada
test('tanda: borrar una pregunta, valorar la siguiente y «Deshacer» devuelve solo la borrada', async ({ page, seed }) => {
  await seed({ decks: [{ name: 'Turco', cards: [['bir', 'uno'], ['iki', 'dos'], ['üç', 'tres']] }] });
  await openApp(page);
  await openDeck(page, 'Turco');
  await page.locator('#main [data-start]').first().click();
  const queue = () => page.evaluate(() => import('/js/comun.js').then(({ S }) => S.session.queue.map(id => S.cards.get(id)?.front)));
  const [first, second, third] = await queue();
  await page.getByRole('button', { name: 'Ver respuesta' }).click();
  await page.getByRole('button', { name: 'Editar pregunta' }).click();
  const more = page.locator('[data-act="ed-extra"]');
  if (await more.isVisible()) await more.click();
  await page.locator('[data-act="ask-delete-card"]:visible').first().click();
  await page.locator('#sheetBody [data-act="delete-card"]').click();
  await expect(page.locator('.card .front')).toContainText(second);
  await page.getByRole('button', { name: 'Ver respuesta' }).click();
  await page.locator('[data-grade="3"]').click();
  await page.locator('#toast .ta-btn').click();
  expect(await queue()).toEqual([first, third]);
});
