'use client';
import { useEffect, useState, type CSSProperties } from 'react';
import { AwardCard } from './cards';
import { PLAYER_COLORS } from '@/lib/catan/types';
import type { RoomView } from '@/lib/catan/view';
import { AWARD_DURATION_MS, DICE_DURATION_MS, DICE_VISIBLE_MS } from '@/lib/catan/motion-timing';

export function useTableClock(serverNow: number, animateUntil: number) {
  const [clock, setClock] = useState(serverNow);
  useEffect(() => {
    const receivedAt = performance.now();
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const time = serverNow + performance.now() - receivedAt;
      setClock(time);
      // CSS and Three.js advance on their own render clocks; React only updates phase boundaries.
      timer = setTimeout(tick, time < animateUntil && !document.hidden ? 100 : 500);
    };
    timer = setTimeout(tick, 0);
    return () => clearTimeout(timer);
  }, [animateUntil, serverNow]);
  return Math.max(serverNow, clock);
}

/** Capture the server timeline once; letting CSS run avoids repainting/re-seeking every React tick. */
export function useAnimationDelay(at: number, now: number) {
  const [start, setStart] = useState({ at, delay: at - now });
  if (start.at !== at) setStart({ at, delay: at - now });
  return start.at === at ? start.delay : at - now;
}
const rotations: Record<number, string> = {
  1: 'rotateX(0deg) rotateY(0deg)',
  2: 'rotateX(0deg) rotateY(-90deg)',
  3: 'rotateX(-90deg) rotateY(0deg)',
  4: 'rotateX(90deg) rotateY(0deg)',
  5: 'rotateX(0deg) rotateY(90deg)',
  6: 'rotateX(0deg) rotateY(180deg)',
};
const pips: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};
export function TableDice({ room, now }: { room: RoomView; now: number }) {
  const event = room.diceEvent;
  if (!event || now < event.at || now > event.at + DICE_VISIBLE_MS) return null;
  return <DiceStage key={event.id} room={room} now={now} />;
}
function DiceStage({ room, now }: { room: RoomView; now: number }) {
  const event = room.diceEvent!;
  const delay = useAnimationDelay(event.at, now);
  const player = room.game!.players.find((p) => p.id === event.playerId)!;
  return (
    <div
      key={event.id}
      className="ct-dice-stage"
      role="status"
      aria-label={`${player.name} rolled ${event.values.join(' and ')}`}
      style={
        {
          '--dice-color': PLAYER_COLORS[event.color],
          '--elapsed': `${delay}ms`,
          '--dice-duration': `${DICE_DURATION_MS}ms`,
          '--dice-caption-duration': `${DICE_DURATION_MS + 150}ms`,
        } as CSSProperties
      }
    >
      <div className="ct-dice-throw">
        {event.values.map((value, i) => (
          <div key={i} className={`ct-die-flight ct-die-flight-${i}`}>
            <div className="ct-cube" style={{ '--rest': rotations[value] } as CSSProperties}>
              {[1, 2, 3, 4, 5, 6].map((face) => (
                <div key={face} className={`ct-cube-face ct-cube-face-${face}`}>
                  {Array.from({ length: 9 }, (_, j) => (
                    <i key={j} className={pips[face].includes(j) ? 'ct-pip' : ''} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <span className="ct-dice-result">
        {player.name} · {event.values[0] + event.values[1]}
      </span>
    </div>
  );
}

export function AwardFlight({
  event,
  now,
}: {
  event: RoomView['awardEvents'][number];
  now: number;
}) {
  if (now < event.at || now >= event.at + AWARD_DURATION_MS) return null;
  return <AwardTransfer key={event.id} event={event} now={now} />;
}
function AwardTransfer({ event, now }: { event: RoomView['awardEvents'][number]; now: number }) {
  const [flight, setFlight] = useState<{ x: number; y: number; dx: number; dy: number }>();
  const delay = useAnimationDelay(event.at, now);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const source = document
        .querySelector(`[data-award-source="${event.kind}"]`)
        ?.getBoundingClientRect();
      const target = document
        .querySelector(`[data-award-player="${event.playerId}-${event.kind}"]`)
        ?.getBoundingClientRect();
      if (source && target)
        setFlight({ x: source.x, y: source.y, dx: target.x - source.x, dy: target.y - source.y });
    });
    return () => cancelAnimationFrame(frame);
  }, [event.kind, event.playerId]);
  if (!flight) return null;
  return (
    <div
      className="ct-award-flight"
      style={
        {
          left: flight.x,
          top: flight.y,
          '--dx': `${flight.dx}px`,
          '--dy': `${flight.dy}px`,
          animationDelay: `${delay}ms`,
          '--motion-duration': `${AWARD_DURATION_MS}ms`,
        } as CSSProperties
      }
    >
      <AwardCard kind={event.kind} />
    </div>
  );
}
