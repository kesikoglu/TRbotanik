import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

/**
 * Bu konteynerde Chromium önceden kurulu (PLAYWRIGHT_BROWSERS_PATH) ancak sürümü
 * @playwright/test'in beklediğinden farklı olabilir. Varsa doğrudan onu kullanırız;
 * yoksa Playwright kendi indirdiği tarayıcıya düşer (geliştirici makinesi).
 */
const PREINSTALLED_CHROMIUM = '/opt/pw-browsers/chromium';
const executablePath = existsSync(PREINSTALLED_CHROMIUM) ? PREINSTALLED_CHROMIUM : undefined;

/**
 * E2E yapılandırması.
 *
 * `VITE_DATA_MODE=fixture` ve `VITE_BASEMAP=offline` zorlanır: testler hiçbir dış
 * hosta istek yapmaz, bu yüzden ağsız ortamda da deterministik çalışır.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1600, height: 950 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          ...(executablePath ? { executablePath } : {}),
          // MapLibre WebGL gerektirir; başsız Chromium'da yazılım rasterleştirme şart
          args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
        },
      },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview -w @trbotanik/web -- --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
    env: {
      VITE_DATA_MODE: 'fixture',
      VITE_BASEMAP: 'offline',
    },
  },
});
