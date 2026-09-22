import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { test, expect } from './fixtures';

test('homepage renders content and synthetic running stats', async ({ page }) => {
  expect((await page.goto('/'))?.status()).toBe(200);
  await expect(page).toHaveTitle('Arnav Kulkarni');
  for (const section of ['About', 'Work', 'Running', 'Blogs']) {
    await expect(page.getByRole('heading', { name: section, exact: true })).toBeVisible();
  }
  await expect(page.getByText(/Synced from Strava/)).toBeVisible();
  await expect(page.getByText('Synthetic easy run for CI.')).toBeVisible();
  await expect(
    page.getByText('1 runs • 5 miles • 0.7 hours moving • 100 ft climbing'),
  ).toBeVisible();
  await expect(page.locator('footer')).toContainText('Site last updated');
});

test('both race maps render and zoom', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.leaflet-container')).toHaveCount(2);
  for (const name of ['Newport Half', 'Gloucester Half']) {
    const map = page.getByLabel(`Pace map for ${name}`);
    const route = map.locator('.leaflet-overlay-pane path').first();
    await expect(route).toHaveAttribute('d', /^M/);
    await expect(map.locator('.leaflet-tile-loaded').first()).toBeAttached();
    const tileUrl = new URL(
      (await map.locator('.leaflet-tile-loaded').first().getAttribute('src'))!,
    );
    expect(tileUrl.searchParams.get('key')).toBe('synthetic-carto-key');
    await expect(map.getByRole('link', { name: 'OpenStreetMap', exact: true })).toBeVisible();
    await expect(map.getByRole('link', { name: 'CARTO', exact: true })).toBeVisible();
    const original = await route.getAttribute('d');
    await map.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await expect.poll(() => route.getAttribute('d')).not.toBe(original);
  }
});

const published: Array<{ url: string; title: string }> = [];
const drafts: string[] = [];
for (const [folder, prefix] of [
  ['blogs', '/blogs/'],
  ['race-notes', '/running/races/'],
]) {
  for (const filename of fs.readdirSync(path.join('content', folder))) {
    if (!filename.endsWith('.md')) continue;
    const { data } = matter(fs.readFileSync(path.join('content', folder, filename), 'utf8'));
    const url = prefix + filename.slice(0, -3);
    if (data.published === false) drafts.push(url);
    else published.push({ url, title: data.title });
  }
}

for (const { url, title } of published) {
  test(`published content: ${url}`, async ({ page }) => {
    expect((await page.goto(url))?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    await expect(page.locator('.blog-content')).not.toBeEmpty();
    await expect(page).toHaveTitle(`${title} | Arnav Kulkarni`);
    await expect(page.getByRole('link', { name: '← Back', exact: true })).toBeVisible();
  });
}

test('blog index supports client navigation and return to homepage', async ({ page }) => {
  expect((await page.goto('/blogs'))?.status()).toBe(200);
  const blog = published.find(({ url }) => url.startsWith('/blogs/'))!;
  await page.evaluate(() => {
    document.documentElement.dataset.navigationCheck = 'preserved';
  });
  await page.locator(`a[href="${blog.url}"]`).click();
  await expect(page).toHaveURL(blog.url);
  await expect(page.locator('html')).toHaveAttribute('data-navigation-check', 'preserved');
  await page.getByRole('link', { name: '← Back', exact: true }).click();
  await expect(page).toHaveURL('/#blogs');
  await expect(page.locator('#blogs')).toBeVisible();
});

test('section navigation works at the current viewport', async ({ page, isMobile }) => {
  await page.goto('/');
  if (isMobile) {
    await page.getByRole('button', { name: 'Toggle navigation' }).click();
    await page.getByRole('button', { name: 'Running', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Running', exact: true })).toBeHidden();
  } else {
    await page.getByRole('link', { name: 'Running', exact: true }).click();
  }
  await expect
    .poll(() =>
      page
        .locator('#running')
        .evaluate((element) => Math.round(element.getBoundingClientRect().top)),
    )
    .toBe(80);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test.describe('missing and draft pages', () => {
  test.use({ expected404: true });
  for (const url of [
    '/does-not-exist',
    '/blogs/does-not-exist',
    '/running/races/does-not-exist',
    ...drafts,
  ]) {
    test(`404: ${url}`, async ({ page }) => {
      expect((await page.goto(url))?.status()).toBe(404);
      await expect(page.getByRole('heading', { name: '404', exact: true })).toBeVisible();
    });
  }
});
