// Explorar: «La tienes» y «tú tienes N», vista previa por nota y mensajes cuando no hay nada
import { test, expect, openApp, nav, addBuiltinDeck } from './fixtures.js';

test('las listas que ya tienes dicen «La tienes» y «N preguntas · tú tienes M»; su hoja no dice «Se copiará…»', async ({ page }) => {
  await openApp(page);
  await addBuiltinDeck(page, 'Alemán · A2');
  await nav(page, 'Explorar');
  const row = page.locator('#main [data-builtin="aleman-a2.json"]');
  await expect(row.locator('.go')).toHaveText('La tienes');
  const mine = await page.evaluate(async () => { const { S } = await import('/js/comun.js'); return S.cards.size; });
  await expect(row.locator('.meta')).toHaveText(new RegExp(`^\\d+ preguntas · tú tienes ${mine}$`));
  await expect(page.locator('#main [data-builtin="japones-demo.json"] .go')).toHaveText('Ver');
  await row.click();
  await expect(page.locator('#sheetBody')).toContainText('Ya la tienes');
  await expect(page.locator('#sheetBody')).not.toContainText('Se copiará a tu cuenta');
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
