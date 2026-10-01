import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyAction, roadSites, settlementSites } from '../../src/lib/catan/engine.ts';
import { CatanStore, type Room } from '../../src/lib/catan/store.ts';
import { recordVisuals, DICE_DURATION_MS } from '../../src/lib/catan/table-flow.ts';
import { appendVisualEvents, VISUAL_EVENT_LIMIT } from '../../src/lib/catan/visual-events.ts';
import { roomView } from '../../src/lib/catan/view.ts';
import { emptyCards, RESOURCES, type Action, type Game } from '../../src/lib/catan/types.ts';
import { PRODUCTION_HEX_MS } from '../../src/lib/catan/motion-timing.ts';
import { finishOpening, newGame, rich, seeded, setup } from './helpers.ts';

function visualRoom(game: Game = setup()): Room {
  game.players.forEach((player, index) => {
    player.id = `private-seat-secret-${index}`;
    player.color = [4, 1, 5][index];
  });
  return {
    code: 'ABC234',
    name: 'Visuals',
    capacity: 3,
    host: game.players[0].id,
    seats: game.players.map((player, index) => ({
      id: player.id,
      name: player.name,
      guestId: `private-guest-${index}`,
      color: player.color,
    })),
    game,
    status: 'playing',
    revision: 0,
    createdAt: 0,
    updatedAt: 0,
  };
}
function perform(room: Room, action: Action, player = room.game!.active, random = seeded()) {
  const before = room.game!;
  room.game = applyAction(before, player, action, random);
  recordVisuals(room, before, before.players[player].id, action, 10000 + room.revision * 5000);
  room.revision++;
  return room.visualEvents!.filter((event) => event.id.startsWith(`visual-${room.revision}-`));
}

test('animation history has stable unique IDs, bounded payloads and no private seat identities', () => {
  const room = visualRoom(rich(setup()));
  perform(room, {
    type: 'offer',
    to: 1,
    give: { ...emptyCards(), wood: 1 },
    receive: { ...emptyCards(), ore: 1 },
  });
  const first = roomView(room, { guestId: room.seats[0].guestId, sessionHash: '' }).visualEvents;
  const second = roomView(room, { guestId: room.seats[1].guestId, sessionHash: '' }).visualEvents;
  assert.deepEqual(first, second);
  assert.equal(first[0].actorId, 'seat-4');
  assert.equal(first[0].targetPlayerId, 'seat-1');
  assert.ok(!JSON.stringify(first).includes('private'));
  assert.deepEqual(roomView(room, { guestId: 'outsider', sessionHash: '' }).visualEvents, []);
  for (let index = 0; index < 100; index++) appendVisualEvents(room, [{ type: 'turn', at: index }]);
  assert.equal(room.visualEvents!.length, VISUAL_EVENT_LIMIT);
  assert.equal(new Set(room.visualEvents!.map((event) => event.id)).size, VISUAL_EVENT_LIMIT);
  const previous = JSON.stringify(room.visualEvents);
  roomView(room, { guestId: room.seats[0].guestId, sessionHash: '' });
  assert.equal(JSON.stringify(room.visualEvents), previous);
});

test('draws, discards and robber theft publish animation counts without hidden card kinds', () => {
  const room = visualRoom(rich(setup()));
  room.game!.deck = ['victory'];
  const [bought] = perform(room, { type: 'buy-development' });
  assert.deepEqual(Object.keys(bought).sort(), [
    'actorId',
    'at',
    'count',
    'id',
    'resources',
    'type',
  ]);
  assert.equal(bought.count, 1);
  assert.deepEqual(bought.resources, { sheep: 1, wheat: 1, ore: 1 });
  room.game!.phase = 'discard';
  room.game!.discard = { 0: 2 };
  const [discarded] = perform(room, { type: 'discard', cards: { ...emptyCards(), wood: 2 } });
  assert.deepEqual(Object.keys(discarded).sort(), ['actorId', 'at', 'count', 'id', 'type']);
  assert.equal(discarded.count, 2);
  const hex = room.game!.board.hexes.find(
    (tile) =>
      tile.id !== room.game!.board.robber &&
      tile.vertices.some((vertex) => room.game!.board.vertices[vertex].building?.player === 1),
  )!;
  room.game!.players[1].resources = { ...emptyCards(), ore: 2 };
  const stolen = perform(room, { type: 'robber', hex: hex.id, victim: 1 }).find(
    (event) => event.type === 'steal',
  )!;
  assert.deepEqual(Object.keys(stolen).sort(), [
    'actorId',
    'at',
    'count',
    'id',
    'targetPlayerId',
    'type',
  ]);
  assert.equal(stolen.count, 1);
  assert.equal(stolen.targetPlayerId, room.game!.players[1].id);
});

