// Capturas del editor de apuntes para revisar el diseño (solo con SHOT=carpeta)
import { test, openApp, nav, createDeck, pasteNotes } from './fixtures.js';

const NOTES = '# Política monetaria\n\n## Por qué suben los tipos\n\nCuando la inflación sube demasiado, el BCE sube los **tipos de interés**. Pedir dinero prestado sale más caro y eso enfría la economía.\n\n## La cadena\n\n- Tipos de interés ↑ → el crédito sale más caro\n- → bajan la inversión y el consumo a crédito\n- → cae la **demanda agregada**\n\n## El gráfico\n\nAl subir los tipos, la demanda agregada pasa de DA a DA′.';

test('capturas del editor @ambos', async ({ page }, info) => {
  test.skip(!process.env.SHOT, 'solo para revisar el diseño');
  const shot = name => page.screenshot({ path: `${process.env.SHOT}/${name}-${info.project.name}.png` });
  await openApp(page);
  await createDeck(page, 'Tema 4 · Política monetaria');
  await nav(page, 'Biblioteca');
  await pasteNotes(page, NOTES);
  await page.locator('#pgDeck').selectOption({ label: 'Tema 4 · Política monetaria' });
  const blocks = page.locator('#pgBlocks .nb');
  // Una pregunta en «Por qué suben…» y otra en «La cadena»
  for (const [i, w] of [[1, 'BCE'], [3, 'crédito']]) {
    await blocks.nth(i).locator('.nb-text').click();
    await page.locator('[data-block-input]').evaluate((t, w) => { const k = t.value.indexOf(w); t.setSelectionRange(k, k + w.length); document.dispatchEvent(new Event('selectionchange')); }, w);
    await page.locator('#selBar [data-act="sel-cloze"]').click();
    await page.locator('.ed-foot button[type="submit"]').click();
  }
  await page.keyboard.press('Escape');
  await shot('editor-margen');
  await blocks.nth(1).locator('.nb-text').click();
  await page.locator('[data-block-input]').evaluate(t => { const w = 'tipos de interés'; const k = t.value.indexOf(w); t.setSelectionRange(k - 2, k + w.length + 2); document.dispatchEvent(new Event('selectionchange')); });
  await shot('editor-barra');
  await page.locator('#selBar [data-act="sel-card"]').click();
  await page.waitForTimeout(300);
  await shot('editor-panel');
});
