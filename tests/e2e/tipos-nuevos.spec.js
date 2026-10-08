// Tipos de tarjeta: verdadero o falso, emparejar y tapar partes de una imagen
import { deflateSync } from 'node:zlib';
import { test, expect, openApp, createDeck } from './fixtures.js';

// PNG de 400×300 de un solo color (como un mapa de verdad, para poder dibujar encima)
function png(w, h) {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set([120, 170, 220], y * (w * 3 + 1) + 1 + x * 3);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const PNG = { name: 'mapa.png', mimeType: 'image/png', buffer: png(400, 300) };
async function newCardOfType(page, type) {
  await page.locator('#main [data-act="new-card"]').click();
  await page.locator('[data-act="pick-type"]').click();
  await page.locator(`[data-pick-type="${type}"]`).click();
}
const save = async page => { await page.locator('.ed-foot button[type="submit"]').click(); await expect(page.locator('#sheet')).toBeHidden(); };
const study = page => page.locator('#main [data-start]').first().click();

test('verdadero o falso: se escribe V o F y se responde con dos botones', async ({ page }) => {
  await openApp(page);
  await createDeck(page, 'Historia');
  await newCardOfType(page, 'truefalse');
  await page.locator('#fld-s').fill('Colón llegó a América en 1492');
  await page.locator('#fld-v').fill('v');
  await page.locator('#fld-n').fill('El 12 de octubre');
  await expect(page.locator('#pvCount')).toHaveText('1 tarjeta');
  await save(page);
  await expect(page.locator('#main .row')).toContainText('Verdadero');
  await study(page);
  await expect(page.locator('.choice')).toHaveText(['1Verdadero', '2Falso']);
  await page.keyboard.press('2');
  await expect(page.locator('.choice.wrong')).toHaveText('2Falso');
  await expect(page.locator('.choice.right')).toHaveText('1Verdadero');
  await expect(page.locator('.answer')).toContainText('El 12 de octubre');
  await expect(page.locator('.grade.suggested')).toHaveText(/Otra vez/);
});

test('emparejar: se une cada elemento con su pareja; los fallos bajan la nota sugerida', async ({ page }) => {
  await openApp(page);
  await createDeck(page, 'Turco');
  await newCardOfType(page, 'match');
  await page.locator('#fld-p').fill('ev = casa\nokul = escuela\nsu = agua');
  await save(page);
  await study(page);
  const L = t => page.locator('.match-col').first().getByRole('button', { name: t, exact: true });
  const R = t => page.locator('.match-col').nth(1).getByRole('button', { name: t, exact: true });
  await L('ev').click();
  await R('agua').click();                       // fallo
  await expect(page.locator('.match-hint')).toContainText('1 fallo');
  for (const [a, b] of [['ev', 'casa'], ['okul', 'escuela'], ['su', 'agua']]) { await L(a).click(); await R(b).click(); }
  await expect(page.locator('.verdict')).toContainText('1 fallo al emparejar');
  await expect(page.locator('.match-sol tr')).toHaveCount(3);
  await expect(page.locator('.grade.suggested')).toHaveText(/Difícil/);
});

test('tapar partes de una imagen: se dibujan recuadros y cada uno es una tarjeta', async ({ page }) => {
  await openApp(page);
  await createDeck(page, 'Geografía');
  await newCardOfType(page, 'occlusion');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#occEd [data-act="occ-pick"]').click();
  await (await chooser).setFiles(PNG);
  const stage = page.locator('#occStage');
  await expect(stage.locator('img.media')).toHaveAttribute('src', /^blob:/);
  await expect.poll(() => stage.evaluate(el => el.querySelector('img').naturalWidth)).toBeGreaterThan(0);
  const drag = async (x0, y0, x1, y1) => {
    const box = await page.locator('#occStage').boundingBox();
    await page.mouse.move(box.x + box.width * x0, box.y + box.height * y0);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * x1, box.y + box.height * y1, { steps: 4 });
    await page.mouse.up();
  };
  await drag(0.1, 0.1, 0.4, 0.3);
  await drag(0.6, 0.6, 0.9, 0.9);
  await drag(0.2, 0.7, 0.4, 0.95);
  await expect(page.locator('#occStage .occ-m')).toHaveCount(3);
  await expect(page.locator('#pvCount')).toHaveText('3 tarjetas');
  await page.locator('#occStage .occ-m').nth(2).click();          // quitar el tercero
  await expect(page.locator('#occStage .occ-m')).toHaveCount(2);
  await page.locator('#fld-h').fill('¿Qué ciudad es?');
  await save(page);
  await expect(page.locator('#main .row')).toHaveCount(2);

  await study(page);
  await expect(page.locator('.card .occ .occ-m')).toHaveCount(2);
  await expect(page.locator('.card .occ .occ-m.cur')).toHaveCount(1);
  await expect(page.locator('.card')).toContainText('¿Qué ciudad es?');
  await page.keyboard.press(' ');
  await expect(page.locator('.card .occ .occ-m.cur.open')).toHaveCount(1);
});
