// Importar un mazo exportado de Anki (.apkg): mazos en su carpeta, tipos, imágenes y progreso
import { test, expect, openApp, nav } from './fixtures.js';
import { makeApkg } from '../anki-fixture.js';

for (const modern of [false, true]) {
  test(`importar de Anki (${modern ? 'formato nuevo' : 'formato antiguo'}): mazos, imágenes y progreso`, async ({ page }) => {
    await openApp(page);
    await nav(page, 'Mis mazos');
    const chooser = page.waitForEvent('filechooser');
    await page.locator('#main [data-act="import"]').click();
    await (await chooser).setFiles({ name: 'Idiomas.apkg', mimeType: 'application/octet-stream', buffer: makeApkg({ modern }) });

    const sheet = page.locator('#sheetBody');
    await expect(sheet).toContainText('6 tarjetas de 5 notas · 1 imagen');
    await expect(sheet).toContainText('Se crearán 2 mazos en la carpeta «Idiomas»');
    await expect(sheet.locator('.anki-decks li')).toHaveText([/Japonés\s*1/, /Turco\s*5/]);
    await expect(sheet.locator('#ankiProgress')).toBeChecked();
    await sheet.locator('[data-act="add-anki"]').click();
    await expect(page.locator('#sheet')).toBeHidden();

    // Queda dentro de la carpeta «Idiomas», con sus dos mazos
    await expect(page.getByRole('heading', { level: 1, name: 'Idiomas' })).toBeVisible();
    await page.locator('#main').getByText('Turco', { exact: true }).first().click();
    await expect(page.locator('#cardCount')).toContainText('5 tarjetas');
    await expect(page.locator('#main .row img.media')).toHaveAttribute('src', /^blob:/);
    await expect(page.locator('#main .row').first()).toContainText('ev');

    // El progreso de Anki: la primera tarjeta ya se ha repasado
    await page.locator('#main .row').first().click();
    await expect(page.locator('[data-act="reset-card"]')).toBeVisible();
    await page.locator('[data-act="close-sheet"]').first().click();

    // Y el historial llega a Estadísticas
    await nav(page, 'Perfil');
    await page.locator('[data-nav="stats"]').click();
    await page.locator('#main').getByRole('button', { name: 'Todo', exact: true }).first().click();
    await expect(page.locator('#main')).toContainText('11');
  });
}
