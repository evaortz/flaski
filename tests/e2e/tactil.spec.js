// En el móvil, lo que se toca mide al menos 44 px de alto (la medida mínima cómoda para un dedo)
import { test, expect, openApp, openDeck, nav, newCard } from './fixtures.js';

test.skip(({ isMobile }) => !isMobile, 'solo en el móvil');

// Alto de cada elemento visible del selector que mida menos de 44 px
const small = (page, sel) => page.locator(sel).evaluateAll(els => els
  .filter(el => el.offsetParent && getComputedStyle(el).visibility !== 'hidden')
  .map(el => [el.getAttribute('aria-label') || el.textContent.trim().slice(0, 30), Math.round(el.getBoundingClientRect().height)])
  .filter(([, h]) => h < 44));

test('zonas táctiles de al menos 44 px: apunte, Ajustes, Estadísticas y la meta de Hoy', async ({ page, seed }) => {
  await seed({ decks: [{ name: 'Turco', cards: [['ev', 'casa']] }] });
  await openApp(page);
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

// Zona que responde al dedo alrededor del centro de un elemento (también lo que añade su ::after invisible):
// ancho y alto en px, buscando hacia los cuatro lados qué puntos siguen tocando el elemento
const hitArea = loc => loc.evaluate(el => {
  const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const hits = (x, y) => { const t = document.elementFromPoint(x, y); return !!t && (t === el || el.contains(t)); };
  const reach = (dx, dy) => { let d = 0; while (d < 40 && hits(cx + dx * (d + 1), cy + dy * (d + 1))) d++; return d; };
  return [Math.round(reach(-1, 0) + reach(1, 0) + 1), Math.round(reach(0, -1) + reach(0, 1) + 1)];
});

test('zonas táctiles de 44 × 44 px: ✕ de las pegatinas, mover y plegar en el margen, y las pastillas del apunte', async ({ page, seed }) => {
  await seed({ decks: [{ name: 'Historia' }] });
  await openApp(page);
  // El tema de ejemplo: un apunte con preguntas unidas a sus partes y preguntas sugeridas
  await nav(page, 'Explorar');
  await page.locator('.ex-chip', { hasText: 'Oposiciones' }).click();
  await page.locator('[data-ex="add-tema"]').first().click();   // se abre el apunte
  await expect(page.locator('#pgBlocks .nb-cards').first()).toBeVisible();
  const big = async (loc, what) => { await loc.scrollIntoViewIfNeeded(); const [w, h] = await hitArea(loc); expect.soft(w, `${what}: ancho`).toBeGreaterThanOrEqual(44); expect.soft(h, `${what}: alto`).toBeGreaterThanOrEqual(44); };
  await big(page.locator('#pgBlocks .nb-cards').first(), 'N preguntas de esta parte');
  const dot = page.locator('#pgBlocks .nb:not(:has(> .nb-cards)) > .nb-sugdot').first();
  await expect(dot).toBeVisible({ timeout: 5000 });
  await big(dot, 'preguntas sugeridas');
  const fold = page.locator('#pgBlocks .nb-fold').first();
  await fold.scrollIntoViewIfNeeded();
  await big(fold, 'Plegar el apartado');
  // «Mover o más opciones» sale al escribir en un bloque
  const nb = page.locator('#pgBlocks .nb:not(.nb-h1):not(.nb-h2):not(.nb-h3)').nth(1);
  await nb.locator('.nb-text').click();
  await page.locator('#pgBlocks [data-block-input]').press('End');
  const grip = page.locator('#pgBlocks .nb:has([data-block-input]) > .nb-grip');
  await expect(grip).toBeVisible();
  await big(grip, 'Mover o más opciones');
  await page.keyboard.press('Escape');
  // La ✕ de las pegatinas del editor de una pregunta
  await openDeck(page, 'Historia');
  await newCard(page);
  await page.locator('#tagPick [data-act="tagpick-open"]').click();
  await page.locator('#f-newtag').fill('verbos');
  await page.locator('#f-newtag').press('Enter');
  await big(page.locator('#tagPick [data-act="untag"]').first(), '✕ de la pegatina');
});