test('production reflects actual payouts per recipient and starts after synchronized dice settle', () => {
  const room = visualRoom();
  const tile = room.game!.board.hexes.find(
    (hex) =>
      hex.resource !== 'desert' &&
      hex.id !== room.game!.board.robber &&
      hex.vertices.some((vertex) => room.game!.board.vertices[vertex].building),
  )!;
  const firstDie = Math.min(6, tile.number - 1);
  const dice = [firstDie, tile.number - firstDie];
  let rollIndex = 0;
  const before = structuredClone(room.game!);
  const events = perform(room, { type: 'roll' }, 0, () => (dice[rollIndex++] - 1) / 6);
  const production = events.filter((event) => event.type === 'production');
  assert.ok(production.length > 0);
  const visited = [...new Set(production.map((event) => event.hex!))];
  assert.deepEqual(
    visited,
    [...visited].sort((a, b) => a - b),
  );
  const received = gameReceived(room.game!);
  for (const event of production) {
    const player = room.game!.players.findIndex((p) => p.id === event.actorId);
    assert.equal(
      event.at,
      room.diceEvent!.at + DICE_DURATION_MS + visited.indexOf(event.hex!) * PRODUCTION_HEX_MS,
    );
    assert.deepEqual(event.hexes, [event.hex]);
    for (const [resource, count] of Object.entries(event.resources!)) {
      const key = resource as keyof typeof before.bank;
      received[player][key] += count;
    }
    assert.ok(event.hexes!.every((hex) => room.game!.board.hexes[hex].number === tile.number));
  }
  room.game!.players.forEach((player, index) =>
    RESOURCES.forEach((resource) =>
      assert.equal(
        received[index][resource],
        player.resources[resource] - before.players[index].resources[resource],
      ),
    ),
  );
  assert.equal(events.find((event) => event.type === 'phase')!.phase, 'trade');
  assert.equal(
    events.find((event) => event.type === 'phase')!.at,
    room.diceEvent!.at + DICE_DURATION_MS + visited.length * PRODUCTION_HEX_MS,
  );
});

function gameReceived(game: Game) {
  return game.players.map(() => emptyCards());
}

test('hex production visits skip the robber and obey both bank shortage rules without inventing payouts', () => {
  for (const scenario of ['full', 'multiple-shortage', 'single-shortage', 'empty'] as const) {
    const room = visualRoom();
    const game = room.game!;
    game.players.forEach((player) => {
      player.resources = emptyCards();
    });
    game.board.vertices.forEach((vertex) => {
      delete vertex.building;
    });
    game.board.hexes.forEach((hex) => {
      hex.number = 0;
    });
    const first = game.board.hexes[0];
    const last = game.board.hexes.at(-1)!;
    const blocked = game.board.hexes.find(
      (hex) =>
        hex.vertices.some(
          (vertex) => !first.vertices.includes(vertex) && !last.vertices.includes(vertex),
        ) &&
        hex !== first &&
        hex !== last,
    )!;
    for (const hex of [first, last, blocked]) {
      hex.resource = 'wood';
      hex.number = 8;
    }
    game.board.robber = blocked.id;
    game.board.vertices[first.vertices[0]].building = { player: 0, kind: 'city' };
    if (scenario !== 'single-shortage')
      game.board.vertices[first.vertices[3]].building = { player: 1, kind: 'settlement' };
    game.board.vertices[last.vertices[0]].building = { player: 0, kind: 'settlement' };
    game.board.vertices[
      blocked.vertices.find(
        (vertex) => !first.vertices.includes(vertex) && !last.vertices.includes(vertex),
      )!
    ].building = { player: 2, kind: 'city' };
    game.bank.wood =
      scenario === 'full'
        ? 19
        : scenario === 'multiple-shortage'
          ? 2
          : scenario === 'single-shortage'
            ? 1
            : 0;
    const production = perform(room, { type: 'roll' }, 0, () => 3 / 6).filter(
      (event) => event.type === 'production',
    );
    assert.ok(production.every((event) => event.hex !== blocked.id));
    if (scenario === 'full') {
      assert.deepEqual(
        production.map((event) => [event.hex, event.actorId, event.count]),
        [
          [first.id, game.players[0].id, 2],
          [first.id, game.players[1].id, 1],
          [last.id, game.players[0].id, 1],
        ],
      );
      assert.equal(production[0].at, production[1].at);
      assert.equal(production[2].at - production[0].at, PRODUCTION_HEX_MS);
    } else if (scenario === 'single-shortage') {
      assert.equal(production.length, 1);
      assert.equal(production[0].hex, first.id);
      assert.deepEqual(production[0].resources, { wood: 1 });
    } else assert.equal(production.length, 0);
    assert.equal(
      production.reduce((sum, event) => sum + event.count!, 0),
      room.game!.players.reduce((sum, player) => sum + player.resources.wood, 0),
    );
  }
});

