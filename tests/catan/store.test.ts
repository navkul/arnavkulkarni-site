import assert from 'node:assert/strict';
import test from 'node:test';
import { CatanStore, type Identity, type Room } from '../../src/lib/catan/store.ts';
import { roomView } from '../../src/lib/catan/view.ts';
import { emptyCards } from '../../src/lib/catan/types.ts';
import { parseAction } from '../../src/lib/catan/input.ts';
import { evaluate, policy, seededRandom } from '../../src/lib/catan/simulation.ts';
import { applyAction, score } from '../../src/lib/catan/engine.ts';
import { conserve, setup } from './helpers.ts';

const testUrl = process.env.CATAN_TEST_DATABASE_URL;
if (!testUrl || !new URL(testUrl).pathname.endsWith('/catan_test'))
  throw new Error('CATAN_TEST_DATABASE_URL must point to the isolated catan_test database.');
async function freshStore() {
  const store = new CatanStore(testUrl!);
  await store.query(
    'TRUNCATE catan.profiles,catan.sessions,catan.rooms,catan.results,catan.odds_history,catan.limits,catan.jobs CASCADE',
  );
  return store;
}

async function lobby(store: CatanStore, n = 3) {
  const sessions = await Promise.all(Array.from({ length: n }, () => store.session()));
  let room = await store.createRoom(sessions[0].identity, 'Friday night', n > 4 ? 6 : 4, 'Host');
  for (let i = 1; i < n; i++)
    room = await store.join(sessions[i].identity, room.code, `Guest ${i}`);
  return { room, sessions };
}
async function completeFixture(store: CatanStore, room: Room, identity: Identity) {
  // Put a real room one legal city purchase from victory; the service must record it.
  const g = room.game!;
  const player = g.players.findIndex(
    (p) => p.id === room.seats.find((s) => s.guestId === identity.guestId)!.id,
  );
  g.phase = 'trade';
  g.active = player;
  g.turn = 20;
  const sites = [0, 6, 12, 18, 24];
  sites.forEach(
    (v, i) => (g.board.vertices[v].building = { player, kind: i < 4 ? 'city' : 'settlement' }),
  );
  // Replace a city with a settlement to leave a legal city piece available. Add a VP: total 9.
  g.board.vertices[18].building!.kind = 'settlement';
  g.players[player].development = [{ kind: 'victory', boughtTurn: 1 }];
  g.players[player].resources = { ...emptyCards(), ore: 3, wheat: 2 };
  assert.equal(score(g, player), 9);
  await store.query('UPDATE rooms SET state=? WHERE code=?', JSON.stringify(room), room.code);
  return (await store.change(identity, room.code, room.revision, 'action', {
    type: 'city',
    vertex: 18,
  }))!;
}
test('lobby membership, capacity, host permission, revision checks and departure', async () => {
  const s = await freshStore();
  try {
    const { room, sessions } = await lobby(s, 4);
    await assert.rejects(
      async () => await s.join((await s.session()).identity, room.code, 'Extra'),
      /full/,
    );
    await assert.rejects(
      async () => await s.change(sessions[1].identity, room.code, room.revision, 'start'),
      /host/,
    );
    await assert.rejects(
      async () => await s.change(sessions[0].identity, room.code, 0, 'start'),
      /changed/,
    );
    const left = (await s.change(sessions[0].identity, room.code, room.revision, 'leave'))!;
    assert.equal(left.host, left.seats[0].id);
    const started = (await s.change(sessions[1].identity, room.code, left.revision, 'start'))!;
    assert.equal(started.status, 'playing');
    await assert.rejects(
      async () => await s.change(sessions[1].identity, room.code, started.revision, 'leave'),
      /before/,
    );
    await assert.rejects(
      async () => await s.change(sessions[1].identity, room.code, started.revision, 'pause'),
      /profile/,
    );
  } finally {
    await s.close();
  }
});
test('extended lobbies require five players and support all six seats', async () => {
  const s = await freshStore();
  try {
    const host = (await s.session()).identity;
    let room = await s.createRoom(host, 'Big island', 6, 'Host');
    for (let i = 1; i < 4; i++)
      room = await s.join((await s.session()).identity, room.code, `Player ${i}`);
    await assert.rejects(
      async () => await s.change(host, room.code, room.revision, 'start'),
      /5–6/,
    );
    for (let i = 4; i < 6; i++)
      room = await s.join((await s.session()).identity, room.code, `Player ${i}`);
    room = (await s.change(host, room.code, room.revision, 'start'))!;
    assert.equal(room.game!.board.hexes.length, 30);
  } finally {
    await s.close();
  }
});
test('projections expose only the requester’s hand, never credentials, deck order or identities', async () => {
  const s = await freshStore();
  try {
    const { room: lobbyRoom, sessions } = await lobby(s);
    const room = (await s.change(
      sessions[0].identity,
      lobbyRoom.code,
      lobbyRoom.revision,
      'start',
    ))!;
    room.game!.players.forEach((p, i) => {
      p.resources.ore = i + 1;
      p.development = [{ kind: 'victory', boughtTurn: 0 }];
    });
    sessions.forEach((session) => {
      const view = roomView(room, session.identity);
      assert.equal(view.game!.hand!.resources.ore, view.me + 1);
      assert.ok(view.game!.players.every((p) => !('resources' in p) && !('development' in p)));
      assert.ok(!('deck' in view.game!));
      const serialized = JSON.stringify(view);
      room.seats.forEach((seat) => {
        assert.ok(!serialized.includes(seat.guestId));
        assert.ok(!serialized.includes(seat.id));
      });
      assert.ok(!serialized.includes(session.identity.sessionHash));
      assert.equal(view.game!.players[(view.me + 1) % 3].points, 0);
    });
    assert.equal(roomView(room, (await s.session()).identity).game, undefined);
  } finally {
    await s.close();
  }
});
test('registration after first finish claims only own result; anonymous opponents remain unlinked', async () => {
  const s = await freshStore();
  try {
    const { room: l, sessions } = await lobby(s);
    const host = sessions[0].identity;
    await assert.rejects(s.register(host, 'Alice', 'correct horse battery'), /first game/);
    let room = (await s.change(host, l.code, l.revision, 'start'))!;
    room = await completeFixture(s, room, host);
    assert.equal(room.status, 'finished');
    assert.equal((await s.leaderboard()).totals.games, 1);
    assert.equal((await s.leaderboard()).anonymous.appearances, 3);
    assert.equal((await s.leaderboard()).rows.length, 0);
    await assert.rejects(
      async () => await s.change(host, room.code, room.revision, 'action', { type: 'end' }),
      /not active/,
    );
    const secret = await s.register(host, 'Alice', 'correct horse battery');
    const alice = (await s.session(secret)).identity;
    assert.equal(alice.name, 'Alice');
    assert.notEqual((await s.session(sessions[0].secret)).identity.guestId, host.guestId);
    assert.equal((await s.leaderboard()).rows[0].wins, 1);
    assert.equal((await s.leaderboard()).anonymous.appearances, 2);
    assert.equal((await s.profile(alice)).history[0].opponents.length, 2);
    assert.ok((await s.profile(alice)).history[0].opponents.every((p) => p.name === 'Anonymous'));
    assert.equal((await s.profile(alice)).games, 1);
    assert.ok(
      !JSON.stringify(await s.query('SELECT * FROM profiles')).includes('correct horse battery'),
    );
    await assert.rejects(s.login(sessions[1].identity, 'Alice', 'wrong password'), /Incorrect/);
    const fresh = (await s.session()).identity;
    const login = await s.login(fresh, 'aLiCe', 'correct horse battery');
    assert.equal((await s.session(login)).identity.profileId, alice.profileId);
    const loggedOut = await s.logout(alice);
    assert.equal((await s.session(loggedOut)).identity.profileId, undefined);
    assert.equal(
      roomView(await s.room(room.code), (await s.session(loggedOut)).identity).game,
      undefined,
    );
    await assert.rejects(
      s.register(sessions[1].identity, 'alice', 'another long password'),
      /taken/,
    );
  } finally {
    await s.close();
  }
});
test('Postgres survives independent connections, profile login restores paused game, stale moves cannot overwrite', async () => {
  let s = await freshStore();
  try {
    const { room: l, sessions } = await lobby(s);
    let host = sessions[0].identity;
    const first = (await s.change(host, l.code, l.revision, 'start'))!;
    await completeFixture(s, first, host);
    host = (await s.session(await s.register(host, 'Persistent', 'persistent password'))).identity;
    let room = await s.createRoom(host, 'Saved game', 4, 'Unused');
    room = await s.join(sessions[1].identity, room.code, 'Guest one');
    room = await s.join(sessions[2].identity, room.code, 'Guest two');
    room = (await s.change(host, room.code, room.revision, 'start'))!;
    room = (await s.change(host, room.code, room.revision, 'pause'))!;
    const code = room.code,
      snapshot = JSON.stringify(room.game);
    await assert.rejects(
      async () => await s.change(host, code, room.revision, 'action', { type: 'roll' }),
      /not active/,
    );
    await s.close();
    s = new CatanStore(testUrl!);
    host = (
      await s.session(
        await s.login((await s.session()).identity, 'Persistent', 'persistent password'),
      )
    ).identity;
    assert.equal((await s.room(code)).status, 'paused');
    assert.equal(JSON.stringify((await s.room(code)).game), snapshot);
    const restored = (await s.change(host, code, room.revision, 'resume'))!;
    assert.equal(restored.status, 'playing');
    assert.equal(JSON.stringify(restored.game), snapshot);
    await assert.rejects(async () => await s.change(host, code, room.revision, 'pause'), /changed/);
    assert.equal((await s.profile(host)).wins, 1);
  } finally {
    await s.close();
  }
});
test('stored rate limits reject bursts and malformed actions fail before engine entry', async () => {
  const s = await freshStore();
  try {
    await s.rateLimit('test', 1);
    await assert.rejects(async () => await s.rateLimit('test', 1), /Too many/);
  } finally {
    await s.close();
  }
  for (const value of [
    null,
    [],
    {},
    { type: 'road', edge: -1 },
    { type: 'development', card: 'plenty', resources: ['gold'] },
    { type: 'endless' },
  ])
    assert.throws(() => parseAction(value));
  assert.deepEqual(parseAction({ type: 'road', edge: 1 }), { type: 'road', edge: 1 });
});
for (const n of [3, 4, 5, 6])
  test(`full ${n}-player simulated game reaches a legal winner and conserves resources`, async () => {
    let g = setup(n, 172);
    const random = seededRandom(73);
    for (let step = 0; step < 2500 && g.winner === undefined; step++) {
      const { player, action } = policy(g, random);
      g = applyAction(g, player, action, random);
      assert.deepEqual(conserve(g), Array(5).fill(n > 4 ? 24 : 19));
      assert.ok(g.players.every((p) => Object.values(p.resources).every((n) => n >= 0)));
    }
    assert.notEqual(g.winner, undefined);
    assert.ok(score(g, g.winner!) >= 10);
  });
