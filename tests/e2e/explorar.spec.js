// Explorar: «La tienes» y «tú tienes N», vista previa por nota, mensajes cuando no hay nada, filtros por
// objetivo, el tema destacado («Añadir y empezar») y añadir una lista con «+»
import { test, expect, openApp, nav } from './fixtures.js';

test('las listas que ya tienes dicen «La tienes» y «N preguntas · tú tienes M»; su hoja no dice «Se copiará…»', async ({ page, seed }) => {
  await seed({ builtin: ['Alemán · A2'] });
  await openApp(page);
  await nav(page, 'Explorar');
  const card = page.locator('#main [data-builtin="aleman-a2.json"]');
  await expect(card.locator('.go')).toHaveText('La tienes');
  const mine = await page.evaluate(async () => { const { S } = await import('/js/comun.js'); return S.cards.size; });
  await expect(card.locator('.meta')).toHaveText(new RegExp(`^\\d+ preguntas · tú tienes ${mine}$`));
  // La que no tienes, con «+» para añadirla
  await expect(page.locator('#main [data-ex="add-builtin"][data-file="japones-demo.json"]')).toBeVisible();
  await expect(page.locator('#main [data-ex="add-builtin"][data-file="aleman-a2.json"]')).toHaveCount(0);
  await card.click();
  await expect(page.locator('#sheetBody')).toContainText('Ya la tienes');
  await expect(page.locator('#sheetBody')).not.toContainText('Se copiará a tu cuenta');
  // Buscando, en la fila: «La tienes»
  await page.keyboard.press('Escape');
  await page.locator('#exploreSearch').fill('alemán');
  await expect(page.locator('#main .ex-results [data-builtin="aleman-a2.json"] .go')).toHaveText('La tienes');
});

test('vista previa de notas con varias plantillas: una fila por nota', async ({ page }) => {
  await openApp(page);
  await nav(page, 'Explorar');
  await page.locator('#main [data-builtin="aleman-a2.json"]').click();
  const rows = page.locator('#sheetBody .preview li');
  await expect(rows).toHaveCount(6);
  const texts = await rows.allTextContents();
  // Cada fila es una nota distinta: «Wohnung» sale una sola vez
  expect(texts.filter(t => t.includes('Wohnung'))).toHaveLength(1);
  await expect(page.locator('#sheetBody')).toContainText('Se copiará a tu cuenta');
});

test('«Tus listas compartidas» vacía y búsqueda sin resultados con un solo mensaje', async ({ page }) => {
  await openApp(page);
  await nav(page, 'Explorar');
  await expect(page.locator('#main')).toContainText('Aún no has compartido ninguna. Abre una lista y pulsa «Compartir».');
  await page.locator('#exploreSearch').fill('zzzqqq');
  await expect(page.locator('#main .ex-none')).toHaveText('Ninguna lista con «zzzqqq»');
  await expect(page.locator('#main')).not.toContainText('Nada por aquí');
  await expect(page.locator('#main h2')).toHaveCount(0);
});

test('filtros por objetivo: Idiomas solo enseña las listas de idiomas; «+» añade sin abrir nada', async ({ page }) => {
  await openApp(page);
  await nav(page, 'Explorar');
  await expect(page.locator('.ex-chip')).toHaveText(['Todo', 'Idiomas', 'Oposiciones', 'De tus amigos']);
  await page.locator('.ex-chip', { hasText: 'Idiomas' }).click();
  await expect(page.locator('.ex-hero')).toHaveCount(0);
  await expect(page.locator('.ex-oposiciones')).toHaveCount(0);
  await expect(page.locator('.ex-card')).toHaveCount(3);
  await page.locator('[data-ex="add-builtin"][data-file="turco-armonia-vocalica.json"]').click();
  await expect(page.locator('#main [data-builtin="turco-armonia-vocalica.json"] .go')).toHaveText('La tienes');
  await page.locator('.ex-chip', { hasText: 'Oposiciones' }).click();
  await expect(page.locator('.ex-row')).toContainText('La Constitución · Título Preliminar');
});

test('tema destacado: «Añadir y empezar» crea el apunte con sus preguntas y empieza una tanda de 5 min', async ({ page }) => {
  await openApp(page);
  await nav(page, 'Explorar');
  await expect(page.locator('.ex-hero h2')).toHaveText('Por qué se te olvidan las cosas');
  await page.locator('.ex-hero [data-ex="see-tema"]').click();
  await expect(page.locator('#sheetBody .preview li')).toHaveCount(5);
  await page.locator('#sheetBody [data-ex="start-tema"]').click();
  await expect(page.locator('.studybar')).toBeVisible();
  const r = await page.evaluate(async () => { const { S } = await import('/js/comun.js'); return { pages: [...S.pages.values()].map(p => p.title), cards: S.cards.size, minutes: S.session.minutes }; });
  expect(r.pages).toEqual(['Por qué se te olvidan las cosas (y cómo evitarlo)']);
  expect(r.cards).toBe(17);
  expect(r.minutes).toBe(5);
  await page.locator('.studybar [data-act="exit"]').click();
  await nav(page, 'Explorar');
  await expect(page.locator('.ex-hero [data-ex="open-tema"]')).toBeVisible();
});
