import { createGame, applyAction, roadSites, settlementSites } from '../../src/lib/catan/engine.ts';
import { RESOURCES, type Game, type Resource } from '../../src/lib/catan/types.ts';
export function seeded(seed = 42) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
export function newGame(n = 3, seed = 42) {
  return createGame(
    Array.from({ length: n }, (_, i) => ({ id: `seat-${i}`, name: `Player ${i + 1}` })),
    seeded(seed),
  );
}
export function setup(n = 3, seed = 42) {
  let g = newGame(n, seed);
  while (g.phase.startsWith('setup')) {
    const action =
      g.phase === 'setup-settlement'
        ? { type: 'settlement' as const, vertex: settlementSites(g, g.active, true)[0] }
        : { type: 'road' as const, edge: roadSites(g, g.active, g.setupVertex)[0] };
    g = applyAction(g, g.active, action, seeded());
  }
  return g;
}
export function grant(g: Game, player: number, resource: Resource, count: number) {
  const change = count - g.players[player].resources[resource];
  g.bank[resource] -= change;
  g.players[player].resources[resource] = count;
}
export function rich(g: Game, player = 0) {
  RESOURCES.forEach((r) => grant(g, player, r, 8));
  g.phase = 'trade';
  return g;
}
export function conserve(g: Game) {
  return RESOURCES.map((r) => g.bank[r] + g.players.reduce((n, p) => n + p.resources[r], 0));
}
