// Fotografía las pantallas que se enseñan en la presentación de bienvenida, en claro y en oscuro.
import { test, expect, openApp, nav, addBuiltinDeck, pasteNotes } from './e2e/fixtures.js';

const OUT = new URL('../img/onboarding/', import.meta.url);
const shot = (page, name, scheme) => page.screenshot({ path: new URL(`${name}-${scheme}.jpg`, OUT).pathname.replace(/^\/([A-Z]:)/, '$1'), type: 'jpeg', quality: 82 });

for (const scheme of ['light', 'dark']) {
  test.describe(scheme, () => {
    test.use({ colorScheme: scheme });

    test('estudiar', async ({ page }) => {
      await openApp(page);
      await addBuiltinDeck(page, 'Japonés · Demo de Flaski');
      await page.locator('#main [data-start]').click();
      for (let i = 0; i < 30 && !(await page.locator('.ruby-hide').count()); i++) {
        await page.locator('[data-act="reveal"]').click();
        await page.locator('[data-grade="4"]').click();
      }
      await page.locator('[data-act="reveal"]').click();
      await expect(page.locator('[data-grade="3"]')).toBeVisible();
      await page.locator('#toast').evaluate(t => { t.hidden = true; });
      await shot(page, 'estudiar', scheme);
    });

    test('tipos', async ({ page }) => {
      await openApp(page);
      await nav(page, 'Mis mazos');
      await page.locator('#main [data-act="new-deck"]').click();
      await page.locator('#d-name').fill('Alemán');
      await page.locator('[data-kind="lang"]').click();
      await page.locator('#d-lang').selectOption('de-DE');
      await page.locator('#sheetBody').getByRole('button', { name: 'Guardar' }).click();
      await page.locator('#main [data-act="new-card"]').click();
      await page.locator('[data-act="pick-type"]').click();
      await page.locator('#toast').evaluate(t => { t.hidden = true; });
      await shot(page, 'tipos', scheme);
    });

    test('apuntes', async ({ page }) => {
      await openApp(page);
      await nav(page, 'Mis mazos');
      await page.locator('#main [data-act="new-deck"]').click();
      await page.locator('#d-name').fill('Historia');
      await page.locator('[data-kind="other"]').click();
      await page.locator('#sheetBody').getByRole('button', { name: 'Guardar' }).click();
      await nav(page, 'Apuntes');
      await pasteNotes(page, '# Revolución francesa\n\n## Fechas clave\n\nLa toma de la Bastilla, el 14 de julio de 1789, marca el inicio de la revolución.\n\n## Personajes\n\nRobespierre lideró el periodo del Terror.\n\n| Año | Hecho |\n|---|---|\n| 1789 | Toma de la Bastilla |\n| 1793 | Comienza el Terror |');
      await page.locator('#pgDeck').selectOption({ label: 'Historia' });
      for (const [i, w, q] of [[1, '1789', '¿Año de la toma de la Bastilla?'], [3, 'Robespierre', '¿Quién lideró el Terror?']]) {
        await page.locator('#pgBlocks .nb').nth(i).locator('.nb-text').click();
        await page.locator('[data-block-input]').evaluate((t, w) => { const k = t.value.indexOf(w); t.setSelectionRange(k, k + w.length); document.dispatchEvent(new Event('selectionchange')); }, w);
        await page.locator('[data-act="sel-card"]').click();
        await page.locator('#fld-q').fill(q);
        await page.locator('.ed-foot button[type="submit"]').click();
        await expect(page.locator('#sheet')).toBeHidden();
      }
      // Una parte que «cuesta», para que se vean los colores
      await page.locator('#pgBlocks .nb').nth(2).locator('.nb-sec').click();
      await page.locator('[data-act="reveal"]').click();
      await page.locator('[data-grade="1"]').click();
      await page.locator('.studybar [data-act="exit"]').click();
      await page.locator('#toast').evaluate(t => { t.hidden = true; });
      await page.waitForTimeout(900);   // «Guardado»
      await page.evaluate(() => scrollTo(0, 120));
      await shot(page, 'apuntes', scheme);
    });

    test('ia', async ({ page }) => {
      await openApp(page);
      await nav(page, 'Mis mazos');
      await page.locator('#main [data-act="paste"]').click();
      await page.locator('#pasteText').fill(JSON.stringify({
        format: 'flaski-notes', version: 1, name: 'Inglés · Viajes', lang: 'en-GB',
        notes: [
          { type: 'vocab', fields: { w: 'boarding pass', t: 'tarjeta de embarque' } },
          { type: 'vocab', fields: { w: 'luggage', t: 'equipaje' } },
          { type: 'cloze', fields: { x: 'Could you {{help}} me with my bags?' } },
          { type: 'vocab', fields: { w: 'delay', t: 'retraso' } },
        ],
      }, null, 2));
      await page.getByRole('button', { name: 'Ver vista previa' }).click();
      await expect(page.locator('#sheetBody')).toContainText('7 tarjetas');
      await shot(page, 'ia', scheme);
    });
  });
}