test('server evaluation is deterministic, normalized, revisioned and leaves source untouched', async () => {
  const game = setup(),
    original = structuredClone(game);
  const odds = await evaluate(game, 4, undefined, { samples: 4, maxActions: 100 });
  const repeat = await evaluate(game, 4, undefined, { samples: 4, maxActions: 100 });
  assert.deepEqual(odds, repeat);
  assert.deepEqual(game, original);
  assert.ok(Math.abs(odds.probabilities.reduce((a, b) => a + b, 0) - 100) < 0.001);
  assert.equal(odds.revision, 4);
  assert.equal(odds.samples, 4);
  game.winner = 1;
  const finished = await evaluate(game, 5, odds);
  assert.deepEqual(finished.probabilities, [0, 100, 0]);
  assert.equal(finished.delta[1], 100 - odds.probabilities[1]);
});

test('independent servers cannot overfill rooms or commit the same revision twice', async () => {
  const first = await freshStore();
  const second = new CatanStore(testUrl!);
  try {
    const { room, sessions } = await lobby(first);
    const [a, b] = await Promise.all([first.session(), second.session()]);
    const joins = await Promise.allSettled([
      first.join(a.identity, room.code, 'Fourth A'),
      second.join(b.identity, room.code, 'Fourth B'),
    ]);
    assert.equal(joins.filter((r) => r.status === 'fulfilled').length, 1);
    const filled = await second.room(room.code);
    assert.equal(filled.seats.length, 4);
    const starts = await Promise.allSettled([
      first.change(sessions[0].identity, room.code, filled.revision, 'start'),
      second.change(sessions[0].identity, room.code, filled.revision, 'start'),
    ]);
    assert.equal(starts.filter((r) => r.status === 'fulfilled').length, 1);
    const started = await first.room(room.code);
    assert.equal(started.revision, filled.revision + 1);
    assert.ok(await second.job(room.code, started.revision));
    const rates = await Promise.allSettled([
      first.rateLimit('race', 1),
      second.rateLimit('race', 1),
    ]);
    assert.equal(rates.filter((r) => r.status === 'fulfilled').length, 1);
  } finally {
    await first.close();
    await second.close();
  }
});

