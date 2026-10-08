// Amigos (modo con cuentas): invitar, aceptar, ver cómo van, animar y la clasificación de la semana
import { test, expect, nav } from './fixtures.js';
import { mockCloud, openCloud, sent } from './nube.js';

const ANA = { id: 'a0000000-0000-4000-8000-000000000001', name: 'Ana', since: '2026-09-01T10:00:00Z', shared: true, streak: 5, today: 12, week: [20, 15, 0, 12, 0, 0, 0], langs: ['de', 'ja'] };
const CARLOS = { id: 'c0000000-0000-4000-8000-000000000003', name: 'Carlos', since: '2026-09-02T10:00:00Z', shared: false, streak: 0, today: 0, week: [], langs: [] };
const BEA = { id: 'r0000000-0000-4000-8000-000000000001', other: 'b0000000-0000-4000-8000-000000000002', name: 'Bea', dir: 'in', created_at: '2026-10-01T10:00:00Z' };
const rpcs = (srv, fn) => sent(srv, fn).map(w => w[2]);

test('amigos: código para invitar, aceptar una petición, ver cómo van, animar y añadir con un código', async ({ page }) => {
  const srv = await mockCloud(page);
  Object.assign(srv.social, { friends: [ANA, CARLOS], requests: [BEA] });
  await openCloud(page);
  await nav(page, 'Perfil');
  await expect(page.locator('#frBadge')).toHaveText('1');
  await page.locator('[data-nav="friends"]').first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Amigos' })).toBeVisible();
  await expect(page.locator('#frMyCode')).toHaveText('EVA7-K2QX');

  // Ana comparte su actividad; Carlos no
  const ana = page.locator('.fr-card').filter({ has: page.locator(`[data-friend-menu="${ANA.id}"]`) });
  await expect(ana).toContainText('5 días');
  await expect(ana).toContainText('Hoy, 12 repasos');
  await expect(ana).toContainText('47 repasos esta semana · Alemán, Japonés');
  await expect(ana.locator('.fr-day')).toHaveCount(7);
  await expect(page.locator('.fr-card').filter({ has: page.locator(`[data-friend-menu="${CARLOS.id}"]`) })).toContainText('No comparte su actividad');

  // Petición de Bea
  srv.social.requests = [];
  srv.social.friends = [ANA, CARLOS, { ...ANA, id: BEA.other, name: 'Bea', streak: 1, today: 0, week: [3, 0, 0, 0, 0, 0, 0] }];
  await page.locator(`[data-fr-accept="${BEA.id}"]`).click();
  await expect(page.locator('.fr-card', { hasText: 'Bea' })).toBeVisible();
  expect(rpcs(srv, 'respond_friend')).toEqual([{ p_id: BEA.id, p_accept: true }]);

  // Animar a Ana: una vez al día
  await ana.locator('[data-cheer]').click();
  await expect(page.locator(`[data-cheer="${ANA.id}"]`)).toHaveText('Ánimo enviado');
  await expect(page.locator(`[data-cheer="${ANA.id}"]`)).toBeDisabled();
  expect(rpcs(srv, 'send_cheer')).toEqual([{ p_to: ANA.id, p_kind: 'clap' }]);

  // Añadir con un código, escrito de cualquier manera
  await page.locator('#frCode').fill('abcd 1234');
  await page.locator('#frCode').press('Enter');
  await expect(page.locator('#toast')).toContainText('Petición enviada');
  expect(rpcs(srv, 'request_friend')).toEqual([{ p_code: 'ABCD1234' }]);
  await page.locator('#frCode').fill('abc');
  await page.locator('#frCode').press('Enter');
  await expect(page.locator('#toast')).toContainText('8 letras o números');

  // Dejar de compartir la actividad
  await page.locator('#frShare').evaluate(el => el.scrollIntoView());
  await page.locator('#frShare').locator('xpath=..').click();
  await expect.poll(() => rpcs(srv, 'set_share')).toEqual([{ p_share: false }]);

  // Quitar a Carlos
  await page.locator(`[data-friend-menu="${CARLOS.id}"]`).click();
  await page.locator(`[data-fr-remove="${CARLOS.id}"]`).click();
  await expect.poll(() => rpcs(srv, 'remove_friend')).toEqual([{ p_other: CARLOS.id }]);
});

test('Inicio: ánimos recibidos y clasificación de la semana', async ({ page }) => {
  const srv = await mockCloud(page);
  Object.assign(srv.social, { friends: [ANA, CARLOS], cheers: [{ id: 'h1', name: 'Ana', kind: 'clap', created_at: '2026-10-08T08:00:00Z' }] });
  await openCloud(page);
  const rank = page.locator('.rank li');
  await expect(rank).toHaveCount(2);   // Carlos no comparte: no sale
  await expect(rank.nth(0)).toContainText('Ana');
  await expect(rank.nth(0)).toContainText('47 repasos');
  await expect(rank.nth(1)).toContainText('Tú');
  await expect(page.locator('.cheer-banner')).toContainText('Ana te anima a seguir estudiando');
  await page.locator('[data-act="cheers-seen"]').click();
  await expect(page.locator('.cheer-banner')).toHaveCount(0);
  await expect.poll(() => sent(srv, 'cheers').map(w => w[0])).toEqual(['PATCH']);
});

test('un enlace de invitación ofrece añadir a quien lo manda', async ({ page }) => {
  const srv = await mockCloud(page);
  srv.social.result = 'accepted';
  await page.goto('/#amigo-ZZZZ-2222');
  await expect(page.locator('#sheetBody')).toContainText('Te han invitado a Flaski');
  await page.locator('[data-act="fr-accept-invite"]').click();
  await expect(page.locator('#toast')).toContainText('¡Ya sois amigos!');
  expect(rpcs(srv, 'request_friend')).toEqual([{ p_code: 'ZZZZ2222' }]);
  expect(await page.evaluate(() => location.hash)).toBe('');
});

test('sin las funciones de amigos en Supabase, lo explica (y la app sigue funcionando)', async ({ page }) => {
  const srv = await mockCloud(page);
  srv.social.missing = true;
  await openCloud(page);
  await expect(page.locator('.hero-num')).toHaveText('3');
  await expect(page.locator('.rank')).toHaveCount(0);
  await nav(page, 'Perfil');
  await page.locator('[data-nav="friends"]').first().click();
  await expect(page.locator('#main')).toContainText('ejecuta otra vez supabase/schema.sql');
});
