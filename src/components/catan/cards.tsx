import type { CSSProperties } from 'react';
import { DevelopmentArt, TerrainArt } from './art';
import { DEVELOPMENT_NAMES, type Resource, type Development } from '@/lib/catan/types';

export const RESOURCE_INK: Record<Resource, string> = {
  wood: '#406e54',
  brick: '#b9694b',
  sheep: '#91a660',
  wheat: '#ce9d3f',
  ore: '#657b88',
};
export function ResourceIcon({ kind }: { kind: Resource | 'any' }) {
  return (
    <g aria-hidden="true" strokeLinejoin="round">
      {kind === 'wood' && (
        <>
          <path d="M-6 10V-3M7 12V0" stroke="#78523b" strokeWidth="5" />
          <path d="M-6-19L-18 4H6ZM7-12L-3 8H18Z" fill="#447452" stroke="#e4e6b0" />
        </>
      )}
      {kind === 'brick' && (
        <>
          <path d="M-18 0L3-10 19-2-3 9Z" fill="#e3a578" stroke="#824c38" />
          <path d="M-18 0V10L-3 18V9Z" fill="#a8553b" />
          <path d="M-3 9L19-2V8L-3 18Z" fill="#c77952" />
          <path d="M-13-10L4-17 16-11-1-3Z" fill="#f1bb8b" stroke="#824c38" />
        </>
      )}
      {kind === 'sheep' && (
        <>
          <path d="M-10 7V16M8 7V16" stroke="#525244" strokeWidth="3" />
          <path
            d="M-15 5Q-24-7-12-10Q-9-22 2-13Q15-18 17-6Q24 6 11 10Q-4 18-15 5"
            fill="#fff9df"
            stroke="#8c9777"
          />
          <ellipse cx="16" cy="3" rx="6" ry="8" fill="#525244" />
          <circle cx="18" cy="1" r="1.2" fill="#fff9df" />
        </>
      )}
      {kind === 'wheat' && (
        <>
          <path d="M0 20V-19" stroke="#865f2a" strokeWidth="2" />
          {[-10, 0, 10].map((y) => (
            <g key={y}>
              <ellipse
                cx="-6"
                cy={y}
                rx="4"
                ry="8"
                fill="#f4ce6b"
                stroke="#aa7c34"
                transform={`rotate(-35 -6 ${y})`}
              />
              <ellipse
                cx="6"
                cy={y - 4}
                rx="4"
                ry="8"
                fill="#ffe3a0"
                stroke="#aa7c34"
                transform={`rotate(35 6 ${y - 4})`}
              />
            </g>
          ))}
        </>
      )}
      {kind === 'ore' && (
        <>
          <path
            d="M-19 8L-8-12 5-17 19-1 12 17-10 18Z"
            fill="#a2b2b4"
            stroke="#536b77"
            strokeWidth="2"
          />
          <path d="M-8-12L0 4 19-1M0 4L-10 18M0 4L12 17" stroke="#536b77" strokeWidth="2" />
          <path d="M5-17L0 4-8-12Z" fill="#dae1d5" />
        </>
      )}
      {kind === 'any' && (
        <>
          <path
            d="M0-20L18-10V11L0 21-18 11V-10Z"
            fill="#286579"
            stroke="#f4deb0"
            strokeWidth="2"
          />
          <path d="M-10 0H10M0-10V10" stroke="#fdfce8" strokeWidth="3" />
        </>
      )}
    </g>
  );
}
export function ResourceCard({ kind }: { kind: Resource | 'back' }) {
  return (
    <svg viewBox="0 0 120 150" className="ct-card-art" aria-hidden="true">
      <rect
        x="2"
        y="2"
        width="116"
        height="146"
        rx="9"
        fill="#faf3da"
        stroke="#c4b18b"
        strokeWidth="2"
      />
      <rect
        x="9"
        y="9"
        width="102"
        height="132"
        rx="5"
        fill={kind === 'back' ? '#406b81' : RESOURCE_INK[kind]}
      />
      {kind === 'back' ? (
        <>
          <path d="M16 24L60 12 104 24V126L60 138 16 126Z" stroke="#a8c5c8" fill="none" />
          <g transform="translate(60 75) scale(1.7)">
            <ResourceIcon kind="any" />
          </g>
        </>
      ) : (
        <>
          <svg x="12" y="12" width="96" height="70" viewBox="-60 -50 120 90">
            <TerrainArt kind={kind} />
          </svg>
          <path d="M12 89Q60 67 108 89V136H12Z" fill="#f7e9c4" />
          <g transform="translate(60 107)">
            <ResourceIcon kind={kind} />
          </g>
          <path d="M18 129H38M82 129H102" stroke={RESOURCE_INK[kind]} />
        </>
      )}
    </svg>
  );
}
export function CardStack({
  count,
  resource,
  development,
  label,
  small = false,
  showEmpty = false,
}: {
  count: number;
  resource?: Resource | 'back';
  development?: Development | 'back';
  label: string;
  small?: boolean;
  showEmpty?: boolean;
}) {
  if (!count && !showEmpty) return null;
  return (
    <span
      className={`ct-card-stack ${small ? 'ct-card-stack-small' : ''}`}
      role="img"
      aria-label={`${count} ${label}`}
      title={`${count} ${label}`}
      style={{ '--stack-depth': Math.max(0, Math.min(count - 1, 4)) } as CSSProperties}
    >
      {Array.from({ length: Math.max(1, Math.min(count, 5)) }, (_, i) => (
        <span key={i} className="ct-stack-layer" style={{ '--layer': i } as CSSProperties}>
          {resource ? (
            <ResourceCard kind={resource} />
          ) : (
            <DevelopmentArt kind={development ?? 'back'} />
          )}
        </span>
      ))}
      <b className="ct-card-count">{count}</b>
    </span>
  );
}
export function PieceArt({
  kind,
  color = '#287eb2',
}: {
  kind: 'road' | 'settlement' | 'city';
  color?: string;
}) {
  return (
    <svg viewBox="0 0 70 64" aria-hidden="true" className="ct-piece-art">
      <ellipse cx="35" cy="53" rx="28" ry="6" fill="#283e48" opacity=".12" />
      <g fill={color} stroke="#fdf4dd" strokeWidth="1.5" strokeLinejoin="round">
        {kind === 'road' ? (
          <>
            <path d="M8 35L49 14 61 23 20 45Z" />
            <path d="M20 45L61 23V35L20 57Z" />
            <path d="M8 35L20 45V57L8 46Z" />
          </>
        ) : kind === 'settlement' ? (
          <>
            <path d="M12 31L27 13 45 20 58 39V53L34 59 12 47Z" />
            <path d="M12 31L34 40 45 20M34 40V59" fill="none" />
            <path d="M27 13L45 20 34 40 12 31Z" fill="#fff" opacity=".18" />
          </>
        ) : (
          <>
            <path d="M8 31L20 13 33 20V33L43 17 60 30V49L31 59 8 49Z" />
            <path d="M8 31L20 39 33 33M20 39V54M43 17V43L60 30M43 43V55" fill="none" />
          </>
        )}
      </g>
    </svg>
  );
}
export function VictoryPoints({ points }: { points: number }) {
  return (
    <svg viewBox="0 0 48 54" className="ct-vp" role="img" aria-label={`${points} victory points`}>
      <path
        d="M24 2L45 11V30Q42 44 24 52Q6 44 3 30V11Z"
        fill="#f2dda0"
        stroke="#bc9a4f"
        strokeWidth="2"
      />
      <path d="M12 14L18 20 24 12 30 20 36 14V27H12Z" fill="#ba9540" />
      <text x="24" y="42" textAnchor="middle" fill="#55472b" fontSize="19" fontWeight="700">
        {points}
      </text>
    </svg>
  );
}
export const AWARD_NAMES = { longestRoad: 'Longest road', largestArmy: 'Largest army' };
export function AwardCard({
  kind,
  small = false,
}: {
  kind: keyof typeof AWARD_NAMES;
  small?: boolean;
}) {
  return (
    <span
      className={`ct-award-card ${small ? 'ct-award-small' : ''}`}
      role="img"
      aria-label={`${AWARD_NAMES[kind]}, 2 victory points`}
      title={AWARD_NAMES[kind]}
    >
      <DevelopmentArt kind={kind === 'longestRoad' ? 'roads' : 'knight'} />
      <span className="ct-award-ribbon">{small ? '2' : AWARD_NAMES[kind]}</span>
      {!small && <b className="ct-award-points">2</b>}
    </span>
  );
}
export function PlayedCard({ kind }: { kind: Development }) {
  return (
    <span
      className="ct-played-mini"
      role="img"
      aria-label={`Played ${DEVELOPMENT_NAMES[kind]}`}
      title={DEVELOPMENT_NAMES[kind]}
    >
      <DevelopmentArt kind={kind} />
    </span>
  );
}
