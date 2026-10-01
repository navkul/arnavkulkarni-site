import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CatanStore, controlledSeat, type Identity, type Room } from '../../src/lib/catan/store.ts';
import { roomView } from '../../src/lib/catan/view.ts';
import { testingAvailable } from '../../src/lib/catan/testing-mode.ts';
import { policy, seededRandom } from '../../src/lib/catan/simulation.ts';
import { DICE_DURATION_MS } from '../../src/lib/catan/motion-timing.ts';
import { cardCount, emptyCards, type Action } from '../../src/lib/catan/types.ts';
import { conserve } from './helpers.ts';

async function sandbox(t: TestContext, run: (store: CatanStore, dir: string) => Promise<void>) {
  const previous = { NODE_ENV: process.env.NODE_ENV, VERCEL: process.env.VERCEL };
  Object.assign(process.env, { NODE_ENV: 'development' });
  delete process.env.VERCEL;
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  const dir = mkdtempSync(join(tmpdir(), 'catan-testing-'));
  const store = new CatanStore(join(dir, 'test.sqlite'), 'local');
  try {
    await run(store, dir);
  } finally {
    await store.close();
    rmSync(dir, { recursive: true, force: true });
    for (const key of ['NODE_ENV', 'VERCEL'] as const) {
      if (previous[key] === undefined) delete process.env[key];
      else Object.assign(process.env, { [key]: previous[key] });
    }
  }
}

async function opening(
  t: TestContext,
  store: CatanStore,
  host: Identity,
  initial: Room,
  guests = new Map<string, Identity>(),
) {
  let room = initial;
  const originalOrder = room.seats.map((seat) => seat.id);
  for (let attempts = 0; room.status === 'starting' && attempts < 200; attempts++) {
    const next = room.opening!.contenders.find(
      (id) =>
        !room.opening!.rolls.some(
          (roll) => roll.round === room.opening!.round && roll.playerId === id,
        ),
    )!;
    assert.equal(controlledSeat(room, host)!.id, guests.has(next) ? room.host : next);
    t.mock.timers.setTime(room.opening!.readyAt);
    room = (await store.change(guests.get(next) ?? host, room.code, room.revision, 'roll-order'))!;
    assert.equal(room.opening!.rolls.at(-1)!.playerId, next);
  }
  assert.equal(room.status, 'playing');
  const first = originalOrder.indexOf(room.opening!.winner!);
  assert.deepEqual(
    room.seats.map((seat) => seat.id),
    [...originalOrder.slice(first), ...originalOrder.slice(0, first)],
  );
  assert.deepEqual(
    room.game!.players.map((player) => player.id),
    room.seats.map((seat) => seat.id),
  );
  assert.equal(room.game!.phase, 'setup-settlement');
  assert.equal(room.game!.board.vertices.filter((vertex) => vertex.building).length, 0);
  t.mock.timers.setTime(room.opening!.readyAt);
  return room;
}

function placement(room: Room, identity: Identity): Action {
  const view = roomView(room, identity);
  assert.equal(view.me, room.game!.active);
  return room.game!.phase === 'setup-settlement'
    ? { type: 'settlement', vertex: view.legal!.settlements[0] }
    : { type: 'road', edge: view.legal!.roads[0] };
}

