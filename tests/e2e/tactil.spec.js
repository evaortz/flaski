// En el móvil, lo que se toca mide al menos 44 px de alto (la medida mínima cómoda para un dedo)
import { test, expect, openApp, nav, createDeck, addBasicCards } from './fixtures.js';

test.skip(({ isMobile }) => !isMobile, 'solo en el móvil');

// Alto de cada elemento visible del selector que mida menos de 44 px
const small = (page, sel) => page.locator(sel).evaluateAll(els => els
  .filter(el => el.offsetParent && getComputedStyle(el).visibility !== 'hidden')
  .map(el => [el.getAttribute('aria-label') || el.textContent.trim().slice(0, 30), Math.round(el.getBoundingClientRect().height)])
  .filter(([, h]) => h < 44));

test('zonas táctiles de al menos 44 px: apunte, Ajustes, Estadísticas y la meta de Hoy', async ({ page }) => {
  await openApp(page);
  await createDeck(page, 'Turco');
  await addBasicCards(page, [['ev', 'casa']]);
  // Hoy: «cambiar» / «poner una» meta
  await nav(page, 'Hoy');
  await expect(page.locator('#main [data-act="goal-change"]')).toBeVisible();
  expect.soft(await small(page, '#main [data-act="goal-change"]')).toEqual([]);

  // Barra superior del apunte
  await nav(page, 'Biblioteca');
  await page.locator('[data-act="new-page"]').first().click();
  await page.locator('#pgTitle').fill('Prueba');
  expect.soft(await small(page, '.pg-top button, .pg-top a, .pg-top [data-act]')).toEqual([]);

  // Pestañas de Ajustes
  await nav(page, 'Perfil');
  await page.locator('#main [data-nav="settings"]').first().click();
  expect.soft(await small(page, '.set-toc a')).toEqual([]);

  // Filtros de Estadísticas
  await nav(page, 'Perfil');
  await page.locator('#main [data-nav="stats"]').first().click();
  expect.soft(await small(page, '.st-filters button, .st-filters select, .st-filters label')).toEqual([]);
});
