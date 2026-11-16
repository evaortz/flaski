// Arreglos de la auditoría de noviembre (cada uno con lo que se rompía)
import { test, expect, openApp, nav, openDeck, deckMenu } from './fixtures.js';

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

// Hoy y el Plan guardan sus cuentas mientras no cambie nada; archivar una lista no cambiaba cuántas hay y seguían
// contando sus nuevas hasta responder algo o recargar
test('archivar una lista la quita al momento de lo de hoy del plan', async ({ page, seed }) => {
  await seed({ decks: [{ name: 'Turco', cards: qs(10, 't') }, { name: 'Alemán', cards: qs(10, 'a') }] });
  await openApp(page);
  const newBy = () => page.evaluate(async () => {
    const { todayPlan } = await import('/js/plan2-app.js'); const { S } = await import('/js/comun.js');
    return Object.entries(todayPlan().newBy || {}).filter(([, n]) => n > 0).map(([id]) => S.decks.get(id)?.name).sort();
  });
  expect(await newBy()).toEqual(['Alemán', 'Turco']);
  await openDeck(page, 'Alemán');
  await deckMenu(page, '[data-act="archive-deck"]');
  await expect(page.locator('#toast')).toContainText('Lista archivada');
  expect(await newBy()).toEqual(['Turco']);
});

// Nuevo examen: «falta 1 día» (no «faltan 1 días») y, como el iPhone no respeta la fecha mínima, no se guarda uno de hoy
test('nuevo examen: «falta 1 día» y no se puede guardar con la fecha de hoy', async ({ page, seed }) => {
  await seed({ decks: [{ name: 'Turco', cards: qs(10, 't') }] });
  await openApp(page);
  await page.evaluate(() => import('/js/app.js').then(({ go }) => go('plan')));
  await page.evaluate(() => import('/js/pantallas/plan-nuevo.js').then(m => m.newExamSheet()));
  const t = await page.evaluate(() => import('/js/plan.js').then(m => [m.dayKey(), m.addDays(m.dayKey(), 1)]));
  await page.locator('#p2nDate').fill(t[1]);
  await expect(page.locator('#p2nDays')).toContainText('falta 1 día');
  await page.locator('#p2nDate').fill(t[0]);
  await page.locator('#sheetBody [data-p2="new-save"]').click();
  await expect(page.locator('#toast')).toContainText('a partir de mañana');
  expect(await page.evaluate(() => import('/js/plan2-app.js').then(m => (m.plan2().exams || []).length))).toBe(0);
});

// Modo local con dos pestañas: cada una guardaba su copia entera y la última pisaba lo de la otra
test('modo local: lo que se guarda en otra pestaña no se pierde al guardar en esta', async ({ page, seed, context }) => {
  await seed({ decks: [{ name: 'Turco', cards: qs(2, 't') }] });
  await openApp(page);
  // Otra pestaña añade una lista
  const other = await context.newPage();
  await other.goto('/manifest.webmanifest');
  await other.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('flaski-local-v1'));
    db.decks.push({ ...db.decks[0], id: '00000000-0000-4000-8000-00000000beef', name: 'De la otra pestaña' });
    localStorage.setItem('flaski-local-v1', JSON.stringify(db));
  });
  await other.close();
  // Aquí se guarda algo (una lista nueva)
  await page.evaluate(async () => { const api = await import('/js/api.js'); const { S } = await import('/js/comun.js'); await api.createDeck({ owner: S.uid, name: 'De esta pestaña' }); });
  const names = await page.evaluate(() => JSON.parse(localStorage.getItem('flaski-local-v1')).decks.map(d => d.name).sort());
  expect(names).toEqual(['De esta pestaña', 'De la otra pestaña', 'Turco']);
});
