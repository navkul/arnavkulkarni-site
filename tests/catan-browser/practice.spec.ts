import { test, expect } from '@playwright/test';

test('TESTING opens a deployed private board and supports the normal six-seat setup', async ({
  page,
  browser,
}) => {
  const origin = 'http://127.0.0.1:3210';
  await page.goto('/catan');
  await page.getByRole('button', { name: 'Skip island intro' }).click();
  await page.getByRole('textbox', { name: 'Table code', exact: true }).fill('TESTING');
  await page.getByRole('button', { name: 'Join table', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'View / control player' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Roll dice', exact: true })).toBeVisible();
  const code = new URL(page.url()).searchParams.get('room')!;
  expect(code).toMatch(/^[A-Z2-9]{6}$/);
  await page.getByRole('button', { name: 'Roll dice', exact: true }).click();
  await expect
    .poll(async () => {
      const response = await page.request.get(`/api/catan?room=${code}`);
      return (await response.json()).room.game.dice;
    })
    .toHaveLength(2);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Restart setup', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(
    page.getByRole('button', { name: 'Delete test table', exact: true }),
  ).toBeInViewport();
  await page.screenshot({ path: 'test-results/catan/mobile-practice.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  const stranger = await browser.newContext();
  try {
    const denied = await stranger.request.get(`${origin}/api/catan?room=${code}`);
    expect(denied.status()).toBe(403);
    const lobby = await stranger.request.get(`${origin}/api/catan`);
    expect((await lobby.json()).rooms.some((room: { code: string }) => room.code === code)).toBe(
      false,
    );
    const own = await stranger.request.post(`${origin}/api/catan`, {
      headers: { origin },
      data: { command: 'open-practice' },
    });
    expect(own.ok()).toBe(true);
    const other = (await own.json()).room;
    expect(other.code).not.toBe(code);
    await stranger.request.post(`${origin}/api/catan`, {
      headers: { origin },
      data: { command: 'delete-test', code: other.code, revision: other.revision },
    });
  } finally {
    await stranger.close();
  }
  await page.getByRole('button', { name: 'Restart setup', exact: true }).click();
  for (let count = 1; count < 6; count++)
    await page.getByRole('button', { name: `Add player (${count}/6)`, exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add player (6/6)', exact: true })).toBeDisabled();
  await expect(page.getByText('6 of 6 seats filled', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete test table', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Start a table' })).toBeVisible();
  await page.goto('/catan?room=TESTING');
  await expect(page.getByRole('button', { name: 'Restart setup', exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('room')).not.toBe(code);
  await page.getByRole('button', { name: 'Delete test table', exact: true }).click();
});
