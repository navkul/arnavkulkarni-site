'use client';
import { useEffect, useState, type CSSProperties } from 'react';
import { AwardCard } from './cards';
import { PLAYER_COLORS } from '@/lib/catan/types';
import type { RoomView } from '@/lib/catan/view';

export function useTableClock(serverNow: number, animateUntil: number) {
  const [clock, setClock] = useState(() => Date.now());
  const [sync, setSync] = useState(() => ({ serverNow, local: Date.now() }));
  if (sync.serverNow !== serverNow) setSync({ serverNow, local: clock });
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const localNow = Date.now();
      setClock(localNow);
      const time = sync.serverNow + localNow - sync.local;
      timer = setTimeout(tick, time < animateUntil ? 32 : 500);
    };
    timer = setTimeout(tick, 32);
    return () => clearTimeout(timer);
  }, [animateUntil, sync]);
  return sync.serverNow + Math.max(0, clock - sync.local);
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
  if (!event || now < event.at || now > event.at + 6500) return null;
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
          '--elapsed': `${-(now - event.at)}ms`,
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
  const [flight, setFlight] = useState<{ x: number; y: number; dx: number; dy: number }>();
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
  if (!flight || now < event.at || now >= event.at + 2600) return null;
  return (
    <div
      className="ct-award-flight"
      style={
        {
          left: flight.x,
          top: flight.y,
          '--dx': `${flight.dx}px`,
          '--dy': `${flight.dy}px`,
          animationDelay: `${-(now - event.at)}ms`,
        } as CSSProperties
      }
    >
      <AwardCard kind={event.kind} />
    </div>
  );
}
