import { test, expect } from './fixtures';

test('GitHub outage keeps the intro and blogs available', async ({ page }) => {
  expect((await page.goto('/'))?.status()).toBe(200);
  await expect(page.locator('#about')).toContainText('CS, Economics - Boston University');
  await expect(page.locator('#about')).toContainText('Real-time ML systems - Prev 2x. SWE intern');
  await expect(page.locator('#about')).not.toContainText('Synced README fixture.');
  await expect(page.locator('#running')).toHaveCount(0);
  await page.locator('#blogs a').first().click();
  await expect(page.locator('.blog-content')).not.toBeEmpty();
});
