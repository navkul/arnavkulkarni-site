import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CatanStore, type Identity, type Room } from '../../src/lib/catan/store.ts';
import { roomView } from '../../src/lib/catan/view.ts';
import { emptyCards } from '../../src/lib/catan/types.ts';
import { parseAction } from '../../src/lib/catan/input.ts';
import { evaluate, policy, seededRandom } from '../../src/lib/catan/simulation.ts';
import { applyAction, score } from '../../src/lib/catan/engine.ts';
import { conserve, setup } from './helpers.ts';

function lobby(store: CatanStore, n = 3) {
  const sessions = Array.from({ length: n }, () => store.session());
  let room = store.createRoom(sessions[0].identity, 'Friday night', n > 4 ? 6 : 4, 'Host');
  for (let i = 1; i < n; i++) room = store.join(sessions[i].identity, room.code, `Guest ${i}`);
  return { room, sessions };
}
function completeFixture(store: CatanStore, room: Room, identity: Identity) {
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
  store.db.prepare('UPDATE rooms SET state=? WHERE code=?').run(JSON.stringify(room), room.code);
  return store.change(identity, room.code, room.revision, 'action', { type: 'city', vertex: 18 })!;
}
test('lobby membership, capacity, host permission, revision checks and departure', () => {
  const s = new CatanStore(':memory:');
  try {
    const { room, sessions } = lobby(s, 4);
    assert.throws(() => s.join(s.session().identity, room.code, 'Extra'), /full/);
    assert.throws(() => s.change(sessions[1].identity, room.code, room.revision, 'start'), /host/);
    assert.throws(() => s.change(sessions[0].identity, room.code, 0, 'start'), /changed/);
    const left = s.change(sessions[0].identity, room.code, room.revision, 'leave')!;
    assert.equal(left.host, left.seats[0].id);
    const started = s.change(sessions[1].identity, room.code, left.revision, 'start')!;
    assert.equal(started.status, 'playing');
    assert.throws(
      () => s.change(sessions[1].identity, room.code, started.revision, 'leave'),
      /before/,
    );
    assert.throws(
      () => s.change(sessions[1].identity, room.code, started.revision, 'pause'),
      /profile/,
    );
  } finally {
    s.db.close();
  }
});
test('extended lobbies require five players and support all six seats', () => {
  const s = new CatanStore(':memory:');
  try {
    const host = s.session().identity;
    let room = s.createRoom(host, 'Big island', 6, 'Host');
    for (let i = 1; i < 4; i++) room = s.join(s.session().identity, room.code, `Player ${i}`);
    assert.throws(() => s.change(host, room.code, room.revision, 'start'), /5–6/);
    for (let i = 4; i < 6; i++) room = s.join(s.session().identity, room.code, `Player ${i}`);
    room = s.change(host, room.code, room.revision, 'start')!;
    assert.equal(room.game!.board.hexes.length, 30);
  } finally {
    s.db.close();
  }
});
test('projections expose only the requester’s hand, never credentials, deck order or identities', () => {
  const s = new CatanStore(':memory:');
  try {
    const { room: lobbyRoom, sessions } = lobby(s);
    const room = s.change(sessions[0].identity, lobbyRoom.code, lobbyRoom.revision, 'start')!;
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
    assert.equal(roomView(room, s.session().identity).game, undefined);
  } finally {
    s.db.close();
  }
});
test('registration after first finish claims only own result; anonymous opponents remain unlinked', async () => {
  const s = new CatanStore(':memory:');
  try {
    const { room: l, sessions } = lobby(s);
    const host = sessions[0].identity;
    await assert.rejects(s.register(host, 'Alice', 'correct horse battery'), /first game/);
    let room = s.change(host, l.code, l.revision, 'start')!;
    room = completeFixture(s, room, host);
    assert.equal(room.status, 'finished');
    assert.equal(s.leaderboard().totals.games, 1);
    assert.equal(s.leaderboard().anonymous.appearances, 3);
    assert.equal(s.leaderboard().rows.length, 0);
    assert.throws(
      () => s.change(host, room.code, room.revision, 'action', { type: 'end' }),
      /not active/,
    );
    const secret = await s.register(host, 'Alice', 'correct horse battery');
    const alice = s.session(secret).identity;
    assert.equal(alice.name, 'Alice');
    assert.notEqual(s.session(sessions[0].secret).identity.guestId, host.guestId);
    assert.equal(s.leaderboard().rows[0].wins, 1);
    assert.equal(s.leaderboard().anonymous.appearances, 2);
    assert.equal(s.profile(alice).history[0].opponents.length, 2);
    assert.ok(s.profile(alice).history[0].opponents.every((p) => p.name === 'Anonymous'));
    assert.equal(s.profile(alice).games, 1);
    assert.ok(
      !JSON.stringify(s.db.prepare('SELECT * FROM profiles').all()).includes(
        'correct horse battery',
      ),
    );
    await assert.rejects(s.login(sessions[1].identity, 'Alice', 'wrong password'), /Incorrect/);
    const fresh = s.session().identity;
    const login = await s.login(fresh, 'aLiCe', 'correct horse battery');
    assert.equal(s.session(login).identity.profileId, alice.profileId);
    const loggedOut = s.logout(alice);
    assert.equal(s.session(loggedOut).identity.profileId, undefined);
    assert.equal(roomView(s.room(room.code), s.session(loggedOut).identity).game, undefined);
    await assert.rejects(
      s.register(sessions[1].identity, 'alice', 'another long password'),
      /taken/,
    );
  } finally {
    s.db.close();
  }
});
test('SQLite survives reopen, profile login restores paused game, stale moves cannot overwrite', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'catan-'));
  const path = join(dir, 'games.sqlite');
  let s = new CatanStore(path);
  try {
    const { room: l, sessions } = lobby(s);
    let host = sessions[0].identity;
    const first = s.change(host, l.code, l.revision, 'start')!;
    completeFixture(s, first, host);
    host = s.session(await s.register(host, 'Persistent', 'persistent password')).identity;
    let room = s.createRoom(host, 'Saved game', 4, 'Unused');
    room = s.join(sessions[1].identity, room.code, 'Guest one');
    room = s.join(sessions[2].identity, room.code, 'Guest two');
    room = s.change(host, room.code, room.revision, 'start')!;
    room = s.change(host, room.code, room.revision, 'pause')!;
    const code = room.code,
      snapshot = JSON.stringify(room.game);
    assert.throws(
      () => s.change(host, code, room.revision, 'action', { type: 'roll' }),
      /not active/,
    );
    s.db.close();
    s = new CatanStore(path);
    host = s.session(
      await s.login(s.session().identity, 'Persistent', 'persistent password'),
    ).identity;
    assert.equal(s.room(code).status, 'paused');
    assert.equal(JSON.stringify(s.room(code).game), snapshot);
    const restored = s.change(host, code, room.revision, 'resume')!;
    assert.equal(restored.status, 'playing');
    assert.equal(JSON.stringify(restored.game), snapshot);
    assert.throws(() => s.change(host, code, room.revision, 'pause'), /changed/);
    assert.equal(s.profile(host).wins, 1);
  } finally {
    s.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test('stored rate limits reject bursts and malformed actions fail before engine entry', () => {
  const s = new CatanStore(':memory:');
  try {
    s.rateLimit('test', 1);
    assert.throws(() => s.rateLimit('test', 1), /Too many/);
  } finally {
    s.db.close();
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
  test(`full ${n}-player simulated game reaches a legal winner and conserves resources`, () => {
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
