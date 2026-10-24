// Modo local de pruebas: en localhost con «?local», backend local aunque Supabase esté configurado,
// con sus datos aparte de la copia de la cuenta real
import { test, expect, nav, startTanda } from './fixtures.js';
import { mockCloud, openCloud, UID } from './nube.js';

test('con ?local usa el backend local, avisa y carga datos de ejemplo sin tocar la cuenta real', async ({ page }) => {
  const srv = await mockCloud(page);           // Supabase configurado y con sesión iniciada
  const cloud = [];
  page.on('request', r => { if (r.url().startsWith('https://test.supabase.co')) cloud.push(r.url()); });
  // Lo que ya hubiera en este navegador del modo local normal y de la cuenta (cola de envíos) no se toca
  await page.addInitScript(([uid]) => {
    if (sessionStorage.getItem('puesto')) return;
    sessionStorage.setItem('puesto', '1');
    localStorage.setItem('flaski-local-v1', JSON.stringify({ decks: [{ id: 'x', owner: 'local', name: 'Lista del modo local', created_at: '2026-01-01' }], cards: [] }));
    localStorage.setItem('flaski-outbox:' + uid, JSON.stringify([{ id: 'o1', op: 'saveSettings', args: [uid, 15, null] }]));
  }, [UID]);

  await page.goto('/?local');
  await expect(page.locator('.testbar')).toContainText('Modo local de pruebas');
  await expect(page.locator('#main .spin')).toHaveCount(0);
  await expect(page.locator('#banner')).toBeHidden();
  await expect(page.locator('#main')).toContainText('Todavía no tienes listas');

  await page.getByRole('button', { name: 'Cargar datos de ejemplo' }).click();
  await expect(page.locator('#toast')).toContainText('Datos de ejemplo cargados: 3 listas y 2 apuntes');
  await expect(page.locator('.hero-num')).toBeVisible();
  await expect(page.locator('#pgHost .lv-n')).not.toHaveText('0');      // «Cómo va lo que sabes» con progreso
  await expect(page.locator('.hoy-act .hm.l1, .hoy-act .hm.l2, .hoy-act .hm.l3, .hoy-act .hm.l4').first()).toBeAttached();
  await nav(page, 'Biblioteca');
  await expect(page.locator('#main')).toContainText('Alemán · A2');
  await expect(page.locator('#main')).not.toContainText('Lista del modo local');

  // Otra vez: no se repiten
  await page.getByRole('button', { name: 'Cargar datos de ejemplo' }).click();
  await expect(page.locator('#toast')).toContainText('ya estaban');
  await expect(page.locator('body')).toHaveAttribute('data-view', 'home');

  // Al recargar (sigue con ?local), los datos siguen ahí
  await page.reload();
  await expect(page.locator('.testbar')).toBeVisible();
  await nav(page, 'Biblioteca');
  await expect(page.locator('#main')).toContainText('Japonés · Demo de Flaski');

  const stored = await page.evaluate(([uid]) => ({
    pruebas: JSON.parse(localStorage.getItem('flaski-pruebas-v1') || '{}').decks?.length,
    local: localStorage.getItem('flaski-local-v1'),
    outbox: localStorage.getItem('flaski-outbox:' + uid),
  }), [UID]);
  expect(stored.pruebas).toBe(3);
  expect(JSON.parse(stored.local).decks).toHaveLength(1);
  expect(JSON.parse(stored.outbox)).toHaveLength(1);
  expect(cloud).toEqual([]);
  expect(srv.writes).toEqual([]);

  // Sin ?local, la cuenta de siempre (y su cola pendiente se envía)
  await openCloud(page);
  await expect(page.locator('.testbar')).toHaveCount(0);
  await expect(page.locator('.hero-num')).toHaveText('3');
  await expect.poll(() => srv.writes.filter(w => w[1] === 'settings').length).toBe(1);
});

test.describe('con la bienvenida a la vista', () => {
  test.use({ intro: true });
  test('«Cargar datos de ejemplo» cierra la bienvenida, lleva a Hoy y el aviso no tapa la tanda', async ({ page }) => {
    await page.goto('/?local');
    await expect(page.locator('.ob')).toBeVisible();
    await page.getByRole('button', { name: 'Cargar datos de ejemplo' }).click();
    await expect(page.locator('#toast')).toContainText('Datos de ejemplo cargados: 3 listas y 2 apuntes');
    await expect(page.locator('.ob')).toHaveCount(0);          // ni la bienvenida ni Novedades
    await expect(page.locator('body')).toHaveAttribute('data-view', 'home');
    await expect(page.locator('.hero-num')).toBeVisible();
    // En la tanda, la cabecera queda debajo del aviso y la pregunta cabe sin scroll
    await startTanda(page);
    const bar = await page.locator('.testbar').boundingBox(), head = await page.locator('.studybar').boundingBox();
    expect(head.y).toBeGreaterThanOrEqual(bar.y + bar.height);
    expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(4);
  });
});
