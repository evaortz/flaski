// Capturas de la app para la presentación de bienvenida (img/onboarding). Se regeneran con:
//   npm run capturas
// No es una prueba: abre la app en modo local, prepara cada pantalla y la fotografía en claro y oscuro.
import { defineConfig } from '@playwright/test';

const PORT = 8124;

export default defineConfig({
  testDir: '.',
  testMatch: ['capturas.spec.js', 'novedades.spec.js'],
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    serviceWorkers: 'block',
    viewport: { width: 390, height: 760 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  },
  webServer: { command: 'node serve.mjs', env: { PORT: String(PORT) }, url: `http://localhost:${PORT}`, reuseExistingServer: true },
});
