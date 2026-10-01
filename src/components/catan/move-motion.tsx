'use client';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { DevelopmentArt } from './art';
import { ResourceCard } from './cards';
import {
  DEVELOPMENT_NAMES,
  PLAYER_COLORS,
  RESOURCES,
  type VisualEvent,
  type Resource,
} from '@/lib/catan/types';
import type { RoomView } from '@/lib/catan/view';
import {
  CARD_FLIGHT_MS,
  CARD_STAGGER_MS,
  DEVELOPMENT_REVEAL_MS,
  DICE_DURATION_MS,
  MOVE_NOTICE_MS,
  PRODUCTION_CAMERA_MS,
  PRODUCTION_HEX_MS,
  VISUAL_EVENT_WINDOW_MS,
} from '@/lib/catan/motion-timing';
import { useAnimationDelay } from './table-motion';
import './move-motion.css';

const phaseLabels = {
  'setup-settlement': 'Choose a settlement site',
  'setup-road': 'Connect your settlement',
  roll: 'Roll the dice to begin',
  discard: 'Choose cards to return',
  robber: 'Move the robber',
  trade: 'Trade, build, or play a card',
  finished: 'The island is complete',
};
const names = {
  start: 'The island is taking shape',
  'opening-roll': 'Rolling for first player',
  settlement: 'Built a settlement',
  road: 'Built a road',
  city: 'Upgraded to a city',
  roll: 'Rolled the dice',
  production: 'Collected resources',
  discard: 'Returned cards to the bank',
  robber: 'Moved the robber',
  steal: 'Stole a resource card',
  'bank-trade': 'Traded with the bank',
  offer: 'Offered a trade',
  'accept-trade': 'Trade completed',
  'cancel-trade': 'Withdrew the offer',
  'buy-development': 'Drew a development card',
  development: 'Played a development card',
  turn: 'Your next move',
  phase: 'A new phase',
  'pause-request': 'Requested a pause',
  'pause-vote': 'Agreed to pause',
  'pause-declined': 'Keep playing',
  pause: 'Game saved',
  resume: 'Back to the island',
  finish: 'The game is complete',
} satisfies Record<VisualEvent['type'], string>;

export function PhaseTrack({ room, now }: { room: RoomView; now: number }) {
  const game = room.game!;
  const setup = game.phase.startsWith('setup');
  const diceEnd = game.dice && room.diceEvent ? room.diceEvent.at + DICE_DURATION_MS : 0;
  const roll = room.visualEvents.findLast(
    (event) => event.type === 'roll' && event.at === room.diceEvent?.at,
  );
  const rollPrefix = roll?.id.slice(0, roll.id.lastIndexOf('-') + 1);
  const collectionEnd = Math.max(
    diceEnd,
    ...room.visualEvents
      .filter(
        (event) => event.type === 'production' && rollPrefix && event.id.startsWith(rollPrefix),
      )
      .map((event) => event.at + PRODUCTION_HEX_MS),
  );
  const middle =
    game.phase === 'discard' ? 'Discard' : game.phase === 'robber' ? 'Move robber' : 'Collect';
  const steps =
    room.status === 'starting'
      ? ['Reveal island', 'Roll for order', 'Place pieces']
      : setup
        ? ['Place settlement', 'Connect a road', 'Next founder']
        : ['Roll', middle, 'Trade & build'];
  const index =
    room.status === 'starting'
      ? room.opening?.rolls.length
        ? 1
        : 0
      : setup
        ? game.phase === 'setup-road'
          ? 1
          : 0
        : game.phase === 'roll' || now < diceEnd
          ? 0
          : ['discard', 'robber'].includes(game.phase) || now < collectionEnd
            ? 1
            : 2;
  const stopped = ['paused', 'ended', 'finished'].includes(room.status);
  return (
    <div className="ct-phase-track" aria-label="Turn progress">
      {steps.map((step, i) => (
        <span
          key={step}
          className={!stopped && i === index ? 'ct-phase-active' : ''}
          aria-current={!stopped && i === index ? 'step' : undefined}
        >
          <i>{i + 1}</i>
          {step}
        </span>
      ))}
      <span className="ct-phase-caption" key={`${room.status}-${game.active}-${game.phase}`}>
        {room.status === 'paused'
          ? 'Saved · ready when you are'
          : room.status === 'ended'
            ? 'Table closed'
            : game.phase === 'finished'
              ? 'Island complete'
              : game.phase === 'discard'
                ? 'Seven · choose cards to return'
                : game.phase === 'robber'
                  ? 'Move the robber'
                  : `Turn ${game.turn}`}
      </span>
    </div>
  );
}

