// Avisos: activarlos pide permiso, se suscribe y guarda en la nube la hora y qué avisos; sin ninguno, se da de baja
import { test, expect } from './fixtures.js';
import { mockCloud, openCloud, sent } from './nube.js';

const VAPID = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';

// Notificaciones y suscripción de mentira (el navegador de las pruebas no puede suscribirse de verdad)
async function fakePush(page, permission = 'granted') {
  await page.addInitScript(perm => {
    let sub = null;
    const make = () => ({ endpoint: 'https://push.example/abc', toJSON: () => ({ endpoint: 'https://push.example/abc', keys: { p256dh: 'P', auth: 'A' } }), unsubscribe: async () => { sub = null; return true; } });
    const reg = { pushManager: { getSubscription: async () => sub, subscribe: async () => (sub = make()) } };
    Object.defineProperty(ServiceWorkerContainer.prototype, 'ready', { get: () => Promise.resolve(reg) });
    window.Notification.requestPermission = async () => perm;
    Object.defineProperty(window.Notification, 'permission', { get: () => 'default' });
  }, permission);
}
async function openSettings(page) {
  await page.locator('#nav').getByRole('button', { name: 'Perfil' }).click();
  await page.locator('[data-nav="settings"]').click();
}

test('sin cuenta (modo local) explica que hace falta una', async ({ page }) => {
  await page.goto('/');
  await openSettings(page);
  await expect(page.locator('#remindOn')).toBeDisabled();
  await expect(page.locator('#remindMsg')).toContainText('necesitan una cuenta');
  await expect(page.locator('#remindCheers')).toHaveCount(0);   // sin cuenta no hay amigos
});

test('con cuenta: activar, cambiar la hora y desactivar', async ({ page }) => {
  const srv = await mockCloud(page);
  await page.route('**/js/config.js', r => r.fulfill({ contentType: 'text/javascript', body: `export const SUPABASE_URL = 'https://test.supabase.co';\nexport const SUPABASE_ANON_KEY = 'clave-de-prueba';\nexport const APP_NAME = 'Flaski';\nexport const VAPID_PUBLIC_KEY = '${VAPID}';\n` }));
  await fakePush(page);
  await openCloud(page);
  await openSettings(page);
  await page.locator('#remindAt').selectOption('21:30');
  await page.locator('#remindOn').check();
  await expect(page.locator('#remindMsg')).toContainText('Te avisaremos a las 21:30');
  await expect.poll(() => sent(srv, 'push_subs').length).toBe(1);
  const row = sent(srv, 'push_subs')[0][2];
  expect(row).toMatchObject({ endpoint: 'https://push.example/abc', p256dh: 'P', auth: 'A', hour: 21, minute: 30, daily: true, cheers: false });
  expect(row.tz).toBeTruthy();
  await page.locator('#remindAt').selectOption('08:00');
  await expect.poll(() => sent(srv, 'push_subs').length).toBe(2);
  expect(sent(srv, 'push_subs')[1][2]).toMatchObject({ hour: 8, minute: 0 });
  // Los ánimos, en la misma suscripción
  await page.locator('#remindCheers').check();
  await expect.poll(() => sent(srv, 'push_subs').length).toBe(3);
  expect(sent(srv, 'push_subs')[2][2]).toMatchObject({ daily: true, cheers: true });
  await page.locator('#remindOn').uncheck();
  await expect.poll(() => sent(srv, 'push_subs').length).toBe(4);
  expect(sent(srv, 'push_subs')[3][2]).toMatchObject({ daily: false, cheers: true });
  // Sin nada activado, se da de baja
  await page.locator('#remindCheers').uncheck();
  await expect.poll(() => sent(srv, 'push_subs').some(w => w[0] === 'DELETE')).toBe(true);
});

test('si no se permite, se queda desactivado y lo explica', async ({ page }) => {
  await mockCloud(page);
  await page.route('**/js/config.js', r => r.fulfill({ contentType: 'text/javascript', body: `export const SUPABASE_URL = 'https://test.supabase.co';\nexport const SUPABASE_ANON_KEY = 'clave-de-prueba';\nexport const APP_NAME = 'Flaski';\nexport const VAPID_PUBLIC_KEY = '${VAPID}';\n` }));
  await fakePush(page, 'denied');
  await openCloud(page);
  await openSettings(page);
  await page.locator('#remindOn').click();
  await expect(page.locator('#remindOn')).not.toBeChecked();
  await expect(page.locator('#remindMsg')).toContainText('Has bloqueado las notificaciones');
});
