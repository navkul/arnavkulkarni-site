import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';
process.env.CATAN_DATABASE_PATH = resolve('.data/catan-e2e.sqlite');
export default defineConfig({
  testDir: './tests/catan-browser',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  outputDir: 'test-results/catan',
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3210',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node tests/start-catan-server.mjs',
    url: 'http://127.0.0.1:3210/catan',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
