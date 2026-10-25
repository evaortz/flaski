// Voz: sin voz para el idioma, el altavoz avisa; «Probar» (Ajustes) usa los idiomas de tus listas
import { test, expect, openApp, openDeck, nav, newCard } from './fixtures.js';

// Un dispositivo que solo tiene voz en inglés (y no suena: se apunta lo que se diría)
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__said = [];
    const s = window.speechSynthesis;
    if (!s) return;
    s.getVoices = () => [{ lang: 'en-US', localService: true, name: 'Inglés', voiceURI: 'en' }];
    s.speak = u => window.__said.push(u.lang);
    s.cancel = () => {};
  });
});

test('sin voz en japonés: el altavoz lo dice; «Probar» dice qué idiomas de tus listas tienen voz', async ({ page, seed }) => {
  await seed({ builtin: ['Japonés · Demo de Flaski'] });
  await openApp(page);
  await openDeck(page, 'Japonés · Demo de Flaski');
  await newCard(page);
  await page.locator('.ed-segs [data-set-type="vocab"]').click();
  await page.locator('#fld-w').fill('駅');
  await page.locator('.ef [data-say-input="w"]').click();
  await expect(page.locator('#toast')).toContainText('Tu dispositivo no tiene voz en japonés. Puedes instalarla en los ajustes de voz del sistema');
  expect(await page.evaluate(() => window.__said)).toEqual([]);
  await page.keyboard.press('Escape');
  await page.locator('[data-act="discard-edit"]').click();                         // había escrito algo
  await expect(page.locator('#sheet')).toBeHidden();

  await nav(page, 'Perfil');
  await page.locator('#main [data-nav="settings"]').first().click();
  await page.locator('[data-act="test-voice"]').click();
  await expect(page.locator('#voiceTest')).toHaveText('Sin voz: japonés. Puedes instalarla en los ajustes de voz del sistema.');
});
