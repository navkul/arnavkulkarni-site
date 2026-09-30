import {
  canAfford,
  citySites,
  COSTS,
  roadSites,
  score,
  settlementSites,
  tradeRatio,
} from './engine.ts';
import { cardCount, RESOURCES, type Development } from './types.ts';
import { owns, type Identity, type Room } from './store.ts';

export function roomSummary(room: Room, identity: Identity) {
  return {
    code: room.code,
    name: room.name,
    capacity: room.capacity,
    players: room.seats.length,
    status: room.status,
    mine: room.seats.some((s) => owns(identity, s)),
    updatedAt: room.updatedAt,
  };
}
export function roomView(room: Room, identity: Identity) {
  const seat = room.seats.find((s) => owns(identity, s));
  const player = room.game?.players.findIndex((p) => p.id === seat?.id) ?? -1;
  const game = room.game;
  const self = player >= 0 ? game?.players[player] : undefined;
  const active = !!game && game.active === player && room.status === 'playing';
  const trade = active && game?.phase === 'trade';
  return {
    code: room.code,
    name: room.name,
    capacity: room.capacity,
    status: room.status,
    revision: room.revision,
    createdAt: room.createdAt,
    startedAt: room.startedAt,
    finishedAt: room.finishedAt,
    isHost: !!seat && seat.id === room.host,
    joined: !!seat,
    me: player,
    seats: room.seats.map((s) => ({
      name: s.name,
      registered: !!s.profileId,
      host: s.id === room.host,
      me: seat?.id === s.id,
    })),
    // Non-members may inspect a lobby, but cannot observe an active game's state.
    game:
      seat && game
        ? {
            board: game.board,
            bank: game.bank,
            phase: game.phase,
            active: game.active,
            primary: game.primary,
            paired: game.paired,
            turn: game.turn,
            dice: game.dice,
            discard: game.discard,
            deckCount: game.deck.length,
            longestRoad: game.longestRoad,
            largestArmy: game.largestArmy,
            roadLengths: game.roadLengths,
            offer: game.offer,
            winner: game.winner,
            log: game.log,
            players: game.players.map((p, i) => ({
              name: p.name,
              registered: !!p.profileId,
              resourcesCount: cardCount(p.resources),
              developmentCount: p.development.length,
              knights: p.knights,
              points: score(game, i, i === player || game.phase === 'finished'),
            })),
            hand: self
              ? {
                  resources: self.resources,
                  development: self.development,
                  points: score(game, player),
                  metrics: self.metrics,
                }
              : undefined,
          }
        : undefined,
    legal:
      game && self
        ? {
            settlements:
              active &&
              (game.phase === 'setup-settlement' ||
                (trade && canAfford(self.resources, COSTS.settlement)))
                ? settlementSites(game, player, game.phase === 'setup-settlement')
                : [],
            roads:
              active &&
              (game.phase === 'setup-road' || (trade && canAfford(self.resources, COSTS.road)))
                ? roadSites(
                    game,
                    player,
                    game.phase === 'setup-road' ? game.setupVertex : undefined,
                  )
                : [],
            freeRoads: active ? roadSites(game, player) : [],
            cities: trade && canAfford(self.resources, COSTS.city) ? citySites(game, player) : [],
            roll: active && game.phase === 'roll',
            end: trade,
            buyDevelopment:
              trade && game.deck.length > 0 && canAfford(self.resources, COSTS.development),
            development:
              active && ['roll', 'trade'].includes(game.phase) && !game.developmentPlayed
                ? [
                    ...new Set(
                      self.development
                        .filter((c) => c.kind !== 'victory' && c.boughtTurn < game.turn)
                        .map((c) => c.kind),
                    ),
                  ]
                : ([] as Development[]),
            ratios: Object.fromEntries(RESOURCES.map((r) => [r, tradeRatio(game, player, r)])),
          }
        : undefined,
    odds: seat ? room.odds : undefined,
    canPause: !!seat?.profileId && room.status === 'playing',
    canResume: !!seat?.profileId && room.status === 'paused',
  };
}
export type RoomView = ReturnType<typeof roomView>;
export type RoomSummary = ReturnType<typeof roomSummary>;