test('durable snapshots survive reconnect, publish retries and out-of-order duplicate results', async () => {
  let store = await freshStore();
  try {
    const { room, sessions } = await lobby(store);
    const started = (await store.change(sessions[0].identity, room.code, room.revision, 'start'))!;
    const firstRevision = started.revision;
    const actor = sessions.find(
      (s) => roomView(started, s.identity).me === started.game!.active,
    )!.identity;
    const action = policy(started.game!, seededRandom(1)).action;
    const moved = (await store.change(actor, room.code, firstRevision, 'action', action))!;
    await store.close();
    store = new CatanStore(testUrl!);
    assert.deepEqual(
      await store.job(room.code, firstRevision),
      JSON.parse(JSON.stringify(started.game)),
    );
    assert.deepEqual(
      await store.job(room.code, moved.revision),
      JSON.parse(JSON.stringify(moved.game)),
    );
    assert.equal((await store.pendingJobs(room.code)).length, 2);
    assert.equal((await store.pendingJobs(room.code)).length, 0);
    await store.retryJob(room.code, firstRevision);
    assert.equal((await store.pendingJobs(room.code)).length, 1);
    const base = { samples: 8, completed: 8, model: 'test', delta: [0, 0, 0] };
    const later = { ...base, revision: moved.revision, probabilities: [20, 30, 50] };
    await store.saveOdds(room.code, later);
    await store.saveOdds(room.code, {
      ...base,
      revision: firstRevision,
      probabilities: [40, 30, 30],
    });
    await store.saveOdds(room.code, { ...later, probabilities: [90, 5, 5] });
    const history = await store.oddsHistory(room.code);
    assert.equal(history.length, 2);
    assert.deepEqual(history[1].delta, [-20, 0, 20]);
    assert.deepEqual((await store.room(room.code)).odds, history[1]);
    assert.equal(await store.job(room.code, firstRevision), undefined);
    assert.equal((await store.pendingJobs(room.code)).length, 0);
  } finally {
    await store.close();
  }
});
