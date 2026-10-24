// Remates del editor de una pregunta, de las etiquetas y de los apuntes vacíos: cada uno con su prueba
import { test, expect, openApp, nav, createDeck, addBasicCards, newCard } from './fixtures.js';

async function cardWithProgress(page) {
  await openApp(page);
  await createDeck(page, 'Historia');
  await addBasicCards(page, [['¿Quién dirigió el Terror durante la Revolución francesa?', 'Robespierre']]);
  await page.locator('#main [data-start]').first().click();
  await page.locator('[data-act="reveal"]').click();
  await page.locator('[data-grade="3"]').click();
  await page.locator('.studybar [data-act="exit"]').click();
  await page.locator('#cardRows [data-card]').first().click();
  await expect(page.locator('.ed-save')).toBeVisible();
}

test('móvil: al editar, «Guardar» cabe a la derecha y lo demás va en «⋯ Más»', async ({ page }, info) => {
  await cardWithProgress(page);
  const save = await page.locator('.ed-save').boundingBox();
  const vw = page.viewportSize().width;
  expect(save.x + save.width).toBeLessThanOrEqual(vw);
  if (info.project.name === 'movil') {
    await expect(page.locator('[data-act="ask-delete-card"]')).toBeHidden();
    await page.locator('[data-act="ed-extra"]').click();
    await expect(page.locator('.ed-extra [data-act="ask-delete-card"]')).toBeVisible();
    await expect(page.locator('.ed-extra [data-act="dup-card"]')).toBeVisible();
    const reset = page.locator('.ed-extra [data-act="ask-reset-card"]');
    await expect(reset).toBeVisible();
    expect((await reset.boundingBox()).height).toBe((await page.locator('.ed-extra [data-act="dup-card"]').boundingBox()).height);   // en una línea, como «Duplicar»
    const box = await page.locator('.ed-extra').boundingBox();
    expect(box.x + box.width).toBeLessThanOrEqual(vw);
  } else {
    await expect(page.locator('[data-act="ed-extra"]')).toBeHidden();
    await expect(page.locator('[data-act="ask-delete-card"]')).toBeVisible();
  }
});

test('etiquetas: «#verbos» crea «verbos» y como mucho 24 letras', async ({ page }) => {
  await openApp(page);
  await createDeck(page, 'Historia');
  await newCard(page);
  const pick = page.locator('#tagPick');
  await pick.locator('[data-act="tagpick-open"]').click();
  await page.locator('#f-newtag').fill('  #verbos ');
  await expect(pick.locator('.tag-create')).toHaveText('Crear #verbos');
  await page.locator('#f-newtag').press('Enter');
  await expect(pick.locator('.tagsel')).toHaveText(['#verbos']);
  await pick.locator('[data-act="tagpick-open"]').click();
  await page.locator('#f-newtag').fill('#verbos');
  await expect(pick.locator('.tag-create')).toBeHidden();   // ya existe
  await page.locator('#f-newtag').fill('abcdefghijklmnopqrstuvwxyzabcdef');
  await page.locator('#f-newtag').press('Enter');
  const names = await pick.locator('.tagsel .tag').allTextContents();
  expect(names[1].replace('#', '').length).toBeLessThanOrEqual(24);
});

test('«Pista · opcional» va encima de su campo y el ejemplo se lee entero', async ({ page }) => {
  await openApp(page);
  await createDeck(page, 'Historia');
  await newCard(page);
  const [k, i] = await page.evaluate(() => { const i = document.querySelector('#c-hint'), k = i.closest('.prop').querySelector('.prop-k'); return [k.getBoundingClientRect().toJSON(), i.getBoundingClientRect().toJSON()]; });
  expect(k.bottom).toBeLessThanOrEqual(i.top + 1);
  expect(await page.locator('#c-hint').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
});

test('apuntes vacíos de antes: se borran al arrancar y «Lo dejaste aquí» no lleva a ellos', async ({ page }) => {
  await openApp(page);
  await createDeck(page, 'Historia');
  // Un apunte con texto y, más reciente, uno vacío sin título (como los que quedaban antes)
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('flaski-local-v1'));
    const now = Date.now();
    db.pages = [
      { id: '11111111-1111-4111-8111-111111111111', owner: db.decks[0].owner, title: 'Revolución', icon: '', deck_id: null, folder_id: null, tags: [], blocks: [{ id: 'b1', type: 'p', text: 'El Terror' }], created_at: new Date(now - 864e5).toISOString(), updated_at: new Date(now - 864e5).toISOString() },
      { id: '22222222-2222-4222-8222-222222222222', owner: db.decks[0].owner, title: '', icon: '', deck_id: null, folder_id: null, tags: [], blocks: [{ id: 'b2', type: 'p', text: '' }], created_at: new Date(now).toISOString(), updated_at: new Date(now).toISOString() },
    ];
    localStorage.setItem('flaski-local-v1', JSON.stringify(db));
  });
  await page.reload();
  await expect(page.locator('#main .spin')).toHaveCount(0);
  await nav(page, 'Hoy');
  await expect(page.locator('.hoy-last')).toContainText('Revolución');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('flaski-local-v1')).pages.map(p => p.title))).toEqual(['Revolución']);
});
