import assert from 'node:assert/strict';
import test from 'node:test';
import { createBoard } from '../../src/lib/catan/board.ts';
import {
  applyAction,
  citySites,
  longestRoad,
  roadSites,
  score,
  settlementSites,
  tradeRatio,
} from '../../src/lib/catan/engine.ts';
import { cardCount, emptyCards, RESOURCES, type Game } from '../../src/lib/catan/types.ts';
import { conserve, grant, newGame, rich, seeded, setup } from './helpers.ts';

for (const n of [3, 4, 5, 6]) {
  test(`${n} players: island topology, supply, snake setup and resource conservation`, () => {
    const fresh = newGame(n);
    const b = fresh.board;
    assert.equal(b.hexes.length, n > 4 ? 30 : 19);
    assert.equal(b.vertices.length, n > 4 ? 80 : 54);
    assert.equal(b.edges.length, n > 4 ? 109 : 72);
    assert.equal(fresh.deck.length, n > 4 ? 34 : 25);
    assert.equal(b.vertices.filter((v) => v.port).length, n > 4 ? 22 : 18);
    assert.equal(b.hexes.filter((h) => h.resource === 'desert').length, n > 4 ? 2 : 1);
    assert.ok(b.vertices.every((v) => v.edges.length >= 2 && v.edges.length <= 3));
    const g = setup(n);
    assert.equal(g.phase, 'roll');
    assert.equal(g.active, 0);
    assert.equal(g.board.edges.filter((e) => e.player !== undefined).length, 2 * n);
    for (let p = 0; p < n; p++) {
      assert.equal(score(g, p), 2);
      assert.equal(g.players[p].metrics.settlementsBuilt, 2);
      assert.ok(cardCount(g.players[p].resources) > 0);
    }
    assert.deepEqual(conserve(g), Array(5).fill(n > 4 ? 24 : 19));
  });
}
test('randomized number tokens never put reds next to each other, across 200 islands', () => {
  for (let seed = 0; seed < 100; seed++)
    for (const extended of [false, true]) {
      const b = createBoard(extended, seeded(seed));
      for (const e of b.edges.filter((e) => e.hexes.length === 2)) {
        assert.ok(!e.hexes.every((h) => [6, 8].includes(b.hexes[h].number)));
      }
    }
});
test('illegal or out-of-turn moves are atomic', () => {
  const g = newGame();
  const before = structuredClone(g);
  assert.throws(() => applyAction(g, 1, { type: 'settlement', vertex: 0 }, seeded()), /turn/);
  assert.throws(
    () => applyAction(g, 0, { type: 'settlement', vertex: -1 }, seeded()),
    /intersection/,
  );
  assert.deepEqual(g, before);
});
test('settlement distance and starting-road connectivity', () => {
  let g = newGame();
  g = applyAction(g, 0, { type: 'settlement', vertex: 0 }, seeded());
  assert.equal(g.phase, 'setup-road');
  assert.ok(
    roadSites(g, 0, 0).every((id) => {
      const e = g.board.edges[id];
      return e.a === 0 || e.b === 0;
    }),
  );
  const invalid = g.board.edges.find((e) => e.a !== 0 && e.b !== 0)!;
  assert.throws(() => applyAction(g, 0, { type: 'road', edge: invalid.id }, seeded()), /Connect/);
  for (const e of g.board.vertices[0].edges) {
    const edge = g.board.edges[e];
    assert.ok(!settlementSites(g, 1, true).includes(edge.a === 0 ? edge.b : edge.a));
  }
});
test('production uses both dice and pays settlements/cities, except robber hex', () => {
  const g = newGame();
  g.phase = 'roll';
  const hex = g.board.hexes.find((h) => h.resource !== 'desert')!;
  g.board.robber = g.board.hexes.find((h) => h.resource === 'desert')!.id;
  g.board.hexes.forEach((h) => {
    if (h.resource !== 'desert') h.number = 3;
  });
  hex.number = 6;
  g.board.vertices[hex.vertices[0]].building = { player: 0, kind: 'city' };
  g.board.vertices[hex.vertices[2]].building = { player: 1, kind: 'settlement' };
  const result = applyAction(g, 0, { type: 'roll' }, () => 0.34);
  assert.deepEqual(result.dice, [3, 3]);
  assert.equal(cardCount(result.players[0].resources), 2);
  assert.equal(cardCount(result.players[1].resources), 1);
  g.board.robber = hex.id;
  assert.equal(cardCount(applyAction(g, 0, { type: 'roll' }, () => 0.34).players[0].resources), 0);
});
test('bank shortage: multiple recipients get none; a sole recipient gets the remainder', () => {
  const g = newGame();
  g.phase = 'roll';
  const hex = g.board.hexes.find((h) => h.resource === 'wood')!;
  g.board.hexes.forEach((h) => (h.number = 3));
  hex.number = 6;
  g.bank.wood = 1;
  g.board.vertices[hex.vertices[0]].building = { player: 0, kind: 'city' };
  g.board.vertices[hex.vertices[2]].building = { player: 1, kind: 'settlement' };
  assert.equal(applyAction(g, 0, { type: 'roll' }, () => 0.34).players[0].resources.wood, 0);
  delete g.board.vertices[hex.vertices[2]].building;
  assert.equal(applyAction(g, 0, { type: 'roll' }, () => 0.34).players[0].resources.wood, 1);
});
test('seven collects exact discards from all affected players before robber', () => {
  const g = newGame();
  g.phase = 'roll';
  grant(g, 0, 'wood', 9);
  grant(g, 1, 'brick', 8);
  grant(g, 2, 'ore', 7);
  let i = 0;
  let next = applyAction(g, 0, { type: 'roll' }, () => (i++ ? 0.51 : 0.34));
  assert.deepEqual(next.discard, { 0: 4, 1: 4 });
  assert.throws(() => applyAction(next, 0, { type: 'end' }, seeded()));
  assert.throws(() =>
    applyAction(next, 0, { type: 'discard', cards: { ...emptyCards(), wood: 3 } }, seeded()),
  );
  next = applyAction(next, 1, { type: 'discard', cards: { ...emptyCards(), brick: 4 } }, seeded());
  assert.equal(next.phase, 'discard');
  next = applyAction(next, 0, { type: 'discard', cards: { ...emptyCards(), wood: 4 } }, seeded());
  assert.equal(next.phase, 'robber');
  assert.deepEqual(conserve(next), Array(5).fill(19));
});
test('robber must move and steals one random card from an adjacent eligible player', () => {
  const g = newGame();
  g.phase = 'robber';
  const hex = g.board.hexes.find((h) => h.id !== g.board.robber)!;
  g.board.vertices[hex.vertices[0]].building = { player: 1, kind: 'settlement' };
  grant(g, 1, 'wood', 3);
  assert.throws(() => applyAction(g, 0, { type: 'robber', hex: g.board.robber }, seeded()));
  assert.throws(() => applyAction(g, 0, { type: 'robber', hex: hex.id, victim: 2 }, seeded()));
  const next = applyAction(g, 0, { type: 'robber', hex: hex.id, victim: 1 }, seeded());
  assert.equal(next.players[0].resources.wood, 1);
  assert.equal(next.players[1].resources.wood, 2);
  assert.equal(next.phase, 'trade');
  assert.deepEqual(conserve(next), Array(5).fill(19));
});
test('roads and cities charge correct costs and respect piece limits', () => {
  let g = rich(setup());
  const resources = structuredClone(g.players[0].resources);
  g = applyAction(g, 0, { type: 'road', edge: roadSites(g, 0)[0] }, seeded());
  assert.equal(g.players[0].resources.wood, resources.wood - 1);
  const vertex = citySites(g, 0)[0];
  g = applyAction(g, 0, { type: 'city', vertex }, seeded());
  assert.equal(score(g, 0), 3);
  assert.equal(g.players[0].resources.ore, resources.ore - 3);
  assert.throws(() => applyAction(g, 0, { type: 'city', vertex }, seeded()));
  assert.deepEqual(conserve(g), Array(5).fill(19));
  g.board.edges.slice(0, 15).forEach((e) => (e.player = 0));
  assert.deepEqual(roadSites(g, 0), []);
});
test('road cannot extend through an opponent settlement', () => {
  const g = newGame();
  const v = g.board.vertices.find((v) => v.edges.length === 3)!;
  g.board.edges[v.edges[0]].player = 0;
  assert.ok(roadSites(g, 0).includes(v.edges[1]));
  v.building = { player: 1, kind: 'settlement' };
  assert.ok(!roadSites(g, 0).includes(v.edges[1]));
});
test('maritime trading applies 4:1, 3:1 and 2:1 ports with supply checks', () => {
  const g = newGame();
  rich(g);
  assert.equal(tradeRatio(g, 0, 'wood'), 4);
  g.board.vertices.find((v) => v.port === 'any')!.building = { player: 0, kind: 'settlement' };
  assert.equal(tradeRatio(g, 0, 'wood'), 3);
  g.board.vertices.find((v) => v.port === 'wood')!.building = { player: 0, kind: 'settlement' };
  assert.equal(tradeRatio(g, 0, 'wood'), 2);
  const next = applyAction(g, 0, { type: 'bank-trade', give: 'wood', receive: 'ore' }, seeded());
  assert.equal(next.players[0].resources.wood, 6);
  assert.equal(next.players[0].resources.ore, 9);
  g.bank.ore = 0;
  const before = structuredClone(g);
  assert.throws(() =>
    applyAction(g, 0, { type: 'bank-trade', give: 'wood', receive: 'ore' }, seeded()),
  );
  assert.deepEqual(g, before);
});
test('domestic trades require a current offer and consenting recipient', () => {
  let g = rich(newGame());
  grant(g, 1, 'ore', 3);
  g = applyAction(
    g,
    0,
    {
      type: 'offer',
      to: 1,
      give: { ...emptyCards(), wood: 2 },
      receive: { ...emptyCards(), ore: 1 },
    },
    seeded(),
  );
  const id = g.offer!.id;
  assert.throws(() => applyAction(g, 2, { type: 'accept-trade', offer: id }, seeded()));
  g = applyAction(g, 1, { type: 'accept-trade', offer: id }, seeded());
  assert.equal(g.players[1].resources.wood, 2);
  assert.equal(g.players[1].resources.ore, 2);
  assert.equal(g.players[0].resources.wood, 6);
  assert.equal(g.players[0].metrics.trades, 1);
  assert.throws(() => applyAction(g, 1, { type: 'accept-trade', offer: id }, seeded()));
});
test('new development cards are locked until a later turn; one play per turn', () => {
  let g = rich(setup());
  g.deck = ['knight'];
  g = applyAction(g, 0, { type: 'buy-development' }, seeded());
  assert.throws(
    () => applyAction(g, 0, { type: 'development', card: 'knight' }, seeded()),
    /earlier turn/,
  );
  g.turn++;
  g.players[0].development.push({ kind: 'monopoly', boughtTurn: 0 });
  g = applyAction(g, 0, { type: 'development', card: 'monopoly', resource: 'ore' }, seeded());
  assert.throws(
    () => applyAction(g, 0, { type: 'development', card: 'knight' }, seeded()),
    /Only one/,
  );
});
test('knight before roll returns to roll after robber; largest army requires three', () => {
  let g = setup();
  g.players[0].development = [{ kind: 'knight', boughtTurn: 0 }];
  g.players[0].knights = 2;
  g = applyAction(g, 0, { type: 'development', card: 'knight' }, seeded());
  assert.equal(g.largestArmy, 0);
  assert.equal(g.phase, 'robber');
  const hex = g.board.hexes.find(
    (h) => h.id !== g.board.robber && h.vertices.every((v) => !g.board.vertices[v].building),
  )!;
  g = applyAction(g, 0, { type: 'robber', hex: hex.id }, seeded());
  assert.equal(g.phase, 'roll');
});
test('monopoly, plenty, and road building implement their effects atomically', () => {
  let g = setup();
  g.phase = 'trade';
  grant(g, 1, 'ore', 2);
  grant(g, 2, 'ore', 3);
  const before = g.players[0].resources.ore;
  g.players[0].development = [{ kind: 'monopoly', boughtTurn: 0 }];
  g = applyAction(g, 0, { type: 'development', card: 'monopoly', resource: 'ore' }, seeded());
  assert.equal(g.players[0].resources.ore, before + 5);
  assert.equal(g.players[1].resources.ore, 0);
  g.developmentPlayed = false;
  g.players[0].development = [{ kind: 'plenty', boughtTurn: 0 }];
  const wood = g.players[0].resources.wood;
  g = applyAction(
    g,
    0,
    { type: 'development', card: 'plenty', resources: ['wood', 'wood'] },
    seeded(),
  );
  assert.equal(g.players[0].resources.wood, wood + 2);
  g.developmentPlayed = false;
  g.players[0].development = [{ kind: 'roads', boughtTurn: 0 }];
  const first = roadSites(g, 0)[0];
  const copy = structuredClone(g);
  copy.board.edges[first].player = 0;
  const second = roadSites(copy, 0)[0];
  const hand = structuredClone(g.players[0].resources);
  g = applyAction(g, 0, { type: 'development', card: 'roads', edges: [first, second] }, seeded());
  assert.equal(g.board.edges[second].player, 0);
  assert.deepEqual(g.players[0].resources, hand);
  assert.deepEqual(conserve(g), Array(5).fill(19));
});
function hexLoop(g: Game, player: number, hex: number) {
  g.board.edges.filter((e) => e.hexes.includes(hex)).forEach((e) => (e.player = player));
}
test('longest road counts loops, not branches twice, and is interrupted by opponents', () => {
  const g = newGame();
  hexLoop(g, 0, 0);
  assert.equal(longestRoad(g, 0), 6);
  const vertices = g.board.hexes[0].vertices;
  g.board.vertices[vertices[0]].building = { player: 1, kind: 'settlement' };
  g.board.vertices[vertices[3]].building = { player: 1, kind: 'settlement' };
  assert.equal(longestRoad(g, 0), 3);
  g.board.vertices[vertices[0]].building!.player = 0;
  g.board.vertices[vertices[3]].building!.player = 0;
  assert.equal(longestRoad(g, 0), 6);
});
test('award ties retain the current owner; a tied vacant award stays vacant', () => {
  let g = newGame();
  g.phase = 'trade';
  hexLoop(g, 0, 0);
  hexLoop(g, 1, 18);
  g.players[0].knights = 3;
  g.players[1].knights = 3;
  g = applyAction(g, 0, { type: 'cancel-trade' }, seeded());
  assert.equal(g.longestRoad, undefined);
  assert.equal(g.largestArmy, undefined);
  g.longestRoad = 0;
  g.largestArmy = 1;
  g = applyAction(g, 0, { type: 'cancel-trade' }, seeded());
  assert.equal(g.longestRoad, 0);
  assert.equal(g.largestArmy, 1);
  g.players[0].knights = 4;
  g = applyAction(g, 0, { type: 'cancel-trade' }, seeded());
  assert.equal(g.largestArmy, 0);
});
for (const n of [5, 6])
  test(`${n}-player paired turn goes three seats forward, no roll or domestic trading`, () => {
    let g = setup(n);
    g.phase = 'trade';
    g = applyAction(g, 0, { type: 'end' }, seeded());
    assert.equal(g.active, 3);
    assert.equal(g.paired, true);
    assert.equal(g.phase, 'trade');
    assert.throws(() => applyAction(g, 3, { type: 'roll' }, seeded()));
    assert.throws(
      () =>
        applyAction(
          g,
          3,
          { type: 'offer', to: 0, give: emptyCards(), receive: emptyCards() },
          seeded(),
        ),
      /paired/,
    );
    g = applyAction(g, 3, { type: 'end' }, seeded());
    assert.equal(g.active, 1);
    assert.equal(g.paired, false);
    assert.equal(g.phase, 'roll');
  });
