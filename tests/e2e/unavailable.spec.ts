import { test, expect } from './fixtures';

test('Strava outage keeps the site usable and shows an honest fallback', async ({ page }) => {
  expect((await page.goto('/'))?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'About', exact: true })).toBeVisible();
  await expect(page.getByText('Strava did not return recent runs for this build.')).toBeVisible();
  await expect(page.getByText(/Synced from Strava/)).toHaveCount(0);
  await expect(page.locator('.leaflet-container')).toHaveCount(0);
  await page.locator('#blogs a').first().click();
  await expect(page.locator('.blog-content')).not.toBeEmpty();
});
