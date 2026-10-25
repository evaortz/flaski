// Qué sale de un texto pegado (para probar a mano): node pegado.mjs
import { suggestCards } from '../js/suggest.js';
import { plainTextToPage as markdownToPage } from '../js/notesio.js';

const TEXT = `Tema 1. La Constitución Española de 1978

La Constitución fue aprobada por las Cortes el 31 de octubre de 1978 y ratificada en referéndum el 6 de diciembre de 1978. Entró en vigor el 29 de diciembre de 1978.

Estructura: tiene 169 artículos, un preámbulo y un Título Preliminar seguido de diez títulos.

Artículo 1: España se constituye en un Estado social y democrático de Derecho. La soberanía nacional reside en el pueblo español. La forma política del Estado español es la Monarquía parlamentaria.

Artículo 3: El castellano es la lengua española oficial del Estado.`;
const p = markdownToPage(process.argv[2] === 'unido' ? TEXT.replace(/\n\n/g, '\n') : TEXT);
console.log('título:', JSON.stringify(p.title));
console.log(p.blocks.map(b => `[${b.type}] ${b.text}`).join('\n'));
const list = suggestCards({ id: 'x', ...p }, { native: 'es-ES' });
console.log(`\n${list.length} sugerencias`);
for (const s of list) console.log(`- ${s.typeId}: ${s.front || s.fields?.x} → ${s.back || ''}`);
