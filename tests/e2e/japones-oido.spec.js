// «De oído»: se escucha una frase (la voz del dispositivo) y se elige entre cuatro; al responder se ve lo que decía.
// «No puedo escuchar ahora» aparta las de escuchar de la tanda sin contarlas como falladas; y la lista está en Explorar
import { test, expect, openApp, nav, startTanda } from './fixtures.js';

const OIDO = (x, q, a, w, t) => ({ type: 'oido', fields: { x, q, a, w, t, n: '' } });
const PRECIO = OIDO('コーヒーは ろっぴゃく えんです。', '¿Cuánto cuesta el café?', '600 yenes', '60 yenes; 160 yenes; 6.000 yenes', 'El café cuesta 600 yenes.');
const HORA = OIDO('いま しちじ はんです。', '¿Qué hora es?', '7:30', '4:30; 1:30; 7:00', 'Son las siete y media.');

test('De oído: escuchar, elegir entre cuatro y ver lo que decía', async ({ page, seed }) => {
  await seed({ decks: [{ name: 'Oído', lang: 'ja-JP', notes: [PRECIO] }] });
  await openApp(page);
  await nav(page, 'Hoy');
  await startTanda(page);
  const card = page.locator('article.card');
  await expect(card).toContainText('¿Cuánto cuesta el café?');
  await expect(card).not.toContainText('ろっぴゃく');                    // la frase no se ve: se escucha
  await expect(card.locator('.listen-box [data-listen="1"]')).toBeVisible();
  await expect(card.locator('.listen-box [data-listen="0.6"]')).toBeVisible();
  await expect(card.locator('.choice')).toHaveCount(4);
  await card.locator('.choice', { hasText: '600 yenes' }).first().click();
  await expect(card.locator('.choice.right')).toContainText('600 yenes');
  await expect(card).toContainText('コーヒーは ろっぴゃく えんです。');
  await expect(card).toContainText('El café cuesta 600 yenes.');
  await expect(page.locator('.grade.g3.suggested')).toBeVisible();
});

test('«No puedo escuchar ahora»: las de escuchar se apartan y no cuentan como falladas', async ({ page, seed }) => {
  await seed({ decks: [{ name: 'Oído', lang: 'ja-JP', notes: [PRECIO, HORA] }, { name: 'Otra', cards: [['perro', 'dog']] }] });
  await openApp(page);
  await nav(page, 'Hoy');
  await startTanda(page);
  const card = page.locator('article.card');
  // Hasta que salga una de escuchar (la otra lista va mezclada)
  for (let i = 0; i < 3 && !(await card.locator('.listen-box').count()); i++) { await page.locator('[data-act="reveal"]').click(); await page.locator('[data-grade="3"]').click(); }
  await card.locator('[data-act="no-audio"]').click();
  await expect(page.locator('#toast')).toContainText('Sin audio durante 15 min');
  // Ya no sale ninguna de escuchar en esta tanda
  for (let i = 0; i < 3 && await card.count(); i++) {
    await expect(card.locator('.listen-box')).toHaveCount(0);
    await page.locator('[data-act="reveal"]').click(); await page.locator('[data-grade="3"]').click();
  }
  await expect(page.locator('.done')).toBeVisible();
  const seen = await page.evaluate(async () => { const { S } = await import('/js/comun.js'); return [...S.cards.values()].filter(c => c.type_id === 'oido' && S.progress.has(c.id)).length; });
  expect(seen).toBe(0);
});

test('Explorar › JLPT N5 · De oído: la lista va a la carpeta «JLPT N5»', async ({ page }) => {
  await openApp(page);
  await nav(page, 'Explorar');
  await page.locator('[data-ex="add-builtin"][data-file="jlpt-n5/oido.json"]').click();
  await expect(page.locator('#main [data-builtin="jlpt-n5/oido.json"] .go')).toHaveText('La tienes');
  const r = await page.evaluate(async () => {
    const { S } = await import('/js/comun.js');
    const d = [...S.decks.values()].find(x => x.source === 'incluido:jlpt-n5/oido.json');
    return { folder: S.folders.get(d.folder_id)?.name, n: [...S.cards.values()].filter(c => c.deck_id === d.id && c.type_id === 'oido').length, lang: d.options?.lang };
  });
  expect(r).toEqual({ folder: 'JLPT N5', n: 48, lang: 'ja-JP' });
});
