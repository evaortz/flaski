// «Guardar y otra»: lo que escribes enseguida va a la pregunta nueva, no a la que se está guardando (con cuenta,
// guardar tarda lo que tarde la red)
import { test, expect, newCard } from './fixtures.js';
import { mockCloud, openCloud, sent } from './nube.js';

test('«Guardar y otra» y escribir sin esperar a que se guarde: cada pregunta con lo suyo', async ({ page }) => {
  const srv = await mockCloud(page);
  await page.route('**/rest/v1/cards*', async route => { if (route.request().method() === 'POST') await new Promise(r => setTimeout(r, 700)); return route.fallback(); });
  await openCloud(page);
  await page.locator('#nav').getByRole('button', { name: 'Biblioteca' }).click();
  await page.locator('#main [data-open]').first().click();
  await newCard(page);
  await page.locator('[data-set-type="basic"]').click();
  const pairs = [['uno', '1'], ['dos', '2'], ['tres', '3']];
  for (const [i, [q, a]] of pairs.entries()) {
    // sin esperar a que la anterior termine de guardarse
    await page.locator('#fld-q').fill(q);
    await page.locator('#fld-a').fill(a);
    await page.locator(i === pairs.length - 1 ? '.ed-foot button[type="submit"]' : '[data-act="save-card-more"]').click();
  }
  await expect(page.locator('#sheet')).toBeHidden();
  await expect.poll(() => sent(srv, 'cards').flatMap(w => [].concat(w[2])).map(c => [c.fields?.q, c.fields?.a]).sort()).toEqual([['dos', '2'], ['tres', '3'], ['uno', '1']]);
});