for (const playerCount of [3, 6])
  test(`local test lobby adds ${playerCount} players and follows normal opening, snake setup and turns`, async (t) =>
    sandbox(t, async (store) => {
      const host = (await store.session()).identity;
      const stranger = (await store.session()).identity;
      let room = await store.createTestRoom(host, 'Solo preview', 3, 'You');
      assert.equal(room.seats.length, 1);
      assert.equal(room.status, 'lobby');
      assert.equal(room.game, undefined);
      assert.equal(room.testPlayer, 0);
      assert.equal(room.hosting, 'local');
      assert.equal(room.winProbability, false);
      await assert.rejects(store.change(host, room.code, room.revision, 'start'), /3–4 players/);
      for (let index = 1; index < playerCount; index++) {
        const revision = room.revision;
        room = await store.addTestPlayer(host, room.code, revision);
        assert.equal(room.revision, revision + 1);
        assert.equal(room.testPlayer, index);
        assert.equal(room.seats[index].simulated, true);
        assert.ok(!room.seats[index].colorLocked);
        assert.equal(room.capacity, Math.max(3, index + 1));
        assert.equal(room.status, 'lobby');
        assert.equal(roomView(room, host).seats[index].me, true);
      }
      assert.equal(new Set(room.seats.map((seat) => seat.color)).size, playerCount);
      if (playerCount === 6)
        await assert.rejects(store.addTestPlayer(host, room.code, room.revision), /six players/);
      await assert.rejects(
        store.selectTestPlayer(stranger, room.code, room.revision, 1),
        /Only the test host/,
      );
      await assert.rejects(
        store.selectTestPlayer(host, room.code, room.revision, playerCount),
        /Choose a test player/,
      );
      const selectedId = room.seats[playerCount - 1].id;
      room = await store.chooseColor(
        host,
        room.code,
        room.revision,
        room.seats[playerCount - 1].color,
        true,
      );
      assert.equal(room.seats.find((seat) => seat.id === selectedId)!.colorLocked, true);
      assert.ok(!room.seats.find((seat) => seat.id === room.host)!.colorLocked);
      const colors = new Map(room.seats.map((seat) => [seat.id, seat.color]));
      room = (await store.change(host, room.code, room.revision, 'start'))!;
      assert.equal(room.status, 'starting');
      await assert.rejects(store.addTestPlayer(host, room.code, room.revision), /before starting/);
      await assert.rejects(store.change(host, room.code, room.revision, 'roll-order'), /settle/);
      room = await opening(t, store, host, room);
      for (const seat of room.seats) assert.equal(seat.color, colors.get(seat.id));
      const placementOrder: number[] = [];
      while (room.game!.phase.startsWith('setup')) {
        const action = placement(room, host);
        if (action.type === 'settlement') placementOrder.push(room.game!.active);
        room = (await store.change(host, room.code, room.revision, 'action', action))!;
      }
      assert.deepEqual(placementOrder, [
        ...Array.from({ length: playerCount }, (_, i) => i),
        ...Array.from({ length: playerCount }, (_, i) => playerCount - i - 1),
      ]);
      assert.equal(room.game!.phase, 'roll');
      assert.equal(
        room.game!.board.vertices.filter((vertex) => vertex.building).length,
        playerCount * 2,
      );
      assert.deepEqual(conserve(room.game!), Array(5).fill(playerCount > 4 ? 24 : 19));
      assert.ok(room.game!.players.every((player) => cardCount(player.resources) <= 3));
      assert.equal(roomView(room, stranger).game, undefined);
      const random = seededRandom(42);
      const firstTurn = room.game!.turn;
      for (let moves = 0; moves < 100 && room.game!.turn === firstTurn; moves++) {
        const next = policy(room.game!, random);
        assert.equal(roomView(room, host).me, next.player);
        if (room.diceEvent)
          t.mock.timers.setTime(Math.max(Date.now(), room.diceEvent.at + DICE_DURATION_MS));
        room = (await store.change(host, room.code, room.revision, 'action', next.action))!;
      }
      assert.ok(room.game!.turn > firstTurn);
      assert.equal(roomView(room, host).me, room.game!.active);
      assert.equal((await store.query('SELECT * FROM results')).length, 0);
      assert.equal((await store.query('SELECT * FROM jobs')).length, 0);
    }));

test('one test table is shared locally; only its host can alter or delete it with the current revision', async (t) =>
  sandbox(t, async (store) => {
    const host = (await store.session()).identity;
    const stranger = (await store.session()).identity;
    const ordinary = await store.createRoom(stranger, 'Ordinary table', 3, 'Guest', false);
    let room = await store.createTestRoom(host, 'Singleton', 3, 'Host');
    const repeated = await store.createTestRoom(host, 'Ignored new name', 6, 'New name');
    assert.equal(repeated.code, room.code);
    assert.equal(repeated.name, 'Singleton');
    assert.equal(repeated.revision, room.revision);
    await assert.rejects(store.createTestRoom(stranger, 'Another', 3, 'Other'), /already exists/);
    await assert.rejects(
      store.addTestPlayer(stranger, room.code, room.revision),
      /Only the test host/,
    );
    await assert.rejects(
      store.deleteTestRoom(stranger, room.code, room.revision),
      /Only the test host/,
    );
    await assert.rejects(
      store.change(host, room.code, room.revision, 'leave'),
      /Delete test table/,
    );
    const oldRevision = room.revision;
    room = await store.addTestPlayer(host, room.code, room.revision);
    await assert.rejects(store.addTestPlayer(host, room.code, oldRevision), /changed/);
    await assert.rejects(store.deleteTestRoom(host, room.code, oldRevision), /changed/);
    await store.deleteTestRoom(host, room.code, room.revision);
    await assert.rejects(store.room(room.code), /not found/);
    assert.equal((await store.room(ordinary.code)).name, 'Ordinary table');
    const replacement = await store.createTestRoom(stranger, 'Replacement', 3, 'Other');
    assert.equal(replacement.seats.length, 1);
    assert.equal((await store.rooms()).filter((entry) => entry.testing).length, 1);
  }));

