// Supabase de mentira para probar el modo con cuentas sin tocar la base de datos real:
// una sesión ya iniciada en el navegador y una API REST en memoria.
import { expect } from '@playwright/test';

export const UID = '11111111-1111-4111-8111-111111111111';
const URL = 'https://test.supabase.co';
const CONFIG = `export const SUPABASE_URL = '${URL}';
export const SUPABASE_ANON_KEY = 'clave-de-prueba';
export const APP_NAME = 'Flaski';
`;

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const exp = Math.floor(Date.now() / 1000) + 24 * 3600;
const JWT = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp })}.firma`;
const SESSION = {
  access_token: JWT, token_type: 'bearer', expires_in: 86400, expires_at: exp, refresh_token: 'refresco',
  user: { id: UID, email: 'prueba@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} },
};

const DECK = { id: 'd0000000-0000-4000-8000-000000000001', owner: UID, name: 'Turco en la nube', description: '', created_at: '2026-01-01T00:00:00Z', tags: [], is_public: false };
const card = (n, q, a) => ({ id: `c000000${n}-0000-4000-8000-000000000001`, deck_id: DECK.id, owner: UID, front: q, back: a, note: '', position: n, note_id: `n${n}`, type_id: 'basic', template: 't1', fields: { q, a }, hint: '', tags: [] });

// Monta el servidor falso en la página. Devuelve su estado: lo recibido y un interruptor de red.
export async function mockCloud(page) {
  const srv = {
    reachable: true,
    tables: { decks: [DECK], cards: [card(1, 'ev', 'casa'), card(2, 'kapı', 'puerta'), card(3, 'su', 'agua')], progress: [], review_log: [], folders: [], tags: [], note_types: [], review_events: [] },
    writes: [],   // [método, tabla, cuerpo]
    files: new Map(),   // Storage: ruta → { body, type }
    // Amigos: lo que devuelven las funciones de schema.sql (missing: como si faltara ejecutarlo)
    social: { code: 'EVA7K2QX', share: true, friends: [], requests: [], cheers: [], result: 'sent', missing: false },
  };
  await page.route('**/js/config.js', r => r.fulfill({ contentType: 'text/javascript', body: CONFIG }));
  await page.addInitScript(([k, v]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, v); }, ['sb-test-auth-token', JSON.stringify(SESSION)]);
  await page.route(`${URL}/**`, async route => {
    if (!srv.reachable) return route.abort('internetdisconnected');
    const req = route.request();
    const u = new globalThis.URL(req.url());
    const path = u.pathname.replace('/rest/v1/', '');
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path.startsWith('/auth/v1/logout')) return route.fulfill({ status: 204, body: '' });
    // Storage: subir y descargar archivos (las imágenes)
    const obj = /^\/storage\/v1\/object\/(?:authenticated\/)?(.+)$/.exec(path);
    if (obj) {
      const key = decodeURIComponent(obj[1]);
      if (req.method() === 'GET') {
        const f = srv.files.get(key);
        return f ? route.fulfill({ status: 200, contentType: f.type, body: f.body }) : json({ statusCode: '404', error: 'not_found', message: 'Object not found' }, 400);
      }
      srv.files.set(key, { body: req.postDataBuffer(), type: req.headers()['content-type'] || '' });
      return json({ Key: key, Id: key });
    }
    if (path.startsWith('/auth/')) return json({ message: 'no disponible en las pruebas' }, 400);
    if (path === 'rpc/bump_review_log') {
      const { p_day, p_delta } = req.postDataJSON();
      srv.writes.push(['rpc', 'bump_review_log', { p_day, p_delta }]);
      return json(srv.writes.filter(w => w[1] === 'bump_review_log' && w[2].p_day === p_day).reduce((s, w) => s + w[2].p_delta, 0));
    }
    const SOCIAL = { my_social: () => [{ code: srv.social.code, share: srv.social.share }], friend_summary: () => srv.social.friends,
      friend_requests: () => srv.social.requests, my_cheers: () => srv.social.cheers, request_friend: () => srv.social.result };
    const fn = path.startsWith('rpc/') ? path.slice(4) : '';
    if (['my_social', 'friend_summary', 'friend_requests', 'my_cheers', 'request_friend', 'respond_friend', 'remove_friend', 'block_friend', 'unblock_friend', 'send_cheer', 'set_share'].includes(fn)) {
      if (srv.social.missing) return json({ code: 'PGRST202', message: 'Could not find the function' }, 404);
      srv.writes.push(['rpc', fn, req.postData() ? req.postDataJSON() : null]);
      return json(SOCIAL[fn] ? SOCIAL[fn]() : null);
    }
    const method = req.method();
    if (method === 'GET') {
      const single = (req.headers().accept || '').includes('vnd.pgrst.object');
      if (path === 'profiles') return json(single ? { id: UID, display_name: 'Prueba' } : [{ id: UID, display_name: 'Prueba' }]);
      if (path === 'settings') return single ? json({ new_per_day: 15, prefs: {} }) : json([{ new_per_day: 15, prefs: {} }]);
      return json(srv.tables[path] || []);
    }
    srv.writes.push([method, path, req.postData() ? req.postDataJSON() : null]);
    return route.fulfill({ status: method === 'DELETE' ? 204 : 201, body: '' });
  });
  return srv;
}

export async function openCloud(page) {
  await page.goto('/');
  // Con muchas pruebas a la vez, arrancar puede tardar más de lo normal
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20000 });
  await expect(page.locator('#main .spin')).toHaveCount(0);
}

export const sent = (srv, table) => srv.writes.filter(w => w[1] === table);
