// Avisos con notificaciones (Web Push): llegan aunque la app esté cerrada.
// El navegador da una «suscripción» (una dirección a la que mandar avisos) y se guarda en Supabase con
// lo que quieres recibir: el recordatorio diario (a tu hora) y/o cuando alguien te anima. La función
// del servidor supabase/functions/recordatorio los manda. No sabe nada del resto de la app.
import * as config from './config.js';

const KEY = (config.VAPID_PUBLIC_KEY || '').trim();

// Por qué no se puede activar aquí (o '' si se puede)
export function pushBlocker({ cloud }) {
  if (!cloud) return 'local';
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (ios && !installed) return 'ios';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (!KEY) return 'server';
  if (Notification.permission === 'denied') return 'denied';
  return '';
}
export const BLOCKER_TEXT = {
  local: 'Los avisos necesitan una cuenta: en modo local no hay servidor que los mande.',
  ios: 'En iPhone y iPad, añade antes Flaski a la pantalla de inicio (Compartir → Añadir a pantalla de inicio) y ábrela desde ahí.',
  unsupported: 'Este navegador no permite notificaciones.',
  server: 'Los avisos aún no están configurados en el servidor.',
  denied: 'Has bloqueado las notificaciones de Flaski. Permítelas en los ajustes del navegador y vuelve a intentarlo.',
};

const b64ToBytes = s => {
  const b = atob((s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, c => c.charCodeAt(0));
};
const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Madrid';
const parts = time => { const [h, m] = String(time || '20:00').split(':').map(Number); return { hour: h || 0, minute: Math.round((m || 0) / 15) * 15 % 60 }; };

// Deja la suscripción de este dispositivo como dicen las preferencias:
// { daily, cheers, time }. Sin nada activado, se da de baja. api: { save(row), remove(endpoint) }
export async function syncPush({ daily, cheers, time }, api) {
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!daily && !cheers) {
    if (sub) { await api.remove(sub.endpoint).catch(() => {}); await sub.unsubscribe().catch(() => {}); }
    return;
  }
  if (!sub) {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error(perm === 'denied' ? 'denied' : 'dismissed');
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(KEY) });
  }
  const j = sub.toJSON();
  await api.save({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, ...parts(time), tz: zone(), daily: !!daily, cheers: !!cheers });
}
