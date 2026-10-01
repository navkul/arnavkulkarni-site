import { test, expect, type BrowserContext } from '@playwright/test';
import { CatanStore } from '../../src/lib/catan/store';
const origin = 'http://127.0.0.1:3210';

test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
});
async function post(context: BrowserContext, body: object) {
  const response = await context.request.post(`${origin}/api/catan`, {
    headers: { origin },
    data: body,
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

test('profiles upload photos, record reactions, and play them only from the owner tile across browsers', async ({
  page,
  browser,
}) => {
  await page.context().grantPermissions(['microphone'], { origin });
  await page.addInitScript(() => {
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof start>) {
      const state = window as typeof window & { soundStarts?: number };
      state.soundStarts = (state.soundStarts ?? 0) + 1;
      return Reflect.apply(start, this, args);
    };
  });
  await page.goto('/catan');
  await page.getByRole('link', { name: 'Sign in / Sign up', exact: true }).click();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByLabel('Username', { exact: true }).fill('browser-composer');
  await page.getByLabel('Display name', { exact: true }).fill('Harbor Musician');
  await page.getByLabel('Password', { exact: true }).fill('unique browser password');
  await page.locator('form').getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Harbor Musician', exact: true })).toBeVisible();
  await expect(page.getByText('@browser-composer', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Harbor Musician', exact: true })).toBeVisible();
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#287eb2';
    context.fillRect(0, 0, 32, 32);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByLabel('Choose photo', { exact: true }).setInputFiles({
    name: 'portrait.png',
    mimeType: 'image/png',
    buffer: Buffer.from(image, 'base64'),
  });
  await expect(page.getByRole('img', { name: "Harbor Musician's profile picture" })).toBeVisible();
  await page.getByLabel('Display name', { exact: true }).fill('Captain Melody');
  await page.getByRole('button', { name: 'Save name', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Captain Melody', exact: true })).toBeVisible();
  await expect(page.getByText('@browser-composer', { exact: true })).toBeVisible();
  await expect(page.locator('input[type=file]')).toHaveCount(2);
  await expect(page.locator('input[accept="audio/*"]')).toHaveCount(0);
  await page.getByRole('button', { name: /Record a sound/ }).click();
  await expect(page.getByRole('progressbar', { name: 'Recording progress' })).toBeVisible();
  await page.waitForTimeout(800); // Collect actual fake-device samples through MediaRecorder.
  await page.getByRole('button', { name: /Stop ·/ }).click();
  await page.getByLabel('Sound name', { exact: true }).fill('Victory sheep');
  await page.getByRole('combobox', { name: 'Icon', exact: true }).selectOption('🐑');
  await page.getByRole('button', { name: 'Save sound', exact: true }).click();
  await expect(page.getByText('1/10 saved · 1/3 active', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/catan/profile-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('link', { name: '← Catan', exact: true }).click();
  await page.getByLabel('Table name', { exact: true }).fill('Recorded reactions');
  await page.getByRole('button', { name: 'Start table', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '1 of 4 seats filled', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('img', { name: "Captain Melody's profile picture" })).toBeVisible();
  const code = new URL(page.url()).searchParams.get('room')!;
  const guests = [await browser.newContext(), await browser.newContext()];
  const db = new CatanStore(process.env.CATAN_TEST_DATABASE_URL!);
  try {
    for (let i = 0; i < guests.length; i++)
      await post(guests[i], { command: 'join', code, name: `Sound listener ${i}` });
    await expect(
      page.getByRole('heading', { name: '3 of 4 seats filled', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Start game', exact: true }).click();
    await expect(page.locator('[data-renderer="three"] canvas')).toBeVisible();
    const listener = await guests[0].newPage();
    await listener.addInitScript(() => {
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof start>) {
        const state = window as typeof window & { soundStarts?: number };
        state.soundStarts = (state.soundStarts ?? 0) + 1;
        return Reflect.apply(start, this, args);
      };
    });
    await listener.goto(`${origin}/catan?room=${code}`);
    await expect(listener.locator('[data-renderer="three"] canvas')).toBeVisible();
    for (const screen of [page, listener]) {
      await expect(
        screen.getByRole('button', { name: 'Your table sounds', exact: true }),
      ).toHaveCount(1);
      await screen.getByRole('button', { name: 'Your table sounds', exact: true }).click();
      if (screen === listener) {
        await expect(
          screen.getByRole('button', { name: 'Play Victory sheep to the table', exact: true }),
        ).toHaveCount(0);
        await screen.getByRole('button', { name: 'Close sounds', exact: true }).click();
      }
    }
    const before = (await db.room(code)).revision;
    await page
      .getByRole('button', { name: 'Play Victory sheep to the table', exact: true })
      .click();
    for (const screen of [page, listener]) {
      await expect(
        screen.getByRole('status', { name: 'Captain Melody: Victory sheep', exact: true }),
      ).toBeVisible();
      await expect
        .poll(() =>
          screen.evaluate(
            () => (window as typeof window & { soundStarts?: number }).soundStarts ?? 0,
          ),
        )
        .toBe(1);
    }
    expect((await db.room(code)).revision).toBe(before);
    await listener.getByRole('button', { name: 'Your table sounds', exact: true }).click();
    await listener.getByRole('switch', { name: '♪ Table sounds on', exact: true }).click();
    await listener.getByRole('button', { name: 'Close sounds', exact: true }).click();
    await page.getByRole('button', { name: 'Your table sounds', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Play Victory sheep to the table', exact: true }),
    ).toBeEnabled({ timeout: 8000 });
    await page
      .getByRole('button', { name: 'Play Victory sheep to the table', exact: true })
      .click();
    await expect
      .poll(() =>
        page.evaluate(() => (window as typeof window & { soundStarts?: number }).soundStarts ?? 0),
      )
      .toBe(2);
    await expect(
      listener.getByRole('status', { name: 'Captain Melody: Victory sheep', exact: true }),
    ).toBeVisible();
    expect(
      await listener.evaluate(
        () => (window as typeof window & { soundStarts?: number }).soundStarts ?? 0,
      ),
    ).toBe(1);
    const state = await db.room(code);
    expect(state.soundEvents).toHaveLength(2);
    await page.screenshot({ path: 'test-results/catan/profile-sound-game.png', fullPage: true });
  } finally {
    await db.close();
    for (const guest of guests) await guest.close();
  }
});
