import { createBoard, shuffle } from './board.ts';
import {
  RESOURCES,
  emptyCards,
  cardCount,
  type Action,
  type Cards,
  type Development,
  type Game,
  type Player,
  type Random,
  type Resource,
} from './types.ts';

export class RuleError extends Error {}
function requireRule(condition: unknown, message: string): asserts condition {
  if (!condition) throw new RuleError(message);
}
export const COSTS: Record<'road' | 'settlement' | 'city' | 'development', Cards> = {
  road: { ...emptyCards(), wood: 1, brick: 1 },
  settlement: { ...emptyCards(), wood: 1, brick: 1, sheep: 1, wheat: 1 },
  city: { ...emptyCards(), wheat: 2, ore: 3 },
  development: { ...emptyCards(), sheep: 1, wheat: 1, ore: 1 },
};
export function validCards(value: unknown): value is Cards {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    Object.keys(v).length === 5 &&
    RESOURCES.every((r) => Number.isSafeInteger(v[r]) && Number(v[r]) >= 0 && Number(v[r]) <= 114)
  );
}
export const canAfford = (hand: Cards, cost: Cards) => RESOURCES.every((r) => hand[r] >= cost[r]);
function transfer(from: Cards, to: Cards, cards: Cards) {
  requireRule(validCards(cards) && canAfford(from, cards), 'Not enough resources.');
  for (const r of RESOURCES) {
    from[r] -= cards[r];
    to[r] += cards[r];
  }
}
function pay(game: Game, player: number, kind: keyof typeof COSTS) {
  transfer(game.players[player].resources, game.bank, COSTS[kind]);
  for (const r of RESOURCES) game.players[player].metrics.spent[r] += COSTS[kind][r];
}
function note(game: Game, text: string) {
  game.log.push({ turn: game.turn, text });
  if (game.log.length > 100) game.log.shift();
}
export function createGame(
  seats: { id: string; name: string; profileId?: string; color?: number }[],
  random: Random,
): Game {
  requireRule(seats.length >= 3 && seats.length <= 6, 'Games need 3–6 players.');
  requireRule(new Set(seats.map((p) => p.id)).size === seats.length, 'Player IDs must be unique.');
  const extended = seats.length > 4;
  const deck: Development[] = [];
  const kinds: Development[] = ['knight', 'victory', 'roads', 'plenty', 'monopoly'];
  kinds.forEach((kind, i) =>
    deck.push(
      ...Array<Development>((extended ? [20, 5, 3, 3, 3] : [14, 5, 2, 2, 2])[i]).fill(kind),
    ),
  );
  const players: Player[] = seats.map((p) => ({
    ...p,
    resources: emptyCards(),
    development: [],
    playedDevelopment: [],
    knights: 0,
    metrics: {
      produced: emptyCards(),
      spent: emptyCards(),
      stolen: 0,
      robbed: 0,
      discarded: 0,
      trades: 0,
      roadsBuilt: 0,
      settlementsBuilt: 0,
      citiesBuilt: 0,
      developmentBought: 0,
    },
  }));
  return {
    board: createBoard(extended, random),
    players,
    bank: Object.fromEntries(RESOURCES.map((r) => [r, extended ? 24 : 19])) as Cards,
    deck: shuffle(deck, random),
    phase: 'setup-settlement',
    active: 0,
    primary: 0,
    paired: false,
    turn: 0,
    setupStep: 0,
    discard: {},
    robberReturn: 'trade',
    developmentPlayed: false,
    roadLengths: players.map(() => 0),
    nextOffer: 1,
    log: [],
  };
}
export function score(game: Game, player: number, hidden = true): number {
  return (
    game.board.vertices.reduce(
      (n, v) => n + (v.building?.player === player ? (v.building.kind === 'city' ? 2 : 1) : 0),
      0,
    ) +
    (game.longestRoad === player ? 2 : 0) +
    (game.largestArmy === player ? 2 : 0) +
    (hidden ? game.players[player].development.filter((c) => c.kind === 'victory').length : 0)
  );
}
export function longestRoad(game: Game, player: number): number {
  const walk = (vertex: number, used: Set<number>): number => {
    const v = game.board.vertices[vertex];
    if (used.size && v.building && v.building.player !== player) return used.size;
    let best = used.size;
    for (const edgeId of v.edges) {
      const edge = game.board.edges[edgeId];
      if (edge.player !== player || used.has(edgeId)) continue;
      used.add(edgeId);
      best = Math.max(best, walk(edge.a === vertex ? edge.b : edge.a, used));
      used.delete(edgeId);
    }
    return best;
  };
  return Math.max(
    0,
    ...game.board.vertices
      .filter((v) => v.edges.some((e) => game.board.edges[e].player === player))
      .map((v) => walk(v.id, new Set())),
  );
}
function award(values: number[], minimum: number, holder?: number): number | undefined {
  const maximum = Math.max(...values);
  if (maximum < minimum) return undefined;
  if (holder !== undefined && values[holder] === maximum) return holder;
  const leaders = values.flatMap((v, i) => (v === maximum ? [i] : []));
  return leaders.length === 1 ? leaders[0] : undefined;
}
function updateAwards(game: Game) {
  game.roadLengths = game.players.map((_, p) => longestRoad(game, p));
  game.longestRoad = award(game.roadLengths, 5, game.longestRoad);
  game.largestArmy = award(
    game.players.map((p) => p.knights),
    3,
    game.largestArmy,
  );
}
function checkWinner(game: Game) {
  if (game.phase.startsWith('setup')) return;
  if (score(game, game.active) >= 10) {
    game.winner = game.active;
    game.phase = 'finished';
    game.offer = undefined;
    note(game, `${game.players[game.active].name} won with ${score(game, game.active)} points.`);
  }
}
function pieceCount(game: Game, player: number, kind: 'settlement' | 'city') {
  return game.board.vertices.filter(
    (v) => v.building?.player === player && v.building.kind === kind,
  ).length;
}
export function settlementSites(game: Game, player: number, setup = false): number[] {
  if (pieceCount(game, player, 'settlement') >= 5) return [];
  return game.board.vertices
    .filter(
      (v) =>
        !v.building &&
        v.edges.every((e) => {
          const edge = game.board.edges[e];
          return !game.board.vertices[edge.a === v.id ? edge.b : edge.a].building;
        }) &&
        (setup || v.edges.some((e) => game.board.edges[e].player === player)),
    )
    .map((v) => v.id);
}
export function roadSites(game: Game, player: number, setupVertex?: number): number[] {
  if (game.board.edges.filter((e) => e.player === player).length >= 15) return [];
  return game.board.edges
    .filter(
      (e) =>
        e.player === undefined &&
        (setupVertex !== undefined
          ? e.a === setupVertex || e.b === setupVertex
          : [e.a, e.b].some((id) => {
              const v = game.board.vertices[id];
              if (v.building) return v.building.player === player;
              return v.edges.some((other) => game.board.edges[other].player === player);
            })),
    )
    .map((e) => e.id);
}
export function citySites(game: Game, player: number): number[] {
  return pieceCount(game, player, 'city') >= 4
    ? []
    : game.board.vertices
        .filter((v) => v.building?.player === player && v.building.kind === 'settlement')
        .map((v) => v.id);
}
export function tradeRatio(game: Game, player: number, resource: Resource): number {
  const ports = game.board.vertices.filter((v) => v.building?.player === player).map((v) => v.port);
  return ports.includes(resource) ? 2 : ports.includes('any') ? 3 : 4;
}
export function robberVictims(game: Game, player: number, hex: number): number[] {
  const tile = game.board.hexes[hex];
  if (!tile) return [];
  return [
    ...new Set(
      tile.vertices.flatMap((v) => {
        const p = game.board.vertices[v].building?.player;
        return p !== undefined && p !== player && cardCount(game.players[p].resources) > 0
          ? [p]
          : [];
      }),
    ),
  ];
}
function produce(game: Game, roll: number) {
  const due = game.players.map(() => emptyCards());
  for (const hex of game.board.hexes) {
    if (hex.id === game.board.robber || hex.number !== roll || hex.resource === 'desert') continue;
    for (const id of hex.vertices) {
      const b = game.board.vertices[id].building;
      if (b) due[b.player][hex.resource] += b.kind === 'city' ? 2 : 1;
    }
  }
  for (const r of RESOURCES) {
    const recipients = due.flatMap((cards, p) => (cards[r] ? [p] : []));
    const total = due.reduce((n, cards) => n + cards[r], 0);
    if (total > game.bank[r] && recipients.length > 1) continue;
    for (const p of recipients) {
      const count = Math.min(due[p][r], game.bank[r]);
      game.players[p].resources[r] += count;
      game.bank[r] -= count;
      game.players[p].metrics.produced[r] += count;
    }
  }
}

