import {
  applyAction,
  canAfford,
  citySites,
  COSTS,
  roadSites,
  robberVictims,
  score,
  settlementSites,
  tradeRatio,
} from './engine.ts';
import {
  cardCount,
  emptyCards,
  RESOURCES,
  type Action,
  type Cards,
  type Game,
  type Random,
  type Resource,
} from './types.ts';
import type { Odds } from './store.ts';

export function seededRandom(seed: number): Random {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
function vertexValue(g: Game, vertex: number, player: number) {
  const owned = new Set(
    g.board.vertices
      .filter((v) => v.building?.player === player)
      .flatMap((v) => v.hexes.map((h) => g.board.hexes[h].resource)),
  );
  const v = g.board.vertices[vertex];
  return (
    v.hexes.reduce((n, id) => {
      const h = g.board.hexes[id];
      return (
        n +
        (h.number
          ? (6 - Math.abs(7 - h.number)) *
            (owned.has(h.resource) ? 1 : 1.4) *
            (h.resource === 'ore' || h.resource === 'wheat' ? 1.15 : 1)
          : 0)
      );
    }, 0) + (v.port ? 1.5 : 0)
  );
}
function best<T>(values: T[], value: (item: T) => number, random: Random): T {
  return values
    .map((item) => ({ item, value: value(item) + random() * 2 }))
    .sort((a, b) => b.value - a.value)[0].item;
}
function roadValue(g: Game, edge: number, player: number) {
  const e = g.board.edges[edge];
  const open = settlementSites(g, player, true);
  if (!open.length) return 0;
  // Expand toward productive, unoccupied intersections; avoid dead-end coast roads.
  const distances = new Map<number, number>();
  const queue = [e.a, e.b];
  queue.forEach((v) => distances.set(v, 0));
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i],
      v = g.board.vertices[id];
    if (v.building && v.building.player !== player) continue;
    for (const eid of v.edges) {
      const other = g.board.edges[eid];
      if (other.player !== undefined && other.player !== player) continue;
      const next = other.a === id ? other.b : other.a;
      if (!distances.has(next)) {
        distances.set(next, distances.get(id)! + 1);
        queue.push(next);
      }
    }
  }
  return Math.max(...open.map((v) => vertexValue(g, v, player) - 6 * (distances.get(v) ?? 100)));
}
function target(g: Game, player: number): { cost: Cards; action: Action }[] {
  const targets: { cost: Cards; action: Action }[] = [];
  const cities = citySites(g, player),
    settlements = settlementSites(g, player),
    roads = roadSites(g, player);
  if (cities.length)
    targets.push({
      cost: COSTS.city,
      action: {
        type: 'city',
        vertex: best(
          cities,
          (v) => vertexValue(g, v, player),
          () => 0,
        ),
      },
    });
  if (settlements.length)
    targets.push({
      cost: COSTS.settlement,
      action: {
        type: 'settlement',
        vertex: best(
          settlements,
          (v) => vertexValue(g, v, player),
          () => 0,
        ),
      },
    });
  if (g.deck.length) targets.push({ cost: COSTS.development, action: { type: 'buy-development' } });
  if (roads.length && settlementSites(g, player, true).length)
    targets.push({
      cost: COSTS.road,
      action: {
        type: 'road',
        edge: best(
          roads,
          (e) => roadValue(g, e, player),
          () => 0,
        ),
      },
    });
  return targets;
}
/** A stochastic, resource-aware policy. It chooses legal moves using the full server state. */
export function policy(g: Game, random: Random): { player: number; action: Action } {
  const player = g.active,
    self = g.players[player];
  if (g.phase === 'setup-settlement')
    return {
      player,
      action: {
        type: 'settlement',
        vertex: best(settlementSites(g, player, true), (v) => vertexValue(g, v, player), random),
      },
    };
  if (g.phase === 'setup-road')
    return {
      player,
      action: {
        type: 'road',
        edge: best(roadSites(g, player, g.setupVertex), (e) => roadValue(g, e, player), random),
      },
    };
  if (g.phase === 'discard') {
    const discarder = Number(Object.keys(g.discard)[0]);
    const hand = { ...g.players[discarder].resources },
      cards = emptyCards();
    for (let i = 0; i < g.discard[discarder]; i++) {
      const r = best(
        RESOURCES.filter((r) => hand[r] > 0),
        (r) => hand[r],
        random,
      );
      hand[r]--;
      cards[r]++;
    }
    return { player: discarder, action: { type: 'discard', cards } };
  }
  if (g.phase === 'robber') {
    const hex = best(
      g.board.hexes.filter((h) => h.id !== g.board.robber),
      (h) =>
        h.vertices.reduce((n, v) => {
          const b = g.board.vertices[v].building;
          return (
            n +
            (b
              ? (b.player === player ? -15 : 2 + score(g, b.player)) * (b.kind === 'city' ? 2 : 1)
              : 0)
          );
        }, 0) * (h.number ? 6 - Math.abs(7 - h.number) : 0),
      random,
    );
    const victims = robberVictims(g, player, hex.id);
    return {
      player,
      action: {
        type: 'robber',
        hex: hex.id,
        ...(victims.length ? { victim: best(victims, (p) => score(g, p), random) } : {}),
      },
    };
  }
  const targets = target(g, player);
  const goal = targets[0]?.cost ?? COSTS.development;
  if (!g.developmentPlayed) {
    const cards = self.development.filter((c) => c.kind !== 'victory' && c.boughtTurn < g.turn);
    const card = cards[0]?.kind;
    if (card === 'knight') return { player, action: { type: 'development', card } };
    if (card === 'monopoly')
      return {
        player,
        action: {
          type: 'development',
          card,
          resource: best(
            [...RESOURCES],
            (r) => g.players.reduce((n, p, i) => n + (i !== player ? p.resources[r] : 0), 0),
            random,
          ),
        },
      };
    if (card === 'plenty') {
      const supply = { ...g.bank },
        hand = { ...self.resources },
        resources: Resource[] = [];
      for (let i = 0; i < 2 && cardCount(supply); i++) {
        const r = best(
          RESOURCES.filter((r) => supply[r]),
          (r) => goal[r] - hand[r],
          random,
        );
        resources.push(r);
        supply[r]--;
        hand[r]++;
      }
      return { player, action: { type: 'development', card, resources } };
    }
    if (card === 'roads') {
      const copy = structuredClone(g),
        edges = [];
      for (let i = 0; i < 2; i++) {
        const sites = roadSites(copy, player);
        if (!sites.length) break;
        const e = best(sites, (e) => roadValue(copy, e, player), random);
        edges.push(e);
        copy.board.edges[e].player = player;
      }
      return { player, action: { type: 'development', card, edges } };
    }
  }
  if (g.phase === 'roll') return { player, action: { type: 'roll' } };
  for (const t of targets)
    if (canAfford(self.resources, t.cost)) {
      // A small stochastic preference makes rollouts explore different build plans.
      if (random() > 0.08) return { player, action: t.action };
    }
  // Trade spare resources toward the cheapest reachable purchase.
  const ranked = targets
    .map((t) => ({
      ...t,
      deficit: RESOURCES.reduce((n, r) => n + Math.max(0, t.cost[r] - self.resources[r]), 0),
    }))
    .sort((a, b) => a.deficit - b.deficit);
  for (const t of ranked) {
    const receive = RESOURCES.find((r) => self.resources[r] < t.cost[r] && g.bank[r] > 0);
    const give = RESOURCES.find((r) => self.resources[r] - t.cost[r] >= tradeRatio(g, player, r));
    if (receive && give) return { player, action: { type: 'bank-trade', give, receive } };
  }
  return { player, action: { type: 'end' } };
}
function horizonWeights(g: Game): number[] {
  const values = g.players.map(
    (p, i) =>
      score(g, i) +
      Math.min(cardCount(p.resources), 15) * 0.06 +
      p.development.filter((c) => c.kind !== 'victory').length * 0.15,
  );
  const maximum = Math.max(...values);
  const weights = values.map((v) => Math.exp((v - maximum) * 1.2));
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => w / sum);
}
export interface EvaluationOptions {
  samples?: number;
  maxActions?: number;
  seed?: number;
}
export async function evaluate(
  game: Game,
  revision: number,
  previous?: Odds,
  options: EvaluationOptions = {},
): Promise<Odds> {
  const samples = options.samples ?? 32,
    maxActions = options.maxActions ?? 1200;
  const totals = game.players.map(() => 0);
  let completed = 0;
  if (game.winner !== undefined) {
    const probabilities = totals.map((_, i) => (i === game.winner ? 100 : 0));
    return {
      revision,
      probabilities,
      delta: probabilities.map((v, i) => v - (previous?.probabilities[i] ?? 100 / totals.length)),
      samples: 0,
      completed: 0,
      model: 'Final result',
    };
  }
  for (let sample = 0; sample < samples; sample++) {
    const random = seededRandom((options.seed ?? 71839) + sample * 104729);
    let state = structuredClone(game);
    state.log = [];
    for (let step = 0; step < maxActions && state.winner === undefined; step++) {
      const next = policy(state, random);
      state = applyAction(state, next.player, next.action, random);
      state.log = [];
      // Yield periodically so multiplayer requests remain responsive during a rollout.
      if (step % 40 === 39) await new Promise<void>((resolve) => setImmediate(resolve));
    }
    if (state.winner !== undefined) {
      totals[state.winner]++;
      completed++;
    } else horizonWeights(state).forEach((weight, i) => (totals[i] += weight));
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  const probabilities = totals.map((v) => Math.round((v / samples) * 1000) / 10);
  // Force the displayed distribution to sum to exactly 100 despite rounding.
  const largest = probabilities.indexOf(Math.max(...probabilities));
  probabilities[largest] =
    Math.round((probabilities[largest] + 100 - probabilities.reduce((a, b) => a + b, 0)) * 10) / 10;
  return {
    revision,
    probabilities,
    delta: probabilities.map(
      (v, i) => Math.round((v - (previous?.probabilities[i] ?? 100 / totals.length)) * 10) / 10,
    ),
    samples,
    completed,
    model: 'Full-information Monte Carlo v1 (build/trade policy; score-based horizon)',
  };
}
