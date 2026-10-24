// Modo local de pruebas: con «?local» en la dirección y solo en este ordenador (localhost), la app usa
// el backend local aunque Supabase esté configurado. Sus datos van aparte (otra clave y otra base en el
// navegador), así que pasar de un modo a otro nunca mezcla ni pisa la copia de la cuenta real.
// Sin dependencias, para probarlo aparte.

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1'];

export function isLocalTest(loc = globalThis.location) {
  if (!loc) return false;
  const host = String(loc.hostname || '').toLowerCase();
  if (!LOCAL_HOSTS.includes(host)) return false;
  try { return new URLSearchParams(loc.search || '').has('local'); } catch { return false; }
}

export const localTest = isLocalTest();
// Dónde guarda sus datos el backend local y sus imágenes, según el modo
export const LOCAL_KEY = localTest ? 'flaski-pruebas-v1' : 'flaski-local-v1';
export const MEDIA_DB = localTest ? 'flaski-media-pruebas' : 'flaski-media';
