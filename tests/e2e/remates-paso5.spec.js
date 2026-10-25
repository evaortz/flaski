// Remates del paso 5: texto pegado con las reglas de un archivo, «1 min», «te las sabes» solo con las consolidadas,
// el esqueleto de Hoy al cargar y los textos («correo», «preguntas con repaso espaciado», sin «!» suelto)
import { test, expect, openApp, nav, answer, startTanda } from './fixtures.js';
import { mockCloud, openCloud } from './nube.js';

const TEMA = `Tema 1. La Constitución Española de 1978

La Constitución fue aprobada por las Cortes el 31 de octubre de 1978 y ratificada en referéndum el 6 de diciembre de 1978. Entró en vigor el 29 de diciembre de 1978.

Estructura: tiene 169 artículos, un preámbulo y un Título Preliminar seguido de diez títulos.

Artículo 1: España se constituye en un Estado social y democrático de Derecho. La soberanía nacional reside en el pueblo español. La forma política del Estado español es la Monarquía parlamentaria.

Artículo 3: El castellano es la lengua española oficial del Estado.`;

const firstRun = async page => { await page.goto('/'); await expect(page.locator('.ob.fr')).toBeVisible(); await page.locator('[data-fr-what="otra"]').click(); await page.locator('[data-fr-step="pegar"]').click(); };

test.describe('primera vez', () => {
test.use({ intro: true });
test('texto pegado en «Trae tus apuntes»: título de la primera línea, fechas, cifras y huecos (al menos 6 preguntas)', async ({ page }) => {
  await firstRun(page);
  await page.locator('#frText').fill(TEMA);
  await page.locator('[data-fr-go="pegar"]').click();
  await expect(page.locator('.fr-file')).toContainText('Tema 1. La Constitución Española de 1978');
  const n = Number(/(\d+) preguntas posibles/.exec(await page.locator('.fr-sug h2').textContent())[1]);
  expect(n).toBeGreaterThanOrEqual(6);
  await page.locator('[data-fr-go="review"]').click();
  await expect(page.locator('#pgTitle')).toHaveValue('Tema 1. La Constitución Española de 1978');
  const fronts = (await page.locator('#sheetBody li.sug').allTextContents()).join(' | ');
  expect(fronts).toContain('¿Cuándo fue ratificada la Constitución en referéndum?');
  expect(fronts).toContain('¿Cuándo entró la Constitución en vigor?');
  expect(fronts).toContain('¿Cuántos artículos tiene la Constitución Española de 1978?');
  expect(fronts).not.toContain('La soberanía nacional reside en el pueblo español. La forma política');
  // La lista nueva lleva el título, no «Mis apuntes»
  expect(await page.evaluate(() => import('/js/comun.js').then(({ S }) => [...S.decks.values()].map(d => d.name)))).not.toContain('Mis apuntes');
});

test('«Hacer mi primera tanda»: con 1 min dice «1 min», no «unos 1 min»', async ({ page }) => {
  await firstRun(page);
  await page.locator('#frText').fill('Mi tema corto\n\nArtículo 3: El castellano es la lengua española oficial del Estado.\n\nLa capital del Estado es la villa de Madrid.');
  await page.locator('[data-fr-go="pegar"]').click();
  await expect(page.locator('[data-fr-go="tanda"] small')).toHaveText(/^\d preguntas? · 1 min$/);
});
});

test('pegado en un apunte vacío: la primera línea es el título y «Etiqueta:» va en negrita', async ({ page }) => {
  await openApp(page);
  await nav(page, 'Biblioteca');
  await page.locator('#main [data-act="new-page"]:visible').first().click();
  await page.locator('#pgBlocks .nb').first().locator('.nb-text').click();
  await page.evaluate(t => {
    const dt = new DataTransfer(); dt.setData('text/plain', t);
    document.querySelector('[data-block-input]').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, TEMA);
  await expect(page.locator('#pgTitle')).toHaveValue('Tema 1. La Constitución Española de 1978');
  const blocks = await page.evaluate(() => import('/js/comun.js').then(({ S }) => [...S.pages.values()][0].blocks.map(b => b.text)));
  expect(blocks.some(t => t.startsWith('**Estructura:** tiene 169'))).toBe(true);
});

test('Hoy: «te las sabes» cuenta solo las consolidadas, y el número de hoy va sin «!»', async ({ page, seed }) => {
  await seed({ decks: [{ name: 'Turco', cards: [['ev', 'casa'], ['su', 'agua'], ['kapı', 'puerta'], ['el', 'mano']] }] });
  await openApp(page);
  await expect(page.locator('#main .p2-legend')).toHaveText('4 nuevas');
  await startTanda(page);
  for (let i = 0; i < 3; i++) await answer(page, 3);
  await page.locator('.studybar [data-act="exit"]').click();
  await nav(page, 'Hoy');
  await expect(page.locator('#main .lv-n').first()).toHaveText('0');
  await expect(page.locator('#main .lv-of').first()).toContainText('te las sabes');
});

test('al abrir, mientras carga, un esqueleto de Hoy y no un círculo girando', async ({ page }) => {
  const srv = await mockCloud(page);
  // La nube no responde a las listas hasta que la prueba ha visto el esqueleto (sin depender de cuánto tarde en cargar)
  let release; const seen = new Promise(r => { release = r; });
  await page.route('https://test.supabase.co/rest/v1/decks**', async r => { await seen; return r.fallback(); });
  await page.goto('/');
  await expect(page.locator('#main .skel')).toBeVisible();
  await expect(page.locator('#main .spin')).toHaveCount(0);
  release();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20000 });
  await expect(page.locator('#main .skel')).toHaveCount(0);
  expect(srv).toBeTruthy();
});

test('textos: «correo» al entrar y en la presentación, «preguntas con repaso espaciado»', async ({ page }) => {
  await mockCloud(page);
  await openCloud(page);
  await page.locator('#nav .nav-inner [data-nav="profile"]').click();
  await page.locator('[data-act="signout"]').click();
  await expect(page.locator('label[for="a-email"]')).toHaveText('Correo');
  await expect(page.locator('#main')).not.toContainText(/email/i);
  await page.locator('[data-mode="reset"]').click();
  await expect(page.locator('#main')).toContainText('Te enviaremos un correo');
  await expect(page.locator('#main button[type="submit"]')).toHaveText('Enviar correo');
  const { readFileSync } = await import('node:fs');
  expect(readFileSync(new URL('../../js/onboarding.js', import.meta.url), 'utf8')).toContain('preguntas con repaso espaciado');
});