type Flight = {
  from: string;
  to: string;
  resource?: Resource;
  development?: boolean;
  fallback?: string;
  offset: number;
};
function flightsFor(event: VisualEvent): Flight[] {
  const actor = `[data-player-id="${event.actorId}"]`;
  const target = `[data-player-id="${event.targetPlayerId}"]`;
  const bank = '[data-motion-bank]';
  const board = '.ct-island-stage';
  const cards = (from: string, to: string, values?: Partial<Record<Resource, number>>) =>
    RESOURCES.flatMap((r) => Array.from({ length: Math.min(values?.[r] ?? 0, 2) }, () => r))
      .slice(0, 6)
      .map((resource, offset) => ({ from, to, resource, offset }));
  switch (event.type) {
    case 'production':
      return RESOURCES.flatMap((resource) =>
        Array.from({ length: Math.min(event.resources?.[resource] ?? 0, 6) }, (_, offset) => ({
          from: event.hex === undefined ? board : `[data-motion-hex="${event.hex}"]`,
          fallback: board,
          to: actor,
          resource,
          offset,
        })),
      );
    case 'bank-trade':
      return [
        ...cards(actor, bank, event.give),
        ...cards(bank, actor, event.receive).map((f) => ({ ...f, offset: f.offset + 3 })),
      ];
    case 'accept-trade':
      return [
        ...cards(actor, target, event.give),
        ...cards(target, actor, event.receive).map((f) => ({ ...f, offset: f.offset + 3 })),
      ];
    case 'buy-development':
      return [
        ...cards(actor, bank, event.resources),
        { from: '[data-motion-deck]', to: actor, development: true, offset: 3 },
      ];
    case 'development':
      return event.card === 'plenty'
        ? cards(bank, actor, event.resources).map((f) => ({ ...f, offset: f.offset + 5 }))
        : [];
    case 'discard':
      return Array.from({ length: Math.min(event.count ?? 1, 4) }, (_, offset) => ({
        from: actor,
        to: bank,
        offset,
      }));
    case 'steal':
      return [{ from: target, to: actor, offset: 0 }];
    case 'settlement':
    case 'road':
    case 'city':
      return cards(actor, bank, event.resources);
    default:
      return [];
  }
}

function CardFlight({ flight, at, now }: { flight: Flight; at: number; now: number }) {
  const [points, setPoints] = useState<{ x: number; y: number; dx: number; dy: number }>();
  const delay = useAnimationDelay(at, now);
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      const source =
        document.querySelector(flight.from) ??
        (flight.fallback ? document.querySelector(flight.fallback) : null);
      let from = source?.getBoundingClientRect();
      if (!from || (!from.width && !from.height))
        from = document.querySelector(flight.fallback ?? '.ct-supplies')?.getBoundingClientRect();
      const to = document.querySelector(flight.to)?.getBoundingClientRect();
      if (from && to)
        setPoints({
          x: from.x + from.width / 2,
          y: from.y + from.height / 2,
          dx: to.x + to.width / 2 - from.x - from.width / 2,
          dy: to.y + to.height / 2 - from.y - from.height / 2,
        });
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    schedule();
    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('scroll', schedule, { passive: true, capture: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
    };
  }, [flight.from, flight.to, flight.fallback]);
  if (!points) return null;
  return (
    <div
      aria-hidden="true"
      className="ct-resource-flight"
      style={
        {
          left: points.x,
          top: points.y,
          '--flight-x': `${points.dx}px`,
          '--flight-y': `${points.dy}px`,
          '--elapsed': `${delay + flight.offset * CARD_STAGGER_MS}ms`,
          '--motion-duration': `${CARD_FLIGHT_MS}ms`,
        } as CSSProperties
      }
    >
      {flight.development ? (
        <DevelopmentArt kind="back" />
      ) : (
        <ResourceCard kind={flight.resource ?? 'back'} />
      )}
    </div>
  );
}

