import type { Room, RoomCommand } from './store.ts';
import {
  BUILD_DURATION_MS,
  CARD_STAGGER_MS,
  DICE_DURATION_MS,
  PRODUCTION_HEX_MS,
  ROBBER_DURATION_MS,
} from './motion-timing.ts';
import {
  cardCount,
  RESOURCES,
  type Action,
  type Cards,
  type Game,
  type VisualEvent,
} from './types.ts';

export const VISUAL_EVENT_LIMIT = 48;
export { DICE_DURATION_MS } from './motion-timing.ts';
type PendingEvent = Omit<VisualEvent, 'id'>;

/** Called within the same transaction as the move; a rejected/retried request emits nothing. */
export function appendVisualEvents(room: Room, events: PendingEvent[]) {
  const previous = room.visualEvents ?? [];
  const prefix = `visual-${room.revision + 1}-`;
  let sequence = previous.reduce(
    (max, event) =>
      event.id.startsWith(prefix) ? Math.max(max, Number(event.id.slice(prefix.length))) : max,
    -1,
  );
  room.visualEvents = [
    ...previous,
    ...events.map((event) => ({
      ...event,
      id: `${prefix}${++sequence}`,
    })),
  ].slice(-VISUAL_EVENT_LIMIT);
}

function positiveDelta(after: Cards, before: Cards): Partial<Cards> {
  return Object.fromEntries(
    RESOURCES.flatMap((resource) => {
      const count = after[resource] - before[resource];
      return count > 0 ? [[resource, count]] : [];
    }),
  );
}
const countResources = (cards: Partial<Cards>) =>
  Object.values(cards).reduce((sum, count) => sum + count, 0);

