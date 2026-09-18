import { defineConfig, devices } from '@playwright/test';

const mode = process.env.E2E_STRAVA_MODE ?? 'available';
if (!['available', 'unavailable'].includes(mode)) {
  throw new Error(`Unknown Strava test mode: ${mode}`);
}

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: mode === 'available' ? 'site.spec.ts' : 'unavailable.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 30_000,
  outputDir: `test-results/${mode}`,
  reporter: [['list'], ['html', { outputFolder: `playwright-report/${mode}`, open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'node tests/start-server.mjs',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
