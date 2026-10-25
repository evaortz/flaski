// Avisos de Flaski (Supabase Edge Function, Deno). Dos formas de llamarla (ver README.md de esta carpeta):
// - Cada 15 minutos (pg_cron): a cada dispositivo con el recordatorio diario (tabla push_subs) cuya hora
//   ha llegado en su zona horaria, y al que aún no se le ha avisado hoy, le manda un aviso si le tocan
//   repasos o si va a perder la racha. Si no, no molesta.
// - Con un webhook de la base de datos al crearse un ánimo (tabla cheers): avisa a quien lo recibe.
//
// Secretos (supabase secrets set …): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:…),
// y opcionalmente CRON_SECRET (entonces hay que mandarlo en la cabecera x-cron-secret).
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los pone Supabase.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const env = (k: string) => Deno.env.get(k) ?? '';
webpush.setVapidDetails(env('VAPID_SUBJECT') || 'mailto:hola@flaski.app', env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

type Sub = { endpoint: string; user_id: string; p256dh: string; auth: string; hour: number; minute: number; tz: string; last_sent: string | null; daily: boolean; cheers: boolean };

// Manda un aviso a una suscripción; si ya no existe (app desinstalada, permiso quitado…), la borra
async function send(s: Sub, msg: { title: string; body: string; tag: string; url?: string }) {
  try {
    await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ url: './', ...msg }), { TTL: 4 * 3600 });
    return 'sent';
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode;
    if (code === 404 || code === 410) { await sb.from('push_subs').delete().eq('endpoint', s.endpoint); return 'gone'; }
    console.error('push', code, (e as Error).message);
    return 'error';
  }
}
// Lo mismo que se ve en la app (CHEERS en js/pantallas/amigos.js); el fuego, que allí es el icono de la racha, va como 🔥
const CHEER: Record<string, string> = { clap: '¡Ánimo!', go: '¡Tú puedes!', fire: '🔥', bravo: '¡Bravo!' };
// Un ánimo nuevo (webhook de la tabla cheers): avisa en los dispositivos de quien lo recibe
async function cheer(rec: { to_user: string; from_user: string; kind: string }) {
  const { data: subs } = await sb.from('push_subs').select('*').eq('user_id', rec.to_user).eq('cheers', true);
  if (!subs?.length) return { sent: 0 };
  const { data: p } = await sb.from('profiles').select('display_name').eq('id', rec.from_user).maybeSingle();
  const name = (p?.display_name || '').trim() || 'Un amigo';
  let sent = 0;
  for (const s of subs as Sub[]) if (await send(s, { title: `${name} te dice: «${CHEER[rec.kind] || CHEER.clap}»`, body: 'Entra en Flaski para verlo y seguir con tu racha.', tag: 'flaski-animo' }) === 'sent') sent++;
  return { sent };
}

// Fecha (AAAA-MM-DD) y minutos desde medianoche en la zona horaria de cada uno
function localNow(tz: string, now: Date) {
  let p: Record<string, string>;
  try {
    p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(now).map(x => [x.type, x.value]));
  } catch { return localNow('Europe/Madrid', now); }
  return { day: `${p.year}-${p.month}-${p.day}`, mins: Number(p.hour) * 60 + Number(p.minute) };
}
const prevDay = (d: string) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() - 1); return t.toISOString().slice(0, 10); };
const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;

// Lo que toca hoy, si ya ha estudiado y su racha
async function userState(uid: string, day: string, mins: number, now: Date) {
  const endOfDay = new Date(now.getTime() + (1440 - mins) * 60_000).toISOString();
  const { count } = await sb.from('progress').select('card_id', { count: 'exact', head: true }).eq('user_id', uid).lte('due', endOfDay);
  const { data: log } = await sb.from('review_log').select('day, count').eq('user_id', uid).gt('count', 0).order('day', { ascending: false }).limit(400);
  const days = new Set((log ?? []).map(r => String(r.day)));
  const studied = days.has(day);
  // La racha, con el comodín de la semana (la misma regla que streaks() en js/charts.js)
  const monday = (k: string) => { const t = new Date(k + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7)); return t.toISOString().slice(0, 10); };
  const used = new Set<string>();
  let streak = 0, d = studied ? day : prevDay(day);
  for (;;) {
    if (days.has(d)) { streak++; d = prevDay(d); continue; }
    if (d < day && days.has(prevDay(d)) && !used.has(monday(d))) { used.add(monday(d)); d = prevDay(d); continue; }
    break;
  }
  return { due: count ?? 0, studied, streak, freeze: streak > 0 && !used.has(monday(day)) };
}
function message({ due, studied, streak, freeze }: { due: number; studied: boolean; streak: number; freeze: boolean }) {
  if (due > 0 && studied) return { title: `Te ${due === 1 ? 'queda' : 'quedan'} ${n(due, 'tarjeta', 'tarjetas')}`, body: 'Aún tienes repasos pendientes para hoy.' };
  if (due > 0) return { title: `Te ${due === 1 ? 'toca' : 'tocan'} ${n(due, 'tarjeta', 'tarjetas')}`, body: streak > 0 ? `Repásalas y sigues con tu racha de ${n(streak, 'día', 'días')}.` : 'Con unos minutos lo dejas al día.' };
  if (streak > 0 && !studied) return { title: `Tu racha de ${n(streak, 'día', 'días')}`, body: freeze ? 'Hoy no te toca repasar. Si no estudias, gastarás el comodín de la semana.' : 'Hoy no te toca repasar, pero con unas pocas nuevas la mantienes.' };
  return null;
}

Deno.serve(async req => {
  if (env('CRON_SECRET') && req.headers.get('x-cron-secret') !== env('CRON_SECRET')) return new Response('no', { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (body?.table === 'cheers' && body?.type === 'INSERT' && body.record) return Response.json(await cheer(body.record));
  const now = new Date();
  const { data: subs, error } = await sb.from('push_subs').select('*').eq('daily', true);
  if (error) return new Response(error.message, { status: 500 });
  const cache = new Map<string, ReturnType<typeof userState>>();
  let sent = 0, gone = 0;
  for (const s of (subs ?? []) as Sub[]) {
    const { day, mins } = localNow(s.tz, now);
    const at = s.hour * 60 + s.minute;
    if (s.last_sent === day || mins < at || mins >= at + 15) continue;
    const key = `${s.user_id}|${day}`;
    if (!cache.has(key)) cache.set(key, userState(s.user_id, day, mins, now));
    const msg = message(await cache.get(key)!);
    if (msg) {
      const r = await send(s, { ...msg, tag: 'flaski-recordatorio' });
      if (r === 'gone') { gone++; continue; }
      if (r === 'error') continue;
      sent++;
    }
    await sb.from('push_subs').update({ last_sent: day }).eq('endpoint', s.endpoint);
  }
  return Response.json({ sent, gone });
});
