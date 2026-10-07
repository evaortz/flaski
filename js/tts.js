// Audio con la voz del propio navegador (Web Speech API). Gratis y sin servidor.
// Las voces disponibles dependen del dispositivo: un iPhone trae voces de casi todos
// los idiomas; en Windows puede que haya que instalar el idioma en Configuración → Hora e idioma → Voz.

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
let voices = [];
function refresh() { voices = synth ? synth.getVoices() : []; }
if (synth) { refresh(); synth.addEventListener?.('voiceschanged', refresh); }

export const ttsAvailable = () => !!synth;

function voiceFor(lang) {
  if (!voices.length) refresh();
  const l = lang.toLowerCase(), base = l.split('-')[0];
  return voices.find(v => v.lang.toLowerCase() === l && v.localService)
    || voices.find(v => v.lang.toLowerCase() === l)
    || voices.find(v => v.lang.toLowerCase().startsWith(base));
}

export function hasVoice(lang) { return !!(synth && lang && voiceFor(lang)); }

let baseRate = 1;
// Velocidad global (Ajustes → Voz): multiplica la de cada llamada
export function setBaseRate(r) { baseRate = Number(r) || 1; }
export function speak(text, lang, { rate = 0.95 } = {}) {
  if (!synth || !lang) return false;
  // Huecos {{x}} → x · furigana 漢字[かんじ] → かんじ (la lectura suena mejor) · piezas « / » → espacio
  const clean = String(text || '').replace(/!\[[^\]\n]*\]\(img:[\w-]+\)/g, ' ').replace(/\{\{(.+?)(?:::.+?)?\}\}/g, '$1')
    .replace(/([\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF々〆ヶ]+)\[([^\]\n]+)\]/g, '$2')
    .replace(/\s*\/\s*/g, ' ').replace(/\*/g, '').trim();
  if (!clean) return false;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = lang;
  const v = voiceFor(lang);
  if (v) u.voice = v;
  u.rate = Math.max(0.3, Math.min(2, rate * baseRate));
  synth.speak(u);
  return true;
}

export function stopSpeaking() { synth?.cancel(); }
