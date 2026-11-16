import { test, expect, openApp, openDeck } from './fixtures.js';

// Con todo hecho por hoy siempre se puede seguir estudiando: «Estudiar más» en Hoy y al acabar,
// y el botón de una lista al día empieza igual (repasos por adelantado, los que tocan antes primero)
test('al día: «Estudiar más» en Hoy saca repasos por adelantado, los que tocan antes primero', async ({ page, seed }) => {
  await seed({ decks: [
    { name: 'Pronto', cards: [['bir', 'uno'], ['iki', 'dos']], studied: { due: 2, interval: 3 } },
    { name: 'Lejos', cards: [['üç', 'tres']], studied: { due: 20, interval: 30 } },
  ] });
  await openApp(page);
  await expect(page.locator('#main .hero-done')).toContainText('estás al día');
  await page.locator('#main [data-act="study-more"]').click();
  await expect(page.locator('.studybar .left')).toContainText('pregunta 1 de 3');
  // las que tocan antes, primero
  await expect(page.locator('.card .front')).toContainText(/bir|iki/);
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Ver respuesta' }).click();
    await page.locator('[data-grade="3"]').click();
  }
  await expect(page.getByRole('heading', { name: '¡Tanda hecha!' })).toBeVisible();
  // Al acabar, otra vez: las vistas hoy ya no salen, así que no queda nada y avisa
  await page.locator('#main [data-act="study-more"]').click();
  await expect(page.locator('#toast')).toContainText('Aquí todavía no hay preguntas');

});

test('una lista al día: su botón de estudiar empieza por adelantado en vez de decir que no hay nada', async ({ page, seed }) => {
  await seed({ decks: [{ name: 'Lejos', cards: [['üç', 'tres'], ['dört', 'cuatro']], studied: { due: 10, interval: 15 } }] });
  await openApp(page);
  await openDeck(page, 'Lejos');
  await page.locator('#main [data-start]').first().click();
  await expect(page.locator('#toast')).toContainText('sigues por adelantado');
  await expect(page.locator('.studybar .left')).toContainText('pregunta 1 de 2');
  await page.getByRole('button', { name: 'Ver respuesta' }).click();
  await page.locator('[data-grade="3"]').click();
  await page.getByRole('button', { name: 'Ver respuesta' }).click();
  await page.locator('[data-grade="3"]').click();
  await expect(page.locator('.done [data-act="study-more"]')).toBeVisible();
});
