import { ServiceError, type Room } from './store.ts';
import type { Action, Game } from './types.ts';

export const DICE_LEAD_MS = 1900;
export const DICE_DURATION_MS = 1800;
export function beginOpening(room: Room, now: number) {
  room.status = 'starting';
  room.opening = {
    revealAt: now + 3000,
    readyAt: now + 8500,
    round: 1,
    contenders: room.seats.map((s) => s.id),
    rolls: [],
  };
}
export function rollOpening(room: Room, playerId: string, random: () => number, now: number) {
  const opening = room.opening;
  if (room.status !== 'starting' || !opening || !room.game)
    throw new ServiceError('The opening rolls are already complete.');
  if (now < opening.readyAt) throw new ServiceError('Wait for the island and dice to settle.');
  const rolled = opening.rolls.filter((r) => r.round === opening.round);
  const next = opening.contenders.find((id) => !rolled.some((r) => r.playerId === id));
  if (next !== playerId) throw new ServiceError('Wait for your opening roll.');
  const values: [number, number] = [1 + Math.floor(random() * 6), 1 + Math.floor(random() * 6)];
  const result = { playerId, values, round: opening.round };
  opening.rolls.push(result);
  room.diceEvent = {
    id: `opening-${opening.round}-${playerId}`,
    playerId,
    color:
      room.seats.find((s) => s.id === playerId)!.color ??
      room.seats.findIndex((s) => s.id === playerId),
    values,
    at: now + DICE_LEAD_MS,
  };
  opening.readyAt = room.diceEvent.at + DICE_DURATION_MS;
  const completed = [...rolled, result];
  if (completed.length < opening.contenders.length) return;
  const highest = Math.max(...completed.map((r) => r.values[0] + r.values[1]));
  const tied = completed
    .filter((r) => r.values[0] + r.values[1] === highest)
    .map((r) => r.playerId);
  if (tied.length > 1) {
    opening.contenders = tied;
    opening.round++;
    return;
  }
  opening.winner = tied[0];
  // Seating is clockwise; rotate it, never shuffle it. The engine handles the reverse second round.
  const first = room.seats.findIndex((s) => s.id === opening.winner);
  room.seats = [...room.seats.slice(first), ...room.seats.slice(0, first)];
  room.game.players = [...room.game.players.slice(first), ...room.game.players.slice(0, first)];
  room.status = 'playing';
}
export function recordVisuals(
  room: Room,
  before: Game,
  playerId: string,
  action: Action,
  now: number,
) {
  const game = room.game!;
  if (action.type === 'roll' && game.dice) {
    room.diceEvent = {
      id: `roll-${room.revision + 1}`,
      playerId,
      color: game.players.find((p) => p.id === playerId)!.color ?? game.active,
      values: game.dice,
      at: now + DICE_LEAD_MS,
    };
  }
  const events = (room.awardEvents ?? []).filter((e) => now - e.at < 15000);
  for (const kind of ['longestRoad', 'largestArmy'] as const) {
    const winner = game[kind];
    if (winner !== undefined && winner !== before[kind])
      events.push({
        id: `${kind}-${room.revision + 1}`,
        kind,
        playerId: game.players[winner].id,
        at: now + DICE_LEAD_MS,
      });
  }
  room.awardEvents = events;
}
