'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import Image from 'next/image';
import { AwardArt, CardBackArt, DevelopmentArt, IllustratedCard, TerrainArt } from './art';
import './cards-art.css';
import { DEVELOPMENT_NAMES, type Resource, type Development } from '@/lib/catan/types';

export const RESOURCE_INK: Record<Resource, string> = {
  wood: '#406e54',
  brick: '#b9694b',
  sheep: '#687c45',
  wheat: '#a27a32',
  ore: '#657b88',
};
export function ResourceIcon({ kind }: { kind: Resource | 'any' }) {
  return (
    <g aria-hidden="true" strokeLinejoin="round">
      {kind === 'wood' && (
        <>
          <path d="M-17 3L8-14 19-9-5 10Z" fill="#aa7950" stroke="#63482f" />
          <path d="M-5 10L19-9V0L-5 19Z" fill="#775135" stroke="#63482f" />
          <ellipse cx="-11" cy="11" rx="8" ry="9" fill="#e6c38b" stroke="#785839" />
          <ellipse cx="-11" cy="11" rx="4.5" ry="5.5" fill="none" stroke="#ac8350" />
          <ellipse cx="-11" cy="11" rx="1.5" ry="2" fill="#ac8350" />
          <path d="M-15-6L7-20 17-14-5 2Z" fill="#b48655" stroke="#67492f" />
          <ellipse cx="-10" cy="-2" rx="7" ry="7" fill="#efd29b" stroke="#785839" />
          <ellipse cx="-10" cy="-2" rx="3.5" ry="4" fill="none" stroke="#ac8350" />
          <path d="M0-7L12-15M4 6L15-2" stroke="#d2aa72" />
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
          <path
            d="M-8-12L0 4 19-1M0 4L-10 18M0 4L12 17"
            fill="none"
            stroke="#536b77"
            strokeWidth="2"
          />
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
  if (kind === 'back') return <CardBackArt resource />;
  const title = { wood: 'Lumber', brick: 'Brick', sheep: 'Wool', wheat: 'Grain', ore: 'Ore' }[kind];
  const land = {
    wood: 'From the forest',
    brick: 'From the hills',
    sheep: 'From the pasture',
    wheat: 'From the fields',
    ore: 'From the mountains',
  }[kind];
  return (
    <IllustratedCard title={title} category="Resource" accent={RESOURCE_INK[kind]} footer={land}>
      <svg
        x="9"
        y="29"
        width="102"
        height="93"
        viewBox="-62 -56 124 113"
        preserveAspectRatio="xMidYMid slice"
      >
        <TerrainArt kind={kind} />
      </svg>
      <path d="M11 102Q60 83 109 103V124H11Z" fill="#23372c" opacity=".25" />
      <ellipse cx="60" cy="110" rx="24" ry="5" fill="#263b2c" opacity=".23" />
      <g transform="translate(60 92) scale(1.32)">
        <ResourceIcon kind={kind} />
      </g>
    </IllustratedCard>
  );
}
export function CardStack({
  count,
  resource,
  development,
  label,
  small = false,
  showEmpty = false,
  onSelect,
  selected = false,
  disabled = false,
  actionLabel,
}: {
  count: number;
  resource?: Resource | 'back';
  development?: Development | 'back';
  label: string;
  small?: boolean;
  showEmpty?: boolean;
  onSelect?: () => void;
  selected?: boolean;
  disabled?: boolean;
  actionLabel?: string;
}) {
  if (!count && !showEmpty) return null;
  const layers = Math.max(1, Math.min(count, small ? 3 : 4));
  const ink = resource && resource !== 'back' ? RESOURCE_INK[resource] : '#365c60';
  const stack = (
    <span
      data-card-kind={resource ?? development ?? 'back'}
      data-empty={count === 0 || undefined}
      className={`ct-card-stack ${small ? 'ct-card-stack-small' : ''}`}
      role="img"
      aria-label={`${count} ${label}`}
      title={`${count} ${label}`}
      style={{ '--stack-depth': layers - 1, '--card-ink': ink } as CSSProperties}
    >
      {Array.from({ length: layers }, (_, i) => (
        <span key={i} className="ct-stack-layer" style={{ '--layer': i } as CSSProperties}>
          {resource ? (
            <ResourceCard kind={resource} />
          ) : (
            <DevelopmentArt kind={development ?? 'back'} />
          )}
        </span>
      ))}
      <b key={count} className="ct-card-count">
        {count}
      </b>
    </span>
  );
  if (!onSelect) return stack;
  return (
    <button
      type="button"
      className="ct-card-choice"
      aria-label={actionLabel ?? `Select ${label} for trade`}
      aria-pressed={selected}
      disabled={disabled || count === 0}
      onClick={onSelect}
    >
      {stack}
      <span className="ct-card-choice-mark" aria-hidden="true">
        {selected ? '✓' : '+'}
      </span>
    </button>
  );
}
export function PieceArt({
  kind,
  color = '#287eb2',
}: {
  kind: 'road' | 'settlement' | 'city';
  color?: string;
}) {
  const [preview, setPreview] = useState<{ color: string; kind: string; src: string }>();
  useEffect(() => {
    let mounted = true;
    import('./piece-previews')
      .then(({ piecePreviews }) => {
        if (!mounted) return;
        const src = piecePreviews(color)?.[kind];
        if (src) setPreview({ color, kind, src });
      })
      .catch(() => {
        // Keep the inline fallback when graphics are unavailable.
      });
    return () => {
      mounted = false;
    };
  }, [color, kind]);
  if (preview?.color === color && preview.kind === kind)
    return (
      <Image
        src={preview.src}
        width={70}
        height={64}
        alt=""
        aria-hidden="true"
        className="ct-piece-art"
        unoptimized
      />
    );
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
      <AwardArt kind={kind} />
      {small && <span className="ct-award-ribbon">2</span>}
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