test('a newly purchased victory point wins immediately, but only on its owner’s turn', () => {
  let g = rich(setup());
  // Engine fixture close to victory: 2 starting settlements + 7 hidden VP.
  g.players[0].development = Array.from({ length: 7 }, () => ({
    kind: 'victory' as const,
    boughtTurn: 0,
  }));
  assert.equal(score(g, 0, false), 2);
  assert.equal(score(g, 0), 9);
  g.deck = ['victory'];
  g = applyAction(g, 0, { type: 'buy-development' }, seeded());
  assert.equal(g.winner, 0);
  assert.equal(g.phase, 'finished');
  assert.throws(() => applyAction(g, 0, { type: 'end' }, seeded()), /finished/);
});
test('a player who has ten points off-turn wins when their turn begins', () => {
  let g = setup(5);
  g.phase = 'trade';
  g.players[3].development = Array.from({ length: 8 }, () => ({
    kind: 'victory' as const,
    boughtTurn: 0,
  }));
  g = applyAction(g, 0, { type: 'end' }, seeded());
  assert.equal(g.winner, 3);
});
test('resource payload validation rejects negative, fractional, missing and extra fields', () => {
  const g = rich(newGame());
  for (const give of [
    { ...emptyCards(), wood: -1 },
    { ...emptyCards(), wood: 1.5 },
    { wood: 1 },
    { ...emptyCards(), wood: 1, extra: 5 },
  ]) {
    assert.throws(() =>
      applyAction(
        g,
        0,
        { type: 'offer', to: 1, give: give as Game['bank'], receive: { ...emptyCards(), ore: 1 } },
        seeded(),
      ),
    );
  }
  assert.ok(RESOURCES.every((r) => Number.isInteger(g.bank[r])));
});

