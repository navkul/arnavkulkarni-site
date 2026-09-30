import { CatanStore } from '../../src/lib/catan/store';
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
const origin = 'http://127.0.0.1:3210';
async function post(context: BrowserContext, body: object) {
  const res = await context.request.post(`${origin}/api/catan`, {
    headers: { origin },
    data: body,
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  return res.json();
}
async function current(context: BrowserContext, code: string) {
  const res = await context.request.get(`${origin}/api/catan?room=${code}`);
  expect(res.ok()).toBeTruthy();
  return (await res.json()).room;
}
async function makeTable(page: Page, name: string, capacity = 4) {
  await page.goto('/catan');
  await page.getByLabel('Your name at the table').fill(name);
  await page.getByLabel('Island size').selectOption(String(capacity));
  await page.getByRole('button', { name: 'Create a table' }).click();
  await expect(page.getByRole('heading', { name: '1 of' })).toBeVisible();
  return new URL(page.url()).searchParams.get('room')!;
}
test('three independent browsers join, synchronize setup, protect hands and reconnect', async ({
  browser,
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const code = await makeTable(page, 'Browser host');
  const contexts = [page.context(), await browser.newContext(), await browser.newContext()];
  try {
    for (let i = 1; i < 3; i++) {
      const guest = await contexts[i].newPage();
      await guest.goto(`${origin}/catan?room=${code}`);
      await guest.getByLabel('Your name at the table').fill(`Browser guest ${i}`);
      await guest.getByRole('button', { name: 'Take a seat' }).click();
      await expect(guest.getByRole('button', { name: 'Leave table' })).toBeVisible();
    }
    await expect(page.getByRole('heading', { name: '3 of 4 seats filled' })).toBeVisible();
    await page.getByRole('button', { name: 'Start game', exact: true }).click();
    await expect(page.getByLabel('Catan island board')).toBeVisible();
    for (let step = 0; step < 12; step++) {
      const views = await Promise.all(contexts.map((c) => current(c, code)));
      const index = views.findIndex((v) => v.me === v.game.active),
        view = views[index];
      const actorPage = contexts[index].pages()[0];
      await expect(actorPage.getByLabel('Or choose a board location')).toBeVisible();
      const id =
        view.game.phase === 'setup-settlement' ? view.legal.settlements[0] : view.legal.roads[0];
      await actorPage.getByLabel('Or choose a board location').selectOption(String(id));
      await expect
        .poll(async () => (await current(contexts[index], code)).revision)
        .toBeGreaterThan(view.revision);
    }
    const views = await Promise.all(contexts.map((c) => current(c, code)));
    expect(views[0].game.phase).toBe('roll');
    expect(
      views.every((v) =>
        v.game.players.every((p: object) => !('resources' in p) && !('development' in p)),
      ),
    ).toBeTruthy();
    expect(views[0].game.deck).toBeUndefined();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Your hand' })).toBeVisible();
    const active = views.findIndex((v) => v.me === v.game.active);
    const activePage = contexts[active].pages()[0];
    await expect(activePage.getByRole('button', { name: 'Roll dice', exact: true })).toBeEnabled();
    await activePage.getByRole('button', { name: 'Roll dice', exact: true }).click();
    await expect
      .poll(async () => (await current(contexts[active], code)).game.phase)
      .not.toBe('roll');
    await expect
      .poll(async () => (await current(contexts[0], code)).odds?.probabilities?.length, {
        timeout: 60_000,
      })
      .toBe(3);
    const outsider = await browser.newContext();
    expect((await outsider.request.get(`${origin}/api/catan?room=${code}`)).status()).toBe(403);
    await outsider.close();
    expect(errors).toEqual([]);
    await page.screenshot({ path: 'test-results/catan/desktop-game.png', fullPage: true });
  } finally {
    for (const context of contexts.slice(1)) await context.close();
  }
});
test('six-player room enforces membership, size, origin and revision', async ({
  browser,
  page,
}) => {
  const code = await makeTable(page, 'Extended host', 6);
  const contexts = [page.context()];
  try {
    for (let i = 1; i < 6; i++) {
      const context = await browser.newContext();
      contexts.push(context);
      await post(context, { command: 'join', code, name: `Extended guest ${i}` });
    }
    let room = await current(contexts[0], code);
    const rejected = await contexts[0].request.post(`${origin}/api/catan`, {
      headers: { origin: 'https://other.example' },
      data: { command: 'start', code, revision: room.revision },
    });
    expect(rejected.status()).toBe(403);
    const stale = await contexts[0].request.post(`${origin}/api/catan`, {
      headers: { origin },
      data: { command: 'start', code, revision: 0 },
    });
    expect(stale.status()).toBe(409);
    room = (await post(contexts[0], { command: 'start', code, revision: room.revision })).room;
    expect(room.game.board.hexes).toHaveLength(30);
    expect(room.game.players).toHaveLength(6);
    const forbidden = await contexts[1].request.post(`${origin}/api/catan`, {
      headers: { origin },
      data: { command: 'pause', code, revision: room.revision },
    });
    expect(forbidden.status()).toBe(403);
  } finally {
    for (const context of contexts.slice(1)) await context.close();
  }
});
test('phone lobby and stats layout stay within viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/catan');
  await expect(page.getByRole('heading', { name: 'Good company.' })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
  await page.screenshot({ path: 'test-results/catan/mobile-lobby.png', fullPage: true });
  await page.getByRole('button', { name: 'Leaderboard', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Bragging rights.' })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
  await page.getByRole('button', { name: 'My stats', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Every game tells a story.' })).toBeVisible();
});

test('a completed game becomes a profile, anonymous stats stay anonymous, and login restores a paused seat', async ({
  browser,
  page,
}) => {
  const code = await makeTable(page, 'Future profile');
  const guestOne = await browser.newContext(),
    guestTwo = await browser.newContext();
  try {
    await post(guestOne, { command: 'join', code, name: 'Private Guest Name One' });
    await post(guestTwo, { command: 'join', code, name: 'Private Guest Name Two' });
    let view = await current(page.context(), code);
    view = (await post(page.context(), { command: 'start', code, revision: view.revision })).room;
    // Test-owned Postgres fixture: one real legal city action from victory. No debug API is shipped.
    const db = new CatanStore(process.env.CATAN_TEST_DATABASE_URL!);
    try {
      await db.transaction(async () => {
        const room = await db.room(code);
        const g = room.game!,
          p = view.me;
        g.phase = 'trade';
        g.active = p;
        g.turn = 20;
        [0, 6, 12, 18, 24].forEach(
          (v, i) =>
            (g.board.vertices[v].building = { player: p, kind: i < 3 ? 'city' : 'settlement' }),
        );
        g.players[p].development = [{ kind: 'victory', boughtTurn: 1 }];
        g.players[p].resources = { wood: 0, brick: 0, sheep: 0, wheat: 2, ore: 3 };
        g.bank.wheat -= 2;
        g.bank.ore -= 3;
        room.revision++;
        await db.query('UPDATE rooms SET state=? WHERE code=?', JSON.stringify(room), code);
      });
    } finally {
      await db.close();
    }
    await page.reload();
    await page.getByRole('button', { name: 'Upgrade city', exact: true }).click();
    await page.getByLabel('Or choose a board location').selectOption('18');
    await expect(page.getByRole('heading', { name: 'The game is in the books.' })).toBeVisible();
    await page.getByRole('button', { name: 'Create profile & keep my stats' }).click();
    await page.getByLabel('Profile name').fill('Browser Champion');
    await page.getByLabel('Password', { exact: true }).fill('browser test password');
    await page.getByRole('button', { name: 'Create profile & save stats' }).click();
    await expect(page.getByRole('button', { name: 'Browser Champion', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'My stats', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Browser Champion’s playbook.' })).toBeVisible();
    await expect(page.getByText('Victory · 10 points', { exact: false })).toBeVisible();
    const history = await page.context().request.get(`${origin}/api/catan?profile`);
    expect(JSON.stringify(await history.json())).not.toContain('Private Guest Name');
    await page.getByRole('button', { name: 'Leaderboard', exact: true }).click();
    await expect(page.getByRole('cell', { name: '100%' })).toBeVisible();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.getByRole('button', { name: 'Back to tables', exact: true }).click();
    await page.getByRole('button', { name: 'Create a table' }).click();
    await expect(page.getByRole('heading', { name: '1 of 4 seats filled' })).toBeVisible();
    const savedCode = new URL(page.url()).searchParams.get('room')!;
    await post(guestOne, { command: 'join', code: savedCode, name: 'Guest one' });
    await post(guestTwo, { command: 'join', code: savedCode, name: 'Guest two' });
    await expect(page.getByRole('button', { name: 'Start game', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Start game', exact: true }).click();
    await page.getByRole('button', { name: 'Pause & save' }).click();
    await expect(
      page.getByRole('heading', { name: 'Game paused. Your island is saved.' }),
    ).toBeVisible();
    const returning = await browser.newContext();
    try {
      const returnPage = await returning.newPage();
      await returnPage.goto(`${origin}/catan`);
      await returnPage.getByRole('button', { name: 'Sign in', exact: true }).click();
      await returnPage.getByLabel('Profile name').fill('Browser Champion');
      await returnPage.getByLabel('Password', { exact: true }).fill('browser test password');
      await returnPage
        .locator('form')
        .filter({ has: returnPage.getByLabel('Password', { exact: true }) })
        .getByRole('button', { name: 'Sign in', exact: true })
        .click();
      await expect(
        returnPage.getByRole('button', { name: 'Browser Champion', exact: true }),
      ).toBeVisible();
      await returnPage.goto(`${origin}/catan?room=${savedCode}`);
      await returnPage.getByRole('button', { name: 'Resume game', exact: true }).click();
      await expect.poll(async () => (await current(returning, savedCode)).status).toBe('playing');
      await returnPage.setViewportSize({ width: 390, height: 844 });
      expect(
        await returnPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBeTruthy();
      await returnPage.screenshot({ path: 'test-results/catan/mobile-game.png', fullPage: true });
    } finally {
      await returning.close();
    }
  } finally {
    await guestOne.close();
    await guestTwo.close();
  }
});
