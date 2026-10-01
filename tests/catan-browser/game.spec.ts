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
  await page.getByLabel('Your name', { exact: true }).fill(name);
  await page.getByLabel('Table name', { exact: true }).fill('Browser table');
  await page.getByText('Settings', { exact: true }).click();
  await page.getByRole('slider', { name: 'Players', exact: true }).fill(String(capacity));
  await page.getByRole('button', { name: 'Start table', exact: true }).click();
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
  await expect(page.getByRole('heading', { name: 'Catan', exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
  await page.screenshot({ path: 'test-results/catan/mobile-lobby.png', fullPage: true });
  await page.getByRole('heading', { name: 'Leaderboard', exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('heading', { name: 'Leaderboard', exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
  await page.getByText('Settings', { exact: true }).click();
  await page.getByRole('button', { name: 'About self-host' }).focus();
  await expect(page.getByRole('tooltip').filter({ hasText: 'Host on a computer' })).toBeVisible();
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
    await page.getByRole('button', { name: 'Browser Champion', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Browser Champion’s stats' })).toBeVisible();
    await expect(page.getByText('Victory · 10 points', { exact: false })).toBeVisible();
    const history = await page.context().request.get(`${origin}/api/catan?profile`);
    expect(JSON.stringify(await history.json())).not.toContain('Private Guest Name');
    await page.getByRole('button', { name: 'Back to tables', exact: false }).click();
    await page.getByRole('heading', { name: 'Leaderboard', exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('cell', { name: '100%' })).toBeVisible();

    await page.getByLabel('Table name', { exact: true }).fill('Saved table');
    await page.getByRole('button', { name: 'Start table', exact: true }).click();
    await expect(page.getByRole('heading', { name: '1 of 4 seats filled' })).toBeVisible();
    const savedCode = new URL(page.url()).searchParams.get('room')!;
    await post(guestOne, { command: 'join', code: savedCode, name: 'Guest one' });
    await post(guestTwo, { command: 'join', code: savedCode, name: 'Guest two' });
    await expect(page.getByRole('button', { name: 'Start game', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Start game', exact: true }).click();
    await page.getByRole('button', { name: 'Pause & save' }).click();
    await expect(page.getByRole('heading', { name: 'Game paused', exact: true })).toBeVisible();
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

test('local mode discovers tables and plays with all external browser requests blocked', async ({
  browser,
  page,
}) => {
  const external: string[] = [];
  const contexts = [page.context(), await browser.newContext(), await browser.newContext()];
  for (const context of contexts)
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.origin === origin) return route.continue();
      external.push(url.origin);
      return route.abort();
    });
  try {
    await page.goto('/catan?hosting=local');
    await page.getByLabel('Table name', { exact: true }).fill('Offline browser');
    await page.getByLabel('Your name', { exact: true }).fill('Local host');
    await page.getByText('Settings', { exact: true }).click();
    await expect(page.getByRole('switch', { name: 'Self-host', exact: true })).toBeChecked();
    await page.getByRole('slider', { name: 'Players', exact: true }).fill('3');
    await page.getByRole('switch', { name: 'Player win probability', exact: true }).uncheck();
    await page.getByRole('button', { name: 'Start table', exact: true }).click();
    await expect(page.getByRole('heading', { name: '1 of 3 seats filled' })).toBeVisible();
    const code = new URL(page.url()).searchParams.get('room')!;
    expect(new URL(page.url()).searchParams.get('hosting')).toBe('local');
    for (let i = 1; i < 3; i++) {
      const guest = await contexts[i].newPage();
      await guest.goto(`${origin}/catan?hosting=local`);
      await guest.getByRole('button', { name: 'Find local tables' }).click();
      await guest.getByRole('button').filter({ hasText: 'Offline browser' }).click();
      await guest.getByLabel('Your name at the table').fill(`Local guest ${i}`);
      await guest.getByRole('button', { name: 'Take a seat' }).click();
    }
    await expect(page.getByRole('heading', { name: '3 of 3 seats filled' })).toBeVisible();
    await page.getByRole('button', { name: 'Start game', exact: true }).click();
    await expect(page.getByLabel('Catan island board')).toBeVisible();
    const views = await Promise.all(
      contexts.map(
        async (c) =>
          (await (await c.request.get(`${origin}/api/catan?hosting=local&room=${code}`)).json())
            .room,
      ),
    );
    const index = views.findIndex((v) => v.me === v.game.active);
    const actor = contexts[index].pages()[0];
    await actor
      .getByLabel('Or choose a board location')
      .selectOption(String(views[index].legal.settlements[0]));
    await expect
      .poll(
        async () =>
          (
            await (
              await contexts[0].request.get(`${origin}/api/catan?hosting=local&room=${code}`)
            ).json()
          ).room.game.phase,
      )
      .toBe('setup-road');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Your hand' })).toBeVisible();
    const state = (
      await (await contexts[0].request.get(`${origin}/api/catan?hosting=local&room=${code}`)).json()
    ).room;
    expect(state.hosting).toBe('local');
    expect(state.winProbability).toBe(false);
    expect(state.odds).toBeUndefined();
    await expect(page.getByLabel('Win probability history, from 0 to 100 percent')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Pause & save' })).toBeVisible();
    expect(external).toEqual([]);
    const leaderboard = await contexts[0].request.get(
      `${origin}/api/catan?hosting=local&leaderboard`,
    );
    expect((await leaderboard.json()).totals.games).toBe(0);
  } finally {
    for (const context of contexts.slice(1)) await context.close();
  }
});

test('switching hosting mode preserves separate guest sessions and table settings', async ({
  page,
}) => {
  await page.goto('/catan');
  await page.getByLabel('Table name', { exact: true }).fill('Online settings');
  await page.getByLabel('Your name', { exact: true }).fill('Dual mode host');
  await page.getByText('Settings', { exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Self-host', exact: true })).not.toBeChecked();
  await page.getByRole('slider', { name: 'Players', exact: true }).fill('5');
  await page.getByRole('switch', { name: 'Player win probability', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Start table', exact: true }).click();
  await expect(page.getByRole('heading', { name: '1 of 5 seats filled' })).toBeVisible();
  const code = new URL(page.url()).searchParams.get('room')!;
  const online = await current(page.context(), code);
  expect(online.hosting).toBe('server');
  expect(online.winProbability).toBe(false);
  await page.getByRole('button', { name: 'All tables', exact: false }).click();
  await page.getByText('Settings', { exact: true }).click();
  await page.getByRole('switch', { name: 'Self-host', exact: true }).check();
  await expect(page.getByText('Local · unranked', { exact: true })).toBeVisible();
  await page.getByRole('switch', { name: 'Self-host', exact: true }).uncheck();
  await expect(page.getByRole('button').filter({ hasText: 'Online settings' })).toBeVisible();
  expect((await current(page.context(), code)).joined).toBe(true);
  const cookies = await page.context().cookies();
  expect(cookies.some((c) => c.name === 'catan_session')).toBe(true);
  expect(cookies.some((c) => c.name === 'catan_local_session')).toBe(true);
});

test('illustrated cards, table-wide trades and host end-game controls synchronize across players', async ({
  browser,
  page,
}) => {
  const code = await makeTable(page, 'Leo');
  const guests = [await browser.newContext(), await browser.newContext()];
  try {
    for (let i = 0; i < 2; i++)
      await post(guests[i], { command: 'join', code, name: `Player ${i + 1}` });
    const lobby = await current(page.context(), code);
    await post(page.context(), { command: 'start', code, revision: lobby.revision });
    const hostView = await current(page.context(), code);
    const db = new CatanStore(process.env.CATAN_TEST_DATABASE_URL!);
    try {
      const room = await db.room(code),
        g = room.game!,
        p = hostView.me;
      g.phase = 'trade';
      g.active = p;
      g.primary = p;
      g.turn = 10;
      g.dice = [4, 5];
      for (const player of g.players)
        player.resources = { wood: 3, brick: 2, sheep: 3, wheat: 3, ore: 3 };
      g.players[p].development = [
        { kind: 'plenty', boughtTurn: 1 },
        { kind: 'knight', boughtTurn: 1 },
        { kind: 'roads', boughtTurn: 1 },
        { kind: 'monopoly', boughtTurn: 1 },
        { kind: 'victory', boughtTurn: 1 },
      ];
      room.revision++;
      await db.query('UPDATE rooms SET state=? WHERE code=?', JSON.stringify(room), code);
    } finally {
      await db.close();
    }
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Leo’s turn' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Dice: 4 and 5' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Draw development card' })).toBeEnabled();
    const deckBefore = (await current(page.context(), code)).game.deckCount;
    await page.getByRole('button', { name: 'Draw development card' }).click();
    await expect
      .poll(async () => (await current(page.context(), code)).game.deckCount)
      .toBe(deckBefore - 1);
    await page.getByText('Play a development card', { exact: true }).click();
    await page.getByRole('combobox', { name: 'Card', exact: true }).selectOption('plenty');
    await page.getByRole('button', { name: 'Play card', exact: true }).click();
    await expect
      .poll(
        async () =>
          (await current(page.context(), code)).game.players[hostView.me].playedDevelopment.length,
      )
      .toBe(1);
    const guestPage = await guests[0].newPage();
    await guestPage.goto(`${origin}/catan?room=${code}`);
    const leo = guestPage.getByLabel('Leo, taking their turn', { exact: true });
    await leo.getByText('Played cards · 1', { exact: true }).click();
    await expect(leo.getByText('Year of plenty', { exact: false })).toBeVisible();
    const publicPlayer = (await current(guests[0], code)).game.players[hostView.me];
    expect(publicPlayer.development).toBeUndefined();
    expect(publicPlayer.playedDevelopment).toEqual([{ kind: 'plenty', turn: 10 }]);
    await page.getByText('Offer a trade', { exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Trade with', exact: true })).toHaveValue(
      'all',
    );
    await page
      .getByRole('group', { name: 'You give', exact: true })
      .getByLabel('wood', { exact: true })
      .fill('1');
    await page
      .getByRole('group', { name: 'You receive', exact: true })
      .getByLabel('ore', { exact: true })
      .fill('1');
    await page.getByRole('button', { name: 'Send trade offer' }).click();
    await expect(guestPage.getByRole('button', { name: 'Accept trade' })).toBeEnabled();
    await guestPage.getByRole('button', { name: 'Accept trade' }).click();
    await expect.poll(async () => (await current(page.context(), code)).game.offer).toBeUndefined();
    await expect(page.getByRole('button', { name: 'End turn', exact: true })).toBeVisible();
    await page.screenshot({ path: 'test-results/catan/illustrated-game.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await page.screenshot({ path: 'test-results/catan/illustrated-mobile.png', fullPage: true });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(
      await page
        .locator('.ct-die')
        .first()
        .evaluate((el) => getComputedStyle(el).animationName),
    ).toBe('none');
    await expect(guestPage.getByRole('button', { name: 'End game', exact: true })).toHaveCount(0);
    const before = await current(guests[0], code);
    const denied = await guests[0].request.post(`${origin}/api/catan`, {
      headers: { origin },
      data: { command: 'end-game', code, revision: before.revision },
    });
    expect(denied.status()).toBe(403);
    await page.getByRole('button', { name: 'End game', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Keep playing' }).click();
    expect((await current(page.context(), code)).status).toBe('playing');
    await page.getByRole('button', { name: 'End game', exact: true }).click();
    await page.getByRole('button', { name: 'End game for everyone' }).click();
    await expect(page.getByRole('heading', { name: 'Game ended', exact: true })).toBeVisible();
    await expect(guestPage.getByRole('heading', { name: 'Game ended', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Draw development card' })).toBeDisabled();
    const check = new CatanStore(process.env.CATAN_TEST_DATABASE_URL!);
    try {
      expect(await check.query('SELECT * FROM results WHERE room=?', code)).toEqual([]);
    } finally {
      await check.close();
    }
  } finally {
    for (const guest of guests) await guest.close();
  }
});