test('setup, upgrades, free roads, trades and turn changes retain targets for movement animations', () => {
  const room = visualRoom(newGame());
  while (room.game!.phase.startsWith('setup')) {
    const game = room.game!;
    const action: Action =
      game.phase === 'setup-settlement'
        ? { type: 'settlement', vertex: settlementSites(game, game.active, true)[0] }
        : { type: 'road', edge: roadSites(game, game.active, game.setupVertex)[0] };
    const events = perform(room, action);
    assert.equal(events[0].type, action.type);
    assert.ok(events.some((event) => event.type === 'phase'));
  }
  rich(room.game!);
  const vertex = room.game!.board.vertices.find((v) => v.building?.player === 0)!.id;
  assert.equal(perform(room, { type: 'city', vertex })[0].vertex, vertex);
  const bank = perform(room, { type: 'bank-trade', give: 'wood', receive: 'ore' })[0];
  assert.ok(bank.give!.wood! >= 2);
  assert.equal(bank.receive!.ore, 1);
  room.game!.players[1].resources.ore = 1;
  perform(room, {
    type: 'offer',
    to: 'all',
    give: { ...emptyCards(), brick: 1 },
    receive: { ...emptyCards(), ore: 1 },
  });
  const accepted = perform(room, { type: 'accept-trade', offer: room.game!.offer!.id }, 1)[0];
  assert.equal(accepted.targetPlayerId, room.game!.players[0].id);
  assert.equal(accepted.give!.ore, 1);
  assert.equal(accepted.receive!.brick, 1);
  room.game!.players[0].development.push({ kind: 'roads', boughtTurn: 0 });
  const edge1 = roadSites(room.game!, 0)[0];
  const temporary = structuredClone(room.game!);
  temporary.board.edges[edge1].player = 0;
  const edge2 = roadSites(temporary, 0)[0];
  const roads = perform(room, { type: 'development', card: 'roads', edges: [edge1, edge2] });
  assert.deepEqual(
    roads.filter((event) => event.type === 'road').map((event) => event.edge),
    [edge1, edge2],
  );
  const turn = perform(room, { type: 'end' }).find((event) => event.type === 'turn')!;
  assert.equal(turn.actorId, room.game!.players[1].id);
  assert.equal(turn.phase, 'roll');
});

