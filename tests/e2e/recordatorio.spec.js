// Avisos: vienen activados; Inicio pide permiso con una tarjeta, se suscribe y guarda en la nube la hora y qué
// avisos; se pueden cambiar en Ajustes y, sin ninguno, se da de baja
import { test, expect } from './fixtures.js';
import { mockCloud, openCloud, sent } from './nube.js';

const VAPID = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
const CONFIG = `export const SUPABASE_URL = 'https://test.supabase.co';\nexport const SUPABASE_ANON_KEY = 'clave-de-prueba';\nexport const APP_NAME = 'Flaski';\nexport const VAPID_PUBLIC_KEY = '${VAPID}';\n`;

// Notificaciones y suscripción de mentira (el navegador de las pruebas no puede suscribirse de verdad)
async function fakePush(page, answer = 'granted', initial = 'default') {
  await page.addInitScript(([ans, init]) => {
    let sub = null, perm = init;
    const make = () => ({ endpoint: 'https://push.example/abc', toJSON: () => ({ endpoint: 'https://push.example/abc', keys: { p256dh: 'P', auth: 'A' } }), unsubscribe: async () => { sub = null; return true; } });
    const reg = { pushManager: { getSubscription: async () => sub, subscribe: async () => (sub = make()) } };
    Object.defineProperty(ServiceWorkerContainer.prototype, 'ready', { get: () => Promise.resolve(reg) });
    window.Notification.requestPermission = async () => (perm = ans);
    Object.defineProperty(window.Notification, 'permission', { get: () => perm });
  }, [answer, initial]);
}
async function cloudWithPush(page, answer, initial) {
  const srv = await mockCloud(page);
  await page.route('**/js/config.js', r => r.fulfill({ contentType: 'text/javascript', body: CONFIG }));
  await fakePush(page, answer, initial);
  await openCloud(page);
  return srv;
}
async function openSettings(page) {
  await page.locator('#nav').getByRole('button', { name: 'Perfil' }).click();
  await page.locator('[data-nav="settings"]').click();
}

test('sin cuenta (modo local) no pide nada y Ajustes explica que hace falta una', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#pushAsk')).toHaveCount(0);
  await openSettings(page);
  await expect(page.locator('#remindOn')).toBeDisabled();
  await expect(page.locator('#remindMsg')).toContainText('necesitan una cuenta');
  await expect(page.locator('#remindCheers')).toHaveCount(0);   // sin cuenta no hay amigos
});

test('con cuenta: Inicio pide activarlos, luego se cambian en Ajustes y sin ninguno se da de baja', async ({ page }) => {
  const srv = await cloudWithPush(page);
  await expect(page.locator('#pushAsk')).toContainText('Te recordamos repasar a las 20:00 y te avisamos cuando alguien te anime');
  await page.locator('#pushAsk [data-act="push-allow"]').click();
  await expect(page.locator('#pushAsk')).toHaveCount(0);
  await expect.poll(() => sent(srv, 'push_subs').length).toBe(1);
  const row = sent(srv, 'push_subs')[0][2];
  expect(row).toMatchObject({ endpoint: 'https://push.example/abc', p256dh: 'P', auth: 'A', hour: 20, minute: 0, daily: true, cheers: true });
  expect(row.tz).toBeTruthy();
  await openSettings(page);
  await expect(page.locator('#remindOn')).toBeChecked();
  await expect(page.locator('#remindCheers')).toBeChecked();
  await page.locator('#remindAt').selectOption('21:30');
  await expect.poll(() => sent(srv, 'push_subs').length).toBe(2);
  expect(sent(srv, 'push_subs')[1][2]).toMatchObject({ hour: 21, minute: 30 });
  await page.locator('#remindCheers').uncheck();
  await expect.poll(() => sent(srv, 'push_subs').length).toBe(3);
  expect(sent(srv, 'push_subs')[2][2]).toMatchObject({ daily: true, cheers: false });
  await page.locator('#remindOn').uncheck();
  await expect.poll(() => sent(srv, 'push_subs').some(w => w[0] === 'DELETE')).toBe(true);
});

test('«Ahora no» no vuelve a preguntar en este dispositivo; Ajustes deja permitirlo después', async ({ page }) => {
  const srv = await cloudWithPush(page);
  await page.locator('#pushAsk [data-act="push-later"]').click();
  await expect(page.locator('#pushAsk')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#main .spin')).toHaveCount(0);
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('#pushAsk')).toHaveCount(0);
  await openSettings(page);
  await expect(page.locator('#remindMsg')).toContainText('Falta permitir');
  await page.locator('#remindMsg [data-act="push-allow"]').click();
  await expect.poll(() => sent(srv, 'push_subs').length).toBe(1);
  await expect(page.locator('#remindMsg')).not.toContainText('Falta permitir');
});

test('si ya estaban permitidas, se suscribe solo al entrar', async ({ page }) => {
  const srv = await cloudWithPush(page, 'granted', 'granted');
  await expect.poll(() => sent(srv, 'push_subs').length).toBe(1);
  await expect(page.locator('#pushAsk')).toHaveCount(0);
});

test('si no se permite, la tarjeta se va y lo explica', async ({ page }) => {
  const srv = await cloudWithPush(page, 'denied');
  await page.locator('#pushAsk [data-act="push-allow"]').click();
  await expect(page.locator('#toast')).toContainText('Has bloqueado las notificaciones');
  await expect(page.locator('#pushAsk')).toHaveCount(0);
  expect(sent(srv, 'push_subs').length).toBe(0);
});