/** Pure transaction boundary: an invalid action never mutates the caller's state. */
export function applyAction(original: Game, player: number, action: Action, random: Random): Game {
  const game = structuredClone(original);
  execute(game, player, action, random);
  return game;
}
function execute(game: Game, player: number, action: Action, random: Random) {
  requireRule(game.phase !== 'finished', 'This game is finished.');
  requireRule(Number.isInteger(player) && !!game.players[player], 'Unknown player.');
  const self = game.players[player];
  if (action.type === 'discard') {
    const count = game.discard[player];
    requireRule(game.phase === 'discard' && count > 0, 'You do not need to discard.');
    requireRule(
      validCards(action.cards) && cardCount(action.cards) === count,
      `Discard exactly ${count} resources.`,
    );
    transfer(self.resources, game.bank, action.cards);
    self.metrics.discarded += count;
    delete game.discard[player];
    if (!Object.keys(game.discard).length) game.phase = 'robber';
    note(game, `${self.name} discarded ${count} cards.`);
    return;
  }
  if (action.type === 'accept-trade') {
    const offer = game.offer;
    requireRule(
      game.phase === 'trade' &&
        !game.paired &&
        offer &&
        offer.id === action.offer &&
        (offer.to === player || offer.to === 'all') &&
        offer.from !== player &&
        offer.from === game.active,
      'This offer is no longer available.',
    );
    transfer(self.resources, game.players[offer.from].resources, offer.receive);
    transfer(game.players[offer.from].resources, self.resources, offer.give);
    self.metrics.trades++;
    game.players[offer.from].metrics.trades++;
    game.offer = undefined;
    note(game, `${self.name} traded with ${game.players[offer.from].name}.`);
    return;
  }
  requireRule(player === game.active, 'Wait for your turn.');
  const setup = game.phase.startsWith('setup');
  if (setup) {
    if (game.phase === 'setup-settlement' && action.type === 'settlement') {
      requireRule(
        settlementSites(game, player, true).includes(action.vertex),
        'Choose an empty intersection at least two edges from another settlement.',
      );
      game.board.vertices[action.vertex].building = { player, kind: 'settlement' };
      self.metrics.settlementsBuilt++;
      game.setupVertex = action.vertex;
      game.phase = 'setup-road';
      if (game.setupStep >= game.players.length) {
        for (const h of game.board.vertices[action.vertex].hexes) {
          const resource = game.board.hexes[h].resource;
          if (resource !== 'desert' && game.bank[resource] > 0) {
            game.bank[resource]--;
            self.resources[resource]++;
          }
        }
      }
    } else if (game.phase === 'setup-road' && action.type === 'road') {
      requireRule(
        roadSites(game, player, game.setupVertex).includes(action.edge),
        'Connect a road to your new settlement.',
      );
      game.board.edges[action.edge].player = player;
      self.metrics.roadsBuilt++;
      game.setupStep++;
      game.setupVertex = undefined;
      const n = game.players.length;
      if (game.setupStep === 2 * n) {
        game.active = 0;
        game.turn = 1;
        game.phase = 'roll';
      } else {
        game.active = game.setupStep < n ? game.setupStep : 2 * n - game.setupStep - 1;
        game.phase = 'setup-settlement';
      }
    } else throw new RuleError('Finish your starting settlement and road.');
    note(game, `${self.name} placed a starting ${action.type}.`);
    updateAwards(game);
    return;
  }
  if (action.type === 'roll') {
    requireRule(game.phase === 'roll', 'You cannot roll now.');
    game.dice = [Math.floor(random() * 6) + 1, Math.floor(random() * 6) + 1];
    const roll = game.dice[0] + game.dice[1];
    note(game, `${self.name} rolled ${roll}.`);
    if (roll === 7) {
      game.discard = {};
      game.players.forEach((p, i) => {
        const count = cardCount(p.resources);
        if (count > 7) game.discard[i] = Math.floor(count / 2);
      });
      game.phase = Object.keys(game.discard).length ? 'discard' : 'robber';
      game.robberReturn = 'trade';
    } else {
      produce(game, roll);
      game.phase = 'trade';
    }
  } else if (action.type === 'robber') {
    requireRule(game.phase === 'robber', 'You cannot move the robber now.');
    requireRule(
      Number.isInteger(action.hex) &&
        !!game.board.hexes[action.hex] &&
        action.hex !== game.board.robber,
      'Move the robber to a different hex.',
    );
    const victims = robberVictims(game, player, action.hex);
    requireRule(
      victims.length
        ? action.victim !== undefined && victims.includes(action.victim)
        : action.victim === undefined,
      'Choose an eligible neighboring player to rob.',
    );
    game.board.robber = action.hex;
    if (action.victim !== undefined) {
      const victim = game.players[action.victim];
      let draw = Math.floor(random() * cardCount(victim.resources));
      for (const r of RESOURCES) {
        if (draw < victim.resources[r]) {
          victim.resources[r]--;
          self.resources[r]++;
          break;
        }
        draw -= victim.resources[r];
      }
      self.metrics.stolen++;
      victim.metrics.robbed++;
    }
    game.phase = game.robberReturn;
    note(
      game,
      `${self.name} moved the robber${action.victim !== undefined ? ` and stole a card from ${game.players[action.victim].name}` : ''}.`,
    );
  } else if (action.type === 'development') {
    requireRule(
      game.phase === 'roll' || game.phase === 'trade',
      'You cannot play a development card now.',
    );
    requireRule(!game.developmentPlayed, 'Only one development card per turn.');
    const index = self.development.findIndex(
      (c) => c.kind === action.card && c.boughtTurn < game.turn,
    );
    requireRule(index >= 0, 'You need a matching card bought on an earlier turn.');
    self.development.splice(index, 1);
    game.developmentPlayed = true;
    if (action.card === 'knight') {
      self.knights++;
      game.robberReturn = game.phase;
      game.phase = 'robber';
    } else if (action.card === 'monopoly') {
      requireRule(RESOURCES.includes(action.resource), 'Choose a resource.');
      game.players.forEach((p, i) => {
        if (i !== player) {
          self.resources[action.resource] += p.resources[action.resource];
          p.resources[action.resource] = 0;
        }
      });
    } else if (action.card === 'plenty') {
      requireRule(
        Array.isArray(action.resources) &&
          action.resources.length === Math.min(2, cardCount(game.bank)) &&
          action.resources.every((r) => RESOURCES.includes(r)),
        'Choose two available resources (or the remaining supply).',
      );
      const cards = emptyCards();
      action.resources.forEach((r) => cards[r]++);
      transfer(game.bank, self.resources, cards);
    } else if (action.card === 'roads') {
      requireRule(
        Array.isArray(action.edges) && action.edges.length <= 2,
        'Choose up to two roads.',
      );
      for (const edge of action.edges) {
        requireRule(roadSites(game, player).includes(edge), 'Choose a legal connected road.');
        game.board.edges[edge].player = player;
        self.metrics.roadsBuilt++;
      }
      requireRule(
        action.edges.length === 2 || roadSites(game, player).length === 0,
        'Place both free roads when possible.',
      );
    } else throw new RuleError('Unknown development card.');
    (self.playedDevelopment ??= []).push({ kind: action.card, turn: game.turn });
    game.offer = undefined;
    note(game, `${self.name} played ${action.card}.`);
  } else {
    requireRule(game.phase === 'trade', 'Roll and resolve the robber before building or trading.');
    switch (action.type) {
      case 'settlement':
        requireRule(
          settlementSites(game, player).includes(action.vertex),
          'Choose a legal intersection connected to your road.',
        );
        pay(game, player, 'settlement');
        game.board.vertices[action.vertex].building = { player, kind: 'settlement' };
        self.metrics.settlementsBuilt++;
        break;
      case 'city':
        requireRule(
          citySites(game, player).includes(action.vertex),
          'Upgrade one of your settlements (maximum four cities).',
        );
        pay(game, player, 'city');
        game.board.vertices[action.vertex].building = { player, kind: 'city' };
        self.metrics.citiesBuilt++;
        break;
      case 'road':
        requireRule(
          roadSites(game, player).includes(action.edge),
          'Choose a legal road connected to your network.',
        );
        pay(game, player, 'road');
        game.board.edges[action.edge].player = player;
        self.metrics.roadsBuilt++;
        break;
      case 'buy-development':
        requireRule(game.deck.length > 0, 'The development deck is empty.');
        pay(game, player, 'development');
        self.development.push({ kind: game.deck.pop()!, boughtTurn: game.turn });
        self.metrics.developmentBought++;
        break;
      case 'bank-trade': {
        requireRule(
          RESOURCES.includes(action.give) &&
            RESOURCES.includes(action.receive) &&
            action.give !== action.receive,
          'Choose two different resources.',
        );
        const give = { ...emptyCards(), [action.give]: tradeRatio(game, player, action.give) };
        transfer(self.resources, game.bank, give);
        transfer(game.bank, self.resources, { ...emptyCards(), [action.receive]: 1 });
        self.metrics.trades++;
        break;
      }
      case 'offer':
        requireRule(!game.paired, 'The paired player can only trade with the bank.');
        requireRule(
          action.to === 'all' ||
            (Number.isInteger(action.to) && !!game.players[action.to] && action.to !== player),
          'Choose another player or the whole table.',
        );
        requireRule(
          validCards(action.give) &&
            validCards(action.receive) &&
            cardCount(action.give) > 0 &&
            cardCount(action.receive) > 0 &&
            RESOURCES.every((r) => !action.give[r] || !action.receive[r]),
          'Offer and request different resources.',
        );
        requireRule(
          canAfford(self.resources, action.give),
          'You cannot offer cards you do not have.',
        );
        game.offer = {
          id: game.nextOffer++,
          from: player,
          to: action.to,
          give: action.give,
          receive: action.receive,
        };
        break;
      case 'cancel-trade':
        game.offer = undefined;
        break;
      case 'end':
        checkWinner(game);
        if (game.winner !== undefined) return;
        if (game.players.length > 4 && !game.paired) {
          game.paired = true;
          game.active = (game.primary + 3) % game.players.length;
          game.phase = 'trade';
        } else {
          game.paired = false;
          game.primary = (game.primary + 1) % game.players.length;
          game.active = game.primary;
          game.phase = 'roll';
          game.dice = undefined;
        }
        game.turn++;
        game.developmentPlayed = false;
        break;
      default:
        throw new RuleError('Unknown action.');
    }
    if (action.type !== 'offer') game.offer = undefined;
    note(game, `${self.name}: ${action.type.replaceAll('-', ' ')}.`);
  }
  updateAwards(game);
  checkWinner(game);
}