test('table-wide offers are claimed once by any other eligible player and stay atomic', () => {
  const g = newGame(4);
  g.phase = 'trade';
  grant(g, 0, 'wood', 2);
  grant(g, 1, 'ore', 1);
  grant(g, 2, 'ore', 1);
  const offer = applyAction(
    g,
    0,
    {
      type: 'offer',
      to: 'all',
      give: { ...emptyCards(), wood: 1 },
      receive: { ...emptyCards(), ore: 1 },
    },
    seeded(),
  );
  const id = offer.offer!.id;
  assert.throws(
    () => applyAction(offer, 0, { type: 'accept-trade', offer: id }, seeded()),
    /no longer/,
  );
  assert.throws(() => applyAction(offer, 3, { type: 'accept-trade', offer: id }, seeded()));
  assert.ok(offer.offer);
  const claimed = applyAction(offer, 2, { type: 'accept-trade', offer: id }, seeded());
  assert.equal(claimed.players[2].resources.wood, 1);
  assert.equal(claimed.players[0].resources.ore, 1);
  assert.equal(claimed.offer, undefined);
  assert.throws(
    () => applyAction(claimed, 1, { type: 'accept-trade', offer: id }, seeded()),
    /no longer/,
  );
  assert.deepEqual(conserve(claimed), conserve(g));
});

test('successful development plays retain public history without revealing the remaining hand', () => {
  const g = newGame();
  g.phase = 'trade';
  g.turn = 4;
  g.players[0].development = [
    { kind: 'plenty', boughtTurn: 1 },
    { kind: 'victory', boughtTurn: 1 },
  ];
  const played = applyAction(
    g,
    0,
    { type: 'development', card: 'plenty', resources: ['ore', 'wheat'] },
    seeded(),
  );
  assert.deepEqual(played.players[0].playedDevelopment, [{ kind: 'plenty', turn: 4 }]);
  assert.equal(played.players[0].development[0].kind, 'victory');
  assert.deepEqual(g.players[0].playedDevelopment, []);
  assert.throws(() =>
    applyAction(
      played,
      0,
      { type: 'development', card: 'plenty', resources: ['ore', 'wheat'] },
      seeded(),
    ),
  );
  assert.equal(played.players[0].playedDevelopment?.length, 1);
});