export function recordActionEvents(
  room: Room,
  before: Game,
  actorId: string,
  action: Action,
  now: number,
) {
  const game = room.game!;
  const player = game.players.findIndex((p) => p.id === actorId);
  const events: PendingEvent[] = [];
  const add = (event: Omit<PendingEvent, 'at'> & { at?: number }) =>
    events.push({ at: now, actorId, ...event });
  const settledAt = action.type === 'roll' ? (room.diceEvent?.at ?? now) + DICE_DURATION_MS : now;
  const spent = () =>
    positiveDelta(before.players[player].resources, game.players[player].resources);

  switch (action.type) {
    case 'settlement':
    case 'city':
      add({ type: action.type, vertex: action.vertex, resources: spent() });
      break;
    case 'road':
      add({ type: 'road', edge: action.edge, resources: spent() });
      break;
    case 'roll':
      add({ type: 'roll', values: game.dice, at: room.diceEvent?.at ?? now });
      break;
    case 'discard':
      add({ type: 'discard', count: cardCount(action.cards) });
      break;
    case 'robber':
      add({ type: 'robber', hex: action.hex, fromHex: before.board.robber });
      if (action.victim !== undefined)
        add({
          type: 'steal',
          targetPlayerId: game.players[action.victim].id,
          count: 1,
          at: now + ROBBER_DURATION_MS,
        });
      break;
    case 'bank-trade':
      add({
        type: 'bank-trade',
        give: positiveDelta(before.players[player].resources, game.players[player].resources),
        receive: positiveDelta(game.players[player].resources, before.players[player].resources),
      });
      break;
    case 'offer':
      add({
        type: 'offer',
        targetPlayerId: action.to === 'all' ? undefined : game.players[action.to].id,
        give: { ...action.give },
        receive: { ...action.receive },
      });
      break;
    case 'accept-trade':
      if (before.offer)
        add({
          type: 'accept-trade',
          targetPlayerId: game.players[before.offer.from].id,
          give: { ...before.offer.receive },
          receive: { ...before.offer.give },
        });
      break;
    case 'cancel-trade':
      add({ type: 'cancel-trade' });
      break;
    case 'buy-development':
      add({ type: 'buy-development', count: 1, resources: spent() });
      break;
    case 'development': {
      const resources =
        action.card === 'plenty' || action.card === 'monopoly'
          ? positiveDelta(game.players[player].resources, before.players[player].resources)
          : undefined;
      add({
        type: 'development',
        card: action.card,
        edges: action.card === 'roads' ? [...action.edges] : undefined,
        resources,
        count: resources ? countResources(resources) : undefined,
      });
      if (action.card === 'roads')
        action.edges.forEach((edge, index) =>
          add({ type: 'road', edge, at: now + CARD_STAGGER_MS * 3 * (index + 1) }),
        );
      break;
    }
    case 'end':
      break;
  }

  // Animate only actual payouts, split by producing hex and receiving player. When one player
  // exhausts a scarce bank resource, allocate that visible payout across their hexes in ID order.
  let productionCompleteAt = settledAt;
  if (
    action.type === 'roll' ||
    (action.type === 'settlement' && before.phase === 'setup-settlement')
  ) {
    const remaining = game.players.map((recipient, index) =>
      positiveDelta(recipient.resources, before.players[index].resources),
    );
    const total = game.dice ? game.dice[0] + game.dice[1] : 0;
    const hexes = game.board.hexes
      .filter(
        (hex) =>
          hex.resource !== 'desert' &&
          (action.type === 'roll'
            ? hex.number === total && hex.id !== game.board.robber
            : action.type === 'settlement' && hex.vertices.includes(action.vertex)),
      )
      .sort((a, b) => a.id - b.id);
    let visit = 0;
    for (const hex of hexes) {
      const resource = hex.resource;
      if (resource === 'desert') continue;
      let paid = false;
      game.players.forEach((recipient, index) => {
        const due =
          action.type === 'roll'
            ? hex.vertices.reduce((sum, vertex) => {
                const building = game.board.vertices[vertex].building;
                return sum + (building?.player === index ? (building.kind === 'city' ? 2 : 1) : 0);
              }, 0)
            : index === player
              ? 1
              : 0;
        const count = Math.min(due, remaining[index][resource] ?? 0);
        if (!count) return;
        remaining[index][resource] = (remaining[index][resource] ?? 0) - count;
        paid = true;
        add({
          type: 'production',
          actorId: recipient.id,
          hex: hex.id,
          hexes: [hex.id],
          resources: { [resource]: count },
          count,
          at:
            action.type === 'roll'
              ? settledAt + visit * PRODUCTION_HEX_MS
              : settledAt + BUILD_DURATION_MS,
        });
      });
      if (paid && action.type === 'roll') visit++;
    }
    productionCompleteAt = settledAt + visit * PRODUCTION_HEX_MS;
  }
  if (before.active !== game.active || before.turn !== game.turn)
    add({ type: 'turn', actorId: game.players[game.active].id, phase: game.phase, at: settledAt });
  if (before.phase !== game.phase)
    add({
      type: 'phase',
      actorId: game.players[game.active].id,
      fromPhase: before.phase,
      phase: game.phase,
      at: productionCompleteAt,
    });
  if (game.winner !== undefined && before.winner === undefined)
    add({
      type: 'finish',
      actorId: game.players[game.winner].id,
      reason: 'winner',
      at: productionCompleteAt + BUILD_DURATION_MS,
    });
  appendVisualEvents(room, events);
}

export function recordCommandEvents(
  room: Room,
  previousStatus: Room['status'],
  actorId: string,
  command: RoomCommand,
  now: number,
) {
  const events: PendingEvent[] = [];
  const add = (event: Omit<PendingEvent, 'at'> & { at?: number }) =>
    events.push({ at: now, actorId, ...event });
  switch (command) {
    case 'start':
      add({ type: 'start' });
      break;
    case 'roll-order':
      add({ type: 'opening-roll', values: room.diceEvent?.values, at: room.diceEvent?.at ?? now });
      if (previousStatus === 'starting' && room.status === 'playing') {
        add({
          type: 'turn',
          actorId: room.game!.players[room.game!.active].id,
          phase: room.game!.phase,
          at: room.opening!.readyAt,
        });
        add({
          type: 'phase',
          actorId: room.game!.players[room.game!.active].id,
          phase: room.game!.phase,
          at: room.opening!.readyAt,
        });
      }
      break;
    case 'pause':
      add({ type: 'pause-request' });
      break;
    case 'approve-pause':
      add({ type: room.status === 'paused' ? 'pause' : 'pause-vote' });
      break;
    case 'decline-pause':
      add({ type: 'pause-declined' });
      break;
    case 'resume':
      add({ type: 'resume' });
      break;
    case 'end-game':
      add({ type: 'finish', reason: 'ended' });
      break;
  }
  if (events.length) appendVisualEvents(room, events);
}
