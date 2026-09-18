import { test as base, expect } from '@playwright/test';

export const test = base.extend<{ expected404: boolean; browserHealth: void }>({
  expected404: [false, { option: true }],
  browserHealth: [
    async ({ page, expected404 }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() !== 'error') return;
        if (expected404 && message.text().includes('404')) return;
        errors.push(message.text());
      });
      page.on('requestfailed', (request) => {
        const failure = request.failure()?.errorText ?? '';
        if (!failure.includes('ERR_ABORTED')) errors.push(`${request.url()}: ${failure}`);
      });
      page.on('response', (response) => {
        if (response.status() < 400) return;
        if (expected404 && response.status() === 404 && response.request().isNavigationRequest())
          return;
        errors.push(`${response.status()} ${response.url()}`);
      });
      // Verify Leaflet and route geometry without depending on the external tile CDN.
      await page.route('https://*.basemaps.cartocdn.com/**', (route) =>
        route.fulfill({
          contentType: 'image/png',
          body: Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
            'base64',
          ),
        }),
      );
      await use();
      expect(errors, 'Unexpected browser errors or failed requests').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
