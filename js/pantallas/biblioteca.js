// Flaski · Biblioteca: las listas y los apuntes, uno debajo de otro (en la fase 3 se unen en carpetas)
import { main } from '../comun.js';
import { renderDecks } from './mazos.js';
import { renderNotes } from './apuntes.js';

// Cada sección se repinta sola (buscar, filtrar, ordenar) con renderDecks/renderNotes, que pintan en libHost
export function renderLibrary() {
  main.innerHTML = '<section class="lib-sec" id="libDecks" aria-label="Listas"></section><section class="lib-sec" id="libNotes" aria-label="Apuntes"></section>';
  renderDecks();
  renderNotes();
}
