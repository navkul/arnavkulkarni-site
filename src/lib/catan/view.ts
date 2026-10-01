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
import { owns, controlledSeat, type Identity, type Room } from './store.ts';
import { DICE_DURATION_MS } from './table-flow.ts';
import { testControlsAvailable } from './testing-mode.ts';

export function roomSummary(room: Room, identity: Identity) {
  return {
    code: room.code,
    name: room.name,
    capacity: room.capacity,
    hosting: room.hosting ?? 'server',
    winProbability: room.winProbability !== false,
    players: room.seats.length,
    status: room.status,
    mine: room.seats.some((s) => owns(identity, s)),
    updatedAt: room.updatedAt,
  };
}
export function roomView(room: Room, identity: Identity) {
  const owner = room.seats.find((s) => owns(identity, s));
  const seat = controlledSeat(room, identity);
  const player = room.game?.players.findIndex((p) => p.id === seat?.id) ?? -1;
  const game = room.game;
  const self = player >= 0 ? game?.players[player] : undefined;
  const active =
    !!game &&
    game.active === player &&
    room.status === 'playing' &&
    (!room.opening || Date.now() >= room.opening.readyAt);
  const trade = active && game?.phase === 'trade';
  const publicId = (id: string) => {
    const index = room.seats.findIndex((s) => s.id === id);
    return `seat-${room.seats[index]?.color ?? index}`;
  };
  return {
    code: room.code,
    name: room.name,
    capacity: room.capacity,
    hosting: room.hosting ?? 'server',
    winProbability: room.winProbability !== false,
    status: room.status,
    revision: room.revision,
    serverNow: Date.now(),
    opening:
      seat && room.opening
        ? {
            ...room.opening,
            contenders: room.opening.contenders.map(publicId),
            winner: room.opening.winner ? publicId(room.opening.winner) : undefined,
            rolls: room.opening.rolls.map((r) => ({ ...r, playerId: publicId(r.playerId) })),
          }
        : undefined,
    diceEvent:
      seat && room.diceEvent
        ? {
            ...room.diceEvent,
            id: `dice-${room.diceEvent.at}`,
            playerId: publicId(room.diceEvent.playerId),
          }
        : undefined,
    awardEvents: seat
      ? (room.awardEvents ?? []).map((e) => ({ ...e, playerId: publicId(e.playerId) }))
      : [],
    visualEvents: seat
      ? (room.visualEvents ?? []).map((event) => ({
          ...event,
          actorId: event.actorId ? publicId(event.actorId) : undefined,
          targetPlayerId: event.targetPlayerId ? publicId(event.targetPlayerId) : undefined,
        }))
      : [],
    pauseRequest:
      seat && room.pauseRequest
        ? {
            id: room.pauseRequest.id,
            by: room.seats.find((s) => s.id === room.pauseRequest!.by)?.name,
            votes: room.pauseRequest.votes.length,
            agreed: room.pauseRequest.votes.includes(seat.id),
          }
        : undefined,
    mySounds: owner && seat?.id === owner.id ? (owner.sounds ?? []) : [],
    soundEvents: seat
      ? (room.soundEvents ?? [])
          .filter((event) => event.at > Date.now() - 15000)
          .map((event) => ({ ...event, playerId: publicId(event.playerId) }))
      : [],
    createdAt: room.createdAt,
    startedAt: room.startedAt,
    finishedAt: room.finishedAt,
    isHost: !!owner && owner.id === room.host,
    testing: testControlsAvailable(room),
    practice: !!room.practice,
    joined: !!seat,
    me: player,
    seats: room.seats.map((s, i) => ({
      id: publicId(s.id),
      color: s.color ?? i,
      colorLocked: !!s.colorLocked,
      name: s.name,
      avatarUrl: s.avatarUrl,
      registered: !!s.profileId,
      controllable: s.id === room.host || !!s.simulated,
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
              id: publicId(p.id),
              color: p.color ?? i,
              name: p.name,
              avatarUrl: room.seats.find((seat) => seat.id === p.id)?.avatarUrl,
              registered: !!p.profileId,
              resourcesCount: cardCount(p.resources),
              developmentCount: p.development.length,
              knights: p.knights,
              playedDevelopment: p.playedDevelopment ?? [],
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
            roll:
              active &&
              game.phase === 'roll' &&
              (!room.diceEvent || Date.now() >= room.diceEvent.at + DICE_DURATION_MS),
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
    canEnd:
      !!owner && owner.id === room.host && ['starting', 'playing', 'paused'].includes(room.status),
    canPause: !!seat && room.status === 'playing' && !room.pauseRequest,
    canResume: !!seat && room.status === 'paused',
  };
}
export type RoomView = ReturnType<typeof roomView>;
export type RoomSummary = ReturnType<typeof roomSummary>;
