import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { test, expect } from './fixtures';

test('homepage renders the profile README and a plain blog list', async ({ page }) => {
  expect((await page.goto('/'))?.status()).toBe(200);
  await expect(page).toHaveTitle('Arnav Kulkarni');
  await expect(page.locator('#about')).toContainText('CS, Economics - Boston University');
  await expect(page.locator('#about a').first()).toHaveAttribute(
    'href',
    'https://sites.bu.edu/casp/',
  );
  await expect(page.locator('#about')).toContainText('Synced README fixture.');
  await expect(page.locator('main h1, main h2, main h3')).toHaveCount(0);
  await expect(page.locator('#running, #work, .leaflet-container')).toHaveCount(0);
  await expect(page.locator('#blogs a').first()).toBeVisible();
  await expect(page.locator('#blogs ul')).toHaveCSS('list-style-type', 'none');
  await expect(page.locator('#about')).toHaveCSS('font-size', '15px');
  await expect(page.locator('#blogs a').first()).toHaveCSS('font-size', '15px');
  await expect(page.locator('footer')).toContainText('Site last updated');
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

test('footer links stay visible while scrolling without covering the final content', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('complementary')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Toggle navigation' })).toHaveCount(0);
  const footer = page.getByRole('contentinfo');
  for (const [name, href] of [
    ['GitHub', 'https://github.com/navkul'],
    ['LinkedIn', 'https://www.linkedin.com/in/arnav-a-kulkarni/'],
  ]) {
    const link = footer.getByRole('link', { name, exact: true });
    await expect(link).toHaveAttribute('href', href);
    await expect(link).toBeInViewport();
    await expect(link.locator('img')).toHaveJSProperty('complete', true);
    expect(
      await link.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth),
    ).toBeGreaterThan(0);
  }
  // Check the footer after client navigation and scrolling on both viewports.
  await page.locator('#blogs a').first().click();
  for (const fraction of [0, 0.5, 1]) {
    await page.evaluate((fraction) => {
      window.scrollTo({
        top: document.documentElement.scrollHeight * fraction,
        behavior: 'instant',
      });
    }, fraction);
    const bounds = await footer.boundingBox();
    expect(bounds).not.toBeNull();
    expect(Math.abs(bounds!.y + bounds!.height - page.viewportSize()!.height)).toBeLessThanOrEqual(
      1,
    );
    await expect(footer.getByRole('link', { name: 'GitHub', exact: true })).toBeInViewport();
  }
  const contentBottom = await page
    .locator('.blog-content')
    .evaluate((element) => element.getBoundingClientRect().bottom);
  expect(contentBottom).toBeLessThanOrEqual((await footer.boundingBox())!.y);
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
