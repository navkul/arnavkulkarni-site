import { defineConfig, devices } from '@playwright/test';
if (
  !process.env.CATAN_TEST_DATABASE_URL ||
  !new URL(process.env.CATAN_TEST_DATABASE_URL).pathname.endsWith('/catan_test')
)
  throw new Error('Set CATAN_TEST_DATABASE_URL to the isolated catan_test database.');
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
    command: 'node --experimental-strip-types tests/start-catan-server.mjs',
    url: 'http://127.0.0.1:3210/catan',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