function MotionSurface({
  at,
  now,
  duration,
  className,
  style,
  eventType,
  hidden,
  children,
}: {
  at: number;
  now: number;
  duration: number;
  className: string;
  style?: CSSProperties;
  eventType?: VisualEvent['type'];
  hidden?: boolean;
  children: ReactNode;
}) {
  const delay = useAnimationDelay(at, now);
  return (
    <div
      className={className}
      data-motion-event={eventType}
      aria-hidden={hidden}
      style={
        {
          ...style,
          '--elapsed': `${delay}ms`,
          '--motion-duration': `${duration}ms`,
        } as CSSProperties
      }
    >
      {children}
    </div>
  );
}

function VictoryConfetti({ event, now }: { event: VisualEvent; now: number }) {
  const delay = useAnimationDelay(event.at, now);
  return (
    <div className="ct-victory-confetti" aria-hidden="true">
      {Array.from({ length: 22 }, (_, i) => (
        <i
          key={i}
          style={
            {
              '--confetti-x': `${(i * 37) % 100}vw`,
              '--confetti-r': `${i * 53}deg`,
              '--elapsed': `${delay + i * 16}ms`,
              '--motion-duration': '1800ms',
              background: PLAYER_COLORS[i % 6],
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

export function MoveMotion({ room, now }: { room: RoomView; now: number }) {
  const events = room.visualEvents.filter(
    (e) => now >= e.at && now < e.at + VISUAL_EVENT_WINDOW_MS,
  );
  // Many players can collect on one roll. Keep the notification concise while every hand gets its flight.
  const currentPlayer = room.game?.players[room.game.active]?.id;
  const notices = events.filter(
    (e) =>
      now < e.at + MOVE_NOTICE_MS &&
      (e.type !== 'phase' || (e.phase === room.game?.phase && e.actorId === currentPlayer)) &&
      (e.type !== 'turn' || e.actorId === currentPlayer),
  );
  const event =
    notices.findLast(
      (e) => !['phase', 'production', 'roll', 'opening-roll', 'pause-vote'].includes(e.type),
    ) ?? notices.at(-1);
  const player = room.game?.players.find((p) => p.id === event?.actorId);
  const label = event
    ? event.type === 'development' && event.card
      ? `Played ${DEVELOPMENT_NAMES[event.card]}`
      : names[event.type]
    : '';
  return (
    <>
      <div className="ct-move-announcer" aria-live="polite" aria-atomic="true">
        {event && (
          <MotionSurface
            key={event.id}
            at={event.at}
            now={now}
            duration={MOVE_NOTICE_MS}
            className={`ct-move-toast ct-move-${event.type}`}
            eventType={event.type}
            style={
              {
                '--event-color': PLAYER_COLORS[player?.color ?? 0],
              } as CSSProperties
            }
          >
            <span className="ct-move-seal">
              {event.type === 'finish'
                ? '★'
                : event.type === 'pause'
                  ? 'Ⅱ'
                  : event.type === 'steal' || event.type === 'robber'
                    ? '♟'
                    : event.type === 'bank-trade' || event.type === 'accept-trade'
                      ? '⇄'
                      : '✦'}
            </span>
            <span>
              <strong>
                {event.type === 'finish' && event.reason === 'winner' && player
                  ? `${player.name} wins!`
                  : event.type === 'phase' && event.phase
                    ? phaseLabels[event.phase]
                    : event.type === 'turn' && player
                      ? `${player.name}’s turn`
                      : label}
              </strong>
              <small>
                {event.type === 'turn' && event.phase
                  ? phaseLabels[event.phase]
                  : (player?.name ?? room.name)}
              </small>
            </span>
          </MotionSurface>
        )}
      </div>
      {events.flatMap((e) => {
        const at = e.at + (e.type === 'production' ? PRODUCTION_CAMERA_MS : 0);
        if (now < at) return [];
        return flightsFor(e).map((flight, i) => (
          <CardFlight key={`${e.id}-${i}`} flight={flight} at={at} now={now} />
        ));
      })}
      {events
        .filter((e) => e.type === 'development' && e.card)
        .map((e) => (
          <MotionSurface
            key={e.id}
            at={e.at}
            now={now}
            duration={DEVELOPMENT_REVEAL_MS}
            className="ct-development-reveal"
            hidden
          >
            <DevelopmentArt kind={e.card!} />
          </MotionSurface>
        ))}
      {events
        .filter((e) => e.type === 'finish' && e.reason === 'winner')
        .map((e) => (
          <VictoryConfetti key={e.id} event={e} now={now} />
        ))}
    </>
  );
}