test('real guests keep their seats, opening rolls, colors and private hands inside a test table', async (t) =>
  sandbox(t, async (store) => {
    const host = (await store.session()).identity;
    const guest = (await store.session()).identity;
    let room = await store.createTestRoom(host, 'Mixed table', 3, 'Host');
    room = await store.join(guest, room.code, 'Real guest');
    const guestId = room.seats[1].id;
    room = await store.addTestPlayer(host, room.code, room.revision);
    assert.equal(roomView(room, host).seats[1].controllable, false);
    await assert.rejects(store.selectTestPlayer(host, room.code, room.revision, 1), /own seat/);
    await assert.rejects(
      store.selectTestPlayer(guest, room.code, room.revision, 0),
      /Only the test host/,
    );
    room = await store.chooseColor(guest, room.code, room.revision, 4, true);
    assert.equal(room.seats[1].color, 4);
    assert.equal(room.testPlayer, 2);
    room = (await store.change(host, room.code, room.revision, 'start'))!;
    room = await opening(t, store, host, room, new Map([[guestId, guest]]));
    let guestMoves = 0;
    while (room.game!.phase.startsWith('setup')) {
      const actor = room.game!.players[room.game!.active].id === guestId ? guest : host;
      const action = placement(room, actor);
      if (actor === guest) {
        guestMoves++;
        assert.equal(controlledSeat(room, host)!.id, room.host);
        await assert.rejects(
          store.change(host, room.code, room.revision, 'action', action),
          /Wait for your turn/,
        );
      }
      room = (await store.change(actor, room.code, room.revision, 'action', action))!;
    }
    assert.equal(guestMoves, 4);
    const realPlayer = room.game!.players.find((player) => player.id === guestId)!;
    realPlayer.resources = { ...emptyCards(), wood: 6 };
    realPlayer.development = [{ kind: 'victory', boughtTurn: 0 }];
    await store.query('UPDATE rooms SET state=? WHERE code=?', JSON.stringify(room), room.code);
    const realIndex = room.seats.findIndex((seat) => seat.id === guestId);
    await assert.rejects(
      store.selectTestPlayer(host, room.code, room.revision, realIndex),
      /own seat/,
    );
    for (const [index, seat] of room.seats.entries()) {
      if (seat.id === guestId) continue;
      room = await store.selectTestPlayer(host, room.code, room.revision, index);
      const view = roomView(room, host);
      assert.equal(view.game!.hand!.development.length, 0);
      assert.equal(view.game!.players[realIndex].developmentCount, 1);
      assert.equal(view.game!.players[realIndex].resourcesCount, 6);
    }
    assert.deepEqual(roomView(room, guest).game!.hand!.development, realPlayer.development);
  }));

test('a real guest leaving cannot move the test host selection onto another real player', async (t) =>
  sandbox(t, async (store) => {
    const host = (await store.session()).identity;
    const firstGuest = (await store.session()).identity;
    const secondGuest = (await store.session()).identity;
    let room = await store.createTestRoom(host, 'Changing seats', 4, 'Host');
    room = await store.join(firstGuest, room.code, 'First guest');
    room = await store.addTestPlayer(host, room.code, room.revision);
    const simulatedId = room.seats[2].id;
    room = await store.join(secondGuest, room.code, 'Second guest');
    const realId = room.seats[3].id;
    assert.equal(controlledSeat(room, host)!.id, simulatedId);
    room = (await store.change(firstGuest, room.code, room.revision, 'leave'))!;
    assert.notEqual(controlledSeat(room, host)!.id, realId);
    assert.equal(controlledSeat(room, host)!.id, simulatedId);
    room = await store.chooseColor(
      host,
      room.code,
      room.revision,
      controlledSeat(room, host)!.color,
      true,
    );
    assert.ok(!room.seats.find((seat) => seat.id === realId)!.colorLocked);
  }));

test('every test control is rejected in production, Vercel and server-hosted storage', async (t) =>
  sandbox(t, async (store) => {
    const host = (await store.session()).identity;
    let room = await store.createTestRoom(host, 'Local only', 3, 'Host');
    room = await store.addTestPlayer(host, room.code, room.revision);
    for (const environment of [
      { NODE_ENV: 'production', VERCEL: undefined },
      { NODE_ENV: 'development', VERCEL: '1' },
    ]) {
      Object.assign(process.env, { NODE_ENV: environment.NODE_ENV });
      if (environment.VERCEL) process.env.VERCEL = environment.VERCEL;
      else delete process.env.VERCEL;
      assert.equal(testingAvailable(), false);
      assert.equal(roomView(room, host).testing, false);
      assert.equal(controlledSeat(room, host)!.id, room.host);
      await assert.rejects(store.createTestRoom(host, 'Blocked', 3, 'Host'), /local development/);
      await assert.rejects(
        store.addTestPlayer(host, room.code, room.revision),
        /local development/,
      );
      await assert.rejects(
        store.selectTestPlayer(host, room.code, room.revision, 0),
        /local development/,
      );
      await assert.rejects(
        store.deleteTestRoom(host, room.code, room.revision),
        /local development/,
      );
      await assert.rejects(
        store.change(host, room.code, room.revision, 'start'),
        /local development/,
      );
    }
    Object.assign(process.env, { NODE_ENV: 'development' });
    delete process.env.VERCEL;
    // The hosting guard must reject before any database access; no Postgres connection is needed.
    const serverStore = Object.create(CatanStore.prototype) as CatanStore;
    Object.defineProperty(serverStore, 'hosting', { value: 'server' });
    await assert.rejects(
      serverStore.createTestRoom(host, 'Blocked', 3, 'Host'),
      /local development/,
    );
  }));