test('authoritative command events persist once, and rejected/stale commands emit nothing', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'catan-events-'));
  const store = new CatanStore(join(dir, 'game.sqlite'), 'local');
  try {
    const identities = await Promise.all(
      Array.from({ length: 3 }, async () => (await store.session()).identity),
    );
    let room = await store.createRoom(identities[0], 'Animation events', 3, 'Host', false);
    for (let index = 1; index < 3; index++)
      room = await store.join(identities[index], room.code, `Guest ${index}`);
    room = (await store.change(identities[0], room.code, room.revision, 'start'))!;
    assert.equal(room.visualEvents!.at(-1)!.type, 'start');
    room = await finishOpening(store, room);
    assert.ok(room.visualEvents!.some((event) => event.type === 'opening-roll'));
    assert.equal(room.visualEvents!.at(-1)!.phase, 'setup-settlement');
    const savedEvents = structuredClone(room.visualEvents);
    await assert.rejects(
      store.change(identities[0], room.code, room.revision - 1, 'pause'),
      /changed/,
    );
    assert.deepEqual((await store.room(room.code)).visualEvents, savedEvents);
    room = (await store.change(identities[0], room.code, room.revision, 'pause'))!;
    assert.equal(room.visualEvents!.at(-1)!.type, 'pause-request');
    room = (await store.change(identities[1], room.code, room.revision, 'approve-pause'))!;
    assert.equal(room.visualEvents!.at(-1)!.type, 'pause-vote');
    room = (await store.change(identities[2], room.code, room.revision, 'approve-pause'))!;
    assert.equal(room.visualEvents!.at(-1)!.type, 'pause');
    room = (await store.change(identities[2], room.code, room.revision, 'resume'))!;
    assert.equal(room.visualEvents!.at(-1)!.type, 'resume');
    room = (await store.change(identities[0], room.code, room.revision, 'pause'))!;
    room = (await store.change(identities[1], room.code, room.revision, 'decline-pause'))!;
    assert.equal(room.visualEvents!.at(-1)!.type, 'pause-declined');
    room = (await store.change(identities[0], room.code, room.revision, 'end-game'))!;
    assert.equal(room.visualEvents!.at(-1)!.type, 'finish');
    assert.equal(room.visualEvents!.at(-1)!.reason, 'ended');
    assert.deepEqual((await store.room(room.code)).visualEvents, room.visualEvents);
    assert.equal(
      new Set(room.visualEvents!.map((event) => event.id)).size,
      room.visualEvents!.length,
    );
  } finally {
    await store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('seven, all public development effects, canceled offers and victories announce the right phase', () => {
  const sevenRoom = visualRoom(rich(setup()));
  sevenRoom.game!.phase = 'roll';
  let die = 0;
  const seven = perform(sevenRoom, { type: 'roll' }, 0, () => [2 / 6, 3 / 6][die++]);
  assert.equal(seven.find((event) => event.type === 'phase')!.phase, 'discard');
  assert.equal(
    seven.some((event) => event.type === 'production'),
    false,
  );

  for (const card of ['knight', 'plenty', 'monopoly'] as const) {
    const room = visualRoom(rich(setup()));
    room.game!.players[0].development = [{ kind: card, boughtTurn: 0 }];
    room.game!.players[1].resources.wood = 2;
    const action: Action =
      card === 'plenty'
        ? { type: 'development', card, resources: ['wood', 'brick'] }
        : card === 'monopoly'
          ? { type: 'development', card, resource: 'wood' }
          : { type: 'development', card };
    const played = perform(room, action);
    assert.equal(played[0].card, card);
    if (card === 'knight')
      assert.equal(played.find((event) => event.type === 'phase')!.phase, 'robber');
    else {
      assert.ok(played[0].count! > 0);
      assert.ok(played[0].resources!.wood! > 0);
    }
  }

  const room = visualRoom(rich(setup()));
  perform(room, {
    type: 'offer',
    to: 'all',
    give: { ...emptyCards(), wood: 1 },
    receive: { ...emptyCards(), ore: 1 },
  });
  assert.equal(perform(room, { type: 'cancel-trade' })[0].type, 'cancel-trade');
  room.game!.players[0].development = Array.from({ length: 8 }, () => ({
    kind: 'victory',
    boughtTurn: 0,
  }));
  const winning = perform(room, { type: 'end' });
  assert.equal(winning.find((event) => event.type === 'phase')!.phase, 'finished');
  assert.equal(winning.find((event) => event.type === 'finish')!.reason, 'winner');
  assert.equal(winning.find((event) => event.type === 'finish')!.actorId, room.game!.players[0].id);
  assert.equal(
    winning.some((event) => event.type === 'turn'),
    false,
  );
});
