// «Cómo va lo que sabes» en Hoy y Estadísticas: cuántas preguntas te sabes, cómo ha crecido y la cabecera que cuenta el día que señalas
import { test, expect, openApp } from './fixtures.js';
import { seedHistory } from './historial.js';

test('cómo va lo que sabes: lo que te sabes, notas y la cabecera al recorrer los días', async ({ page }, info) => {
  const db = await seedHistory(page);
  await openApp(page);
  const card = page.locator('#pgHost');
  await expect(card.locator('.lv-k')).toContainText('Cómo va lo que sabes');
  await expect(card.locator('.lv-h')).toContainText('todas las carpetas');
  await expect(card.locator('.lv-of')).toContainText(`de ${db.cards.length} preguntas te las sabes`);
  const n = Number((await card.locator('.lv-n').textContent()).replace(/\./g, ''));
  expect(n).toBeGreaterThan(50);
  expect(n).toBeLessThanOrEqual(db.cards.length);
  // Tres franjas: consolidadas, jóvenes y por aprender (las que estás aprendiendo cuentan como por aprender)
  await expect(card.locator('.pg-b3')).toHaveCount(1);
  await expect(card.locator('.pg-lab-m3')).toContainText(/consolidadas/i);
  await expect(card.locator('.pg-lab-m2')).toContainText(/jóvenes/i);
  await expect(card.locator('.pg-lab-m1')).toHaveCount(0);
  await expect(card.locator('.pg-note').first()).toContainText('+70 de Biología');
  // Al recorrer los días con el teclado, la cabecera cuenta ese día
  await card.locator('.pg-hit').focus();
  await page.keyboard.press('Home');
  await expect(card.locator('.lv-day')).not.toContainText('hoy');
  await expect(card.locator('.lv-of')).toContainText('te las sabías');
  const first = Number((await card.locator('.lv-n').textContent()).replace(/\./g, ''));
  expect(first).toBeLessThan(n);
  await page.keyboard.press('End');
  await expect(card.locator('.lv-day')).toContainText('hoy');
  if (process.env.SHOT) await card.screenshot({ path: `${process.env.SHOT}/progreso-${info.project.name}.png` });
  if (process.env.SHOT) await page.locator('section[aria-labelledby="h-act"]').screenshot({ path: `${process.env.SHOT}/actividad-${info.project.name}.png` });
});

test('estadísticas: cada tarjeta con su cifra, en tonos del tema, y la cabecera cuenta lo que señalas', async ({ page }, info) => {
  await seedHistory(page);
  await openApp(page);
  await page.goto('/#stats');
  await page.locator('#nav').getByRole('button', { name: 'Perfil' }).click();
  await page.locator('.pr-row[data-nav="stats"]').click();
  await page.locator('[data-stp="90"]').click();
  const rev = page.locator('section[aria-labelledby="st-rev"]');
  await expect(rev.locator('.lv-of')).toHaveText('respuestas');
  await expect(rev.locator('.st-svg .grid')).toHaveCount(0);                 // sin rejilla
  await expect(rev.locator('.st-bar.bar-strong')).toHaveCount(1);            // hoy, en tono oscuro
  const total = await rev.locator('.lv-n').textContent();
  await rev.locator('.hit').last().focus();
  await expect(rev.locator('.lv-day')).toContainText(' · ');
  await expect(rev.locator('.lv-n')).not.toHaveText(total);
  await rev.locator('.hit').last().blur();
  await expect(rev.locator('.lv-n')).toHaveText(total);
  await expect(page.locator('#stPg .lv-k')).toContainText('Tu progreso');
  await expect(page.locator('section[aria-labelledby="st-hour"] .lv-of')).toHaveText('tu mejor hora');
  await expect(page.locator('section[aria-labelledby="st-ivl"] .lv-sub')).toContainText('La mitad de tus preguntas');
  await expect(page.locator('.hard-bar').first()).toBeVisible();
  if (process.env.SHOT) await page.screenshot({ path: `${process.env.SHOT}/stats-${info.project.name}.png`, fullPage: true });
});
