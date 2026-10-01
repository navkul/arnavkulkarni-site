import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CatanStore, type Room } from '../../src/lib/catan/store.ts';
import {
  beginOpening,
  rollOpening,
  recordVisuals,
  DICE_DURATION_MS,
} from '../../src/lib/catan/table-flow.ts';
import { roomView } from '../../src/lib/catan/view.ts';
import { createBoard } from '../../src/lib/catan/board.ts';
import { newGame, seeded, finishOpening } from './helpers.ts';
import {
  DICE_LEAD_MS,
  OPENING_COUNTDOWN_MS,
  OPENING_REVEAL_MS,
} from '../../src/lib/catan/motion-timing.ts';

function openingRoom(): Room {
  const game = newGame();
  game.players.forEach((p, i) => {
    p.color = [4, 1, 5][i];
  });
  return {
    code: 'ABC234',
    name: 'Opening',
    capacity: 3,
    host: game.players[0].id,
    seats: game.players.map((p, i) => ({
      id: p.id,
      name: p.name,
      guestId: `guest-${i}`,
      color: p.color,
    })),
    game,
    status: 'lobby',
    revision: 0,
    createdAt: 0,
    updatedAt: 0,
  };
}
test('opening countdown, authorized clockwise rolls, tied highest rerolls and stable colors', () => {
  const room = openingRoom();
  beginOpening(room, 1000);
  assert.equal(room.opening!.revealAt, 1000 + OPENING_COUNTDOWN_MS);
  assert.equal(room.opening!.readyAt, room.opening!.revealAt + OPENING_REVEAL_MS);
  assert.throws(() => rollOpening(room, 'seat-0', () => 0, room.opening!.readyAt - 1), /settle/);
  assert.throws(
    () => rollOpening(room, 'seat-1', () => 0, room.opening!.readyAt),
    /your opening roll/,
  );
  const roll = (id: string, die: number) =>
    rollOpening(room, id, () => (die - 1) / 6, room.opening!.readyAt);
  const firstRollAt = room.opening!.readyAt;
  roll('seat-0', 6);
  assert.equal(room.diceEvent!.color, 4);
  assert.equal(room.opening!.readyAt, room.diceEvent!.at + DICE_DURATION_MS);
  assert.equal(room.opening!.readyAt, firstRollAt + DICE_LEAD_MS + DICE_DURATION_MS);
  assert.throws(() => rollOpening(room, 'seat-1', () => 0, room.opening!.readyAt - 1), /settle/);
  roll('seat-1', 2);
  roll('seat-2', 6);
  assert.equal(room.status, 'starting');
  assert.deepEqual(room.opening!.contenders, ['seat-0', 'seat-2']);
  assert.equal(room.opening!.round, 2);
  roll('seat-0', 3);
  roll('seat-2', 5);
  assert.equal(room.status, 'playing');
  assert.equal(room.opening!.winner, 'seat-2');
  assert.deepEqual(
    room.seats.map((s) => s.id),
    ['seat-2', 'seat-0', 'seat-1'],
  );
  assert.deepEqual(
    room.game!.players.map((p) => p.color),
    [5, 4, 1],
  );
  assert.equal(room.game!.active, 0);
  assert.throws(() => roll('seat-1', 6), /complete/);
});
test('shared dice and award events retain the server result and only announce a new owner', () => {
  const room = openingRoom();
  const before = structuredClone(room.game!);
  room.game!.dice = [2, 5];
  room.game!.largestArmy = 2;
  recordVisuals(room, before, 'seat-1', { type: 'roll' }, 5000);
  assert.deepEqual(room.diceEvent!.values, [2, 5]);
  assert.equal(room.diceEvent!.color, 1);
  assert.equal(room.awardEvents!.length, 1);
  assert.equal(room.awardEvents![0].playerId, 'seat-2');
  recordVisuals(room, structuredClone(room.game!), 'seat-1', { type: 'end' }, 5100);
  assert.equal(room.awardEvents!.length, 1);
  const views = room.seats.map((seat) =>
    roomView(room, { guestId: seat.guestId, sessionHash: '' }),
  );
  assert.deepEqual(views[0].diceEvent, views[1].diceEvent);
  assert.deepEqual(views[0].awardEvents, views[2].awardEvents);
  assert.ok(!JSON.stringify(views[0]).includes('guest-1'));
});
test('unique color locks persist; any guest may request pause but every player must consent', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'catan-flow-'));
  const store = new CatanStore(join(dir, 'game.sqlite'), 'local');
  try {
    const identities = await Promise.all(
      Array.from({ length: 3 }, async () => (await store.session()).identity),
    );
    const outsider = (await store.session()).identity;
    let room = await store.createRoom(identities[0], 'Colors and consent', 3, 'Host', false);
    for (let i = 1; i < 3; i++) room = await store.join(identities[i], room.code, `Guest ${i}`);
    await assert.rejects(store.chooseColor(outsider, room.code, room.revision, 4, false), /before/);
    await assert.rejects(
      store.chooseColor(identities[0], room.code, room.revision, 1, false),
      /taken/,
    );
    const choices = await Promise.allSettled([
      store.chooseColor(identities[0], room.code, room.revision, 5, true),
      store.chooseColor(identities[1], room.code, room.revision, 5, true),
    ]);
    assert.equal(choices.filter((c) => c.status === 'fulfilled').length, 1);
    room = await store.room(room.code);
    assert.equal(room.seats[0].color, 5);
    await assert.rejects(
      store.chooseColor(identities[0], room.code, room.revision, 4, false),
      /Unlock/,
    );
    room = await store.chooseColor(identities[0], room.code, room.revision, 5, false);
    room = await store.chooseColor(identities[0], room.code, room.revision, 4, true);
    room = (await store.change(identities[0], room.code, room.revision, 'start'))!;
    await assert.rejects(
      store.change(identities[0], room.code, room.revision, 'action', {
        type: 'settlement',
        vertex: 0,
      }),
      /not active/,
    );
    await assert.rejects(
      store.chooseColor(identities[0], room.code, room.revision, 5, true),
      /before/,
    );
    room = await finishOpening(store, room);
    assert.equal(room.game!.players.find((p) => p.name === 'Host')!.color, 4);
    room = (await store.change(identities[1], room.code, room.revision, 'pause'))!;
    assert.equal(room.status, 'playing');
    assert.equal(roomView(room, identities[0]).pauseRequest!.agreed, false);
    await assert.rejects(store.change(outsider, room.code, room.revision, 'approve-pause'), /seat/);
    await assert.rejects(
      store.change(identities[1], room.code, room.revision, 'approve-pause'),
      /already/,
    );
    room = (await store.change(identities[0], room.code, room.revision, 'decline-pause'))!;
    assert.equal(room.pauseRequest, undefined);
    room = (await store.change(identities[2], room.code, room.revision, 'pause'))!;
    room = (await store.change(identities[0], room.code, room.revision, 'approve-pause'))!;
    assert.equal(room.status, 'playing');
    assert.equal((await store.room(room.code)).pauseRequest!.votes.length, 2);
    room = (await store.change(identities[1], room.code, room.revision, 'approve-pause'))!;
    assert.equal(room.status, 'paused');
    assert.equal(room.pauseRequest, undefined);
    room = (await store.change(identities[2], room.code, room.revision, 'resume'))!;
    assert.equal(room.status, 'playing');
    room = (await store.change(identities[0], room.code, room.revision, 'pause'))!;
    const requestId = room.pauseRequest!.id;
    const oldRevision = room.revision;
    const votes = await Promise.allSettled(
      identities
        .slice(1)
        .map((identity) =>
          store.change(identity, room.code, oldRevision, 'approve-pause', undefined, requestId),
        ),
    );
    assert.equal(votes.filter((vote) => vote.status === 'fulfilled').length, 2);
    room = await store.room(room.code);
    assert.equal(room.status, 'paused');
    room = (await store.change(identities[0], room.code, room.revision, 'resume'))!;
    room = (await store.change(identities[0], room.code, room.revision, 'pause'))!;
    await assert.rejects(
      store.change(identities[1], room.code, room.revision, 'approve-pause', undefined, requestId),
      /changed/,
    );
    assert.equal((await store.room(room.code)).pauseRequest!.votes.length, 1);
  } finally {
    await store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test('official token sequences and ports retain complete, nonoverlapping land endpoints', () => {
  for (const extended of [false, true])
    for (let seed = 0; seed < 300; seed++) {
      const board = createBoard(extended, seeded(seed));
      assert.deepEqual(
        board.tokenOrder!.map((id) => board.hexes[id].number),
        extended
          ? [
              2, 5, 4, 6, 3, 9, 8, 11, 11, 10, 6, 3, 8, 4, 8, 10, 11, 12, 10, 5, 4, 9, 5, 9, 12, 3,
              2, 6,
            ]
          : [5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11],
      );
      assert.equal(new Set(board.tokenOrder).size, extended ? 28 : 18);
      const endpoints = new Set<number>();
      for (const port of board.ports!) {
        const edge = board.edges[port.edge];
        assert.equal(edge.hexes.length, 1);
        for (const id of [edge.a, edge.b]) {
          assert.ok(!endpoints.has(id));
          endpoints.add(id);
          assert.equal(board.vertices[id].port, port.resource);
          assert.ok(board.vertices[id].hexes.length > 0);
        }
      }
      assert.equal(board.ports!.length, extended ? 11 : 9);
    }
});
