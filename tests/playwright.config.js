import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT || 8123);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: 0,
  // La mitad de los núcleos: con todos a la vez, las recargas y la carga de la app tardan tanto que las esperas
  // se quedan cortas. Las pruebas esperan a un estado de la página (no a un tiempo), con estos márgenes
  workers: '50%',
  timeout: 60000,
  expect: { timeout: 10000 },
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    serviceWorkers: 'block',     // que el service worker no sirva versiones guardadas
    // Grabar la traza cuesta en todas las pruebas (un 24 % más): solo con TRACE=1, para depurar un fallo
    trace: process.env.TRACE ? 'retain-on-failure' : 'off',
  },
  projects: [
    { name: 'movil', use: { ...devices['Pixel 7'], browserName: 'chromium' } },
    // En escritorio, solo las que dependen del tamaño, el teclado o el ratón (las marcadas @ambos; la lista y el
    // porqué, en docs/rediseno/ESTADO.md). El resto es la misma lógica y basta con verla en el móvil
    { name: 'escritorio', grep: /@ambos/, use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: `node serve.mjs`,
    env: { PORT: String(PORT) },
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
  },
});
