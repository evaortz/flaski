// Batería rápida, para mientras trabajas: solo el proyecto «movil» y solo las pruebas de lo que has cambiado.
//   npm run e2e:rapida                      → lo que toca a los archivos cambiados (git: sin commit y sin seguimiento)
//   npm run e2e:rapida -- plan apuntes      → las de esas pantallas (claves de PANTALLAS)
//   npm run e2e:rapida -- --last-failed     → repite solo lo que falló la última vez
// Lo demás que pongas (--repeat-each=3, -g texto…) pasa tal cual a Playwright. Al final del paso, la batería completa.
import { execSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

// Qué pruebas (tests/e2e/<nombre>.spec.js) mira cada pantalla
const PANTALLAS = {
  apuntes: ['apuntes', 'bloques', 'editor-apunte', 'apunte-repasar', 'apunte-ancho', 'formato', 'remates-pasada', 'exportar', 'remates-archivos', 'sugerencias', 'remates-paso5'],
  tanda: ['antes-del-push', 'estudio', 'tanda-corta', 'tanda-tipos', 'remates-tanda', 'remates-repaso', 'deslizar', 'entender', 'remates-correccion', 'aleman'],
  tipos: ['tipos', 'tipos-nuevos', 'kanji', 'remates-kanji', 'furigana', 'voz'],
  editor: ['remates-editor', 'remates-preguntas', 'guardar-y-otra', 'tipos'],
  hoy: ['hoy', 'inicio', 'hecho-por-hoy', 'minutos-de-verdad', 'dia-libre', 'progreso'],
  plan: ['plan', 'remates-plan', 'hecho-por-hoy', 'dia-libre', 'minutos-de-verdad'],
  simulacro: ['simulacro'],
  mapa: ['mapa'],
  biblioteca: ['lista', 'remates-biblioteca', 'buscar-borrar', 'papelera', 'iconos'],
  explorar: ['explorar', 'explorar-tema', 'safari-tema', 'tema-memoria'],
  bienvenida: ['bienvenida', 'novedades'],
  perfil: ['perfil-ajustes', 'datos', 'pantallas', 'recordatorio'],
  amigos: ['amigos'],
  papelera: ['papelera'],
  nube: ['sin-conexion', 'sincronizar', 'actualizar', 'errores', 'modo-pruebas'],
  aspecto: ['contraste', 'desborde', 'tactil', 'logo', 'repaso-25oct', 'apunte-ancho'],
};
// Qué pantallas toca cada archivo de la app (por el principio de su ruta)
const ARCHIVOS = [
  [/^js\/pantallas\/apuntes|^js\/(pages|inline|liveedit|paste|notesio|notes|pdf|zip)\.js/, ['apuntes']],
  [/^js\/pantallas\/estudio|^js\/(srs|fsrs|tanda|feel|entender)\.js/, ['tanda']],
  [/^js\/(cardtypes|handwriting|tts)\.js/, ['tipos', 'tanda']],
  [/^js\/pantallas\/editor/, ['editor', 'biblioteca']],
  [/^js\/pantallas\/inicio|^js\/(atrasos|charts|stats)\.js/, ['hoy']],
  [/^js\/pantallas\/plan|^js\/plan\.js/, ['plan']],
  [/^js\/pantallas\/simulacro/, ['simulacro']],
  [/^js\/pantallas\/mapa|^js\/mapa\.js/, ['mapa']],
  [/^js\/pantallas\/(biblioteca|mazos)|^js\/org\.js/, ['biblioteca']],
  [/^js\/pantallas\/(explorar|pruebas|sugerencias)|^js\/(primera-vez|suggest|anki|sqlite|csv)\.js|^decks\/|^temas\//, ['explorar', 'bienvenida']],
  [/^js\/(onboarding|news)\.js/, ['bienvenida']],
  [/^js\/pantallas\/(perfil|cuenta|borrar-cuenta)|^js\/prefs\.js/, ['perfil']],
  [/^js\/pantallas\/amigos|^js\/friends\.js/, ['amigos']],
  [/^js\/pantallas\/papelera/, ['papelera']],
  [/^js\/(api|backend-|outbox|snapshot|media|push|modo)/, ['nube', 'papelera']],
  [/^css\/|^index\.html|^js\/icons\.js|^js\/dibujos\.js/, ['aspecto']],
  [/^js\/(comun|app)\.js/, ['hoy', 'tanda', 'biblioteca']],
  [/^sw\.js/, ['nube']],
];

const args = process.argv.slice(2);
const pass = args.filter(a => a.startsWith('-'));
const wanted = args.filter(a => !a.startsWith('-'));
let specs = new Set();
if (wanted.length) {
  for (const w of wanted) {
    if (PANTALLAS[w]) PANTALLAS[w].forEach(s => specs.add(s));
    else if (existsSync(`e2e/${w}.spec.js`)) specs.add(w);
    else { console.error(`No conozco «${w}». Pantallas: ${Object.keys(PANTALLAS).join(', ')}`); process.exit(2); }
  }
} else if (!pass.includes('--last-failed')) {
  const git = cmd => execSync(cmd, { cwd: '..', encoding: 'utf8' }).split('\n').filter(Boolean);
  const changed = [...git('git diff --name-only HEAD'), ...git('git ls-files --others --exclude-standard')];
  for (const f of changed) {
    const spec = /^tests\/e2e\/(.+)\.spec\.js$/.exec(f)?.[1];
    if (spec) { specs.add(spec); continue; }
    for (const [re, screens] of ARCHIVOS) if (re.test(f)) screens.forEach(k => PANTALLAS[k].forEach(s => specs.add(s)));
  }
  if (!specs.size) { console.log('No hay cambios que toquen la app: nada que probar. (Pon pantallas o --last-failed)'); process.exit(0); }
}
const files = [...specs].filter(s => existsSync(`e2e/${s}.spec.js`)).map(s => `e2e/${s}.spec.js`);
if (files.length) console.log(`Batería rápida (movil): ${files.length} archivos: ${[...specs].join(', ')}`);
const r = spawnSync('npx', ['playwright', 'test', '--project=movil', ...files, ...pass], { stdio: 'inherit', shell: true });
process.exit(r.status ?? 1);
