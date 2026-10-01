import type { Development, Resource } from '@/lib/catan/types';

/** Original SVG illustrations; bundled with the app for offline play. */
export function TerrainArt({ kind }: { kind: Resource | 'desert' }) {
  return (
    <g aria-hidden="true">
      {kind === 'wood' && (
        <>
          <path d="M-70 22Q-30-15 8 9T70-4V70H-70Z" fill="#365f4a" />
          <path d="M-65 48Q-9 15 60 34" fill="none" stroke="#b7c68a" strokeWidth="9" />
          {[
            [-39, -32],
            [-13, -41],
            [18, -35],
            [41, -17],
            [-43, 1],
            [-19, -6],
            [31, 12],
            [-30, 29],
            [8, 36],
            [43, 39],
          ].map(([x, y], i) => (
            <g key={i} transform={`translate(${x} ${y})`}>
              <ellipse cy="17" rx="12" ry="4" fill="#1b4538" opacity=".45" />
              <path d="M0 6V20" stroke="#694b36" strokeWidth="3" />
              <path d="M0-17L-13 7H-8L-16 15H16L8 7H13Z" fill={i % 2 ? '#234f3e' : '#608452'} />
              <path d="M0-17L0 14H-14L-7 7H-11Z" fill="#9aaa68" opacity=".35" />
            </g>
          ))}
        </>
      )}
      {kind === 'brick' && (
        <>
          <path d="M-70 13L-45-17-19-30 10-11 24-30 65-6 70 70H-70Z" fill="#be7856" />
          <path
            d="M-70 24L-40 9-16 5 8 19 37-6 70 11M-70 39L-40 28-16 24 8 38 37 13 70 29M-70 54L-40 43-16 41 8 55 37 31 70 47"
            fill="none"
            stroke="#f0b585"
            strokeWidth="5"
          />
          <path
            d="M29-26L14-7 3 0 12 17-5 28-12 70H30L44 31 35 16 52-6Z"
            fill="#844d3d"
            opacity=".4"
          />
          {[
            [-37, 30],
            [-25, 37],
            [28, 42],
            [39, 33],
          ].map(([x, y], i) => (
            <g key={i} transform={`translate(${x} ${y})`}>
              <path d="M-8-4L4-8 11-3-1 1Z" fill="#efb38a" />
              <path d="M-8-4V3L-1 8V1Z" fill="#b45f44" />
              <path d="M-1 1L11-3V4L-1 8Z" fill="#d68a60" />
            </g>
          ))}
        </>
      )}
      {kind === 'sheep' && (
        <>
          <path d="M-70-8Q-33-42 9-8T70-9V70H-70Z" fill="#aabf74" />
          <path d="M-70 23Q-32-7 6 18T70 8V70H-70Z" fill="#719858" />
          <path d="M-70 58Q-18 12 70 43V70H-70Z" fill="#94af66" />
          {[
            [-35, -19],
            [28, -16],
            [-34, 29],
            [22, 30],
            [42, 13],
          ].map(([x, y], i) => (
            <g key={i} transform={`translate(${x} ${y})`}>
              <ellipse cy="8" rx="10" ry="3" fill="#4c7145" opacity=".4" />
              <path d="M-5 3V9M4 3V9" stroke="#4d5843" strokeWidth="2" />
              <path d="M-9 0Q-12-6-6-7Q-5-12 0-8Q6-12 8-5Q12 0 7 4Q-3 9-9 0" fill="#fff7da" />
              <ellipse cx="8" cy="-1" rx="3" ry="4" fill="#4d5843" />
            </g>
          ))}
          <path
            d="M-51 10l3-5 3 5M6-37l3-6 3 6M-7 43l3-5 3 5"
            fill="none"
            stroke="#cfdb99"
            strokeWidth="2"
          />
        </>
      )}
      {kind === 'wheat' && (
        <>
          <path d="M-70-24L70-48V70H-70Z" fill="#e1b652" />
          <path
            d="M-70-6L70-32M-70 10L70-16M-70 26L70 0M-70 42L70 16M-70 58L70 32M-70 74L70 48"
            stroke="#a97832"
            strokeWidth="5"
          />
          <path d="M-15-70L5-12 26 70" stroke="#f5d990" strokeWidth="9" />
          {[
            [-37, -22],
            [28, -35],
            [-35, 33],
            [30, 29],
            [46, 42],
          ].map(([x, y], i) => (
            <g key={i} transform={`translate(${x} ${y})`}>
              <path d="M0 15V-14" stroke="#f9e3a0" strokeWidth="2" />
              {[-7, 0, 7].map((n) => (
                <g key={n}>
                  <ellipse
                    cx="-4"
                    cy={n}
                    rx="3"
                    ry="5"
                    transform={`rotate(-35 -4 ${n})`}
                    fill="#ffe5a0"
                  />
                  <ellipse
                    cx="4"
                    cy={n - 2}
                    rx="3"
                    ry="5"
                    transform={`rotate(35 4 ${n - 2})`}
                    fill="#ffe5a0"
                  />
                </g>
              ))}
            </g>
          ))}
        </>
      )}
      {kind === 'ore' && (
        <>
          <path d="M-70 29L-41-34-7 18 19-43 71 25V70H-70Z" fill="#657984" />
          <path d="M-41-34L-43 22-7 18ZM19-43L14 35 71 25Z" fill="#a9b6b5" />
          <path d="M-41-34L-54-10-42-15-31-7ZM19-43L3-14 18-21 34-17Z" fill="#ece9d9" />
          <path d="M-70 68L-19-13 33 70Z" fill="#49616d" />
          <path d="M-19-13L-12 70H33Z" fill="#83999e" />
          <path d="M-19-13L-32 7-20 1-7 6Z" fill="#f2eddb" />
          <path d="M24 43l10-9 11 7-4 10H28ZM-42 35l8-5 8 8-4 7H-41Z" fill="#b6c5c5" />
          <path d="M34 34v16M-34 30l4 15" stroke="#607b87" strokeWidth="2" />
        </>
      )}
      {kind === 'desert' && (
        <>
          <path d="M-70-9Q-38-31 0-5T70-14V70H-70Z" fill="#e2bc77" />
          <path d="M-70 24Q-14-20 33 11T70 16V70H-70Z" fill="#c99b61" />
          <path d="M-70 42Q-24 4 10 28T70 19V70H-70Z" fill="#f0d394" />
          <path d="M-70 65Q-17 27 32 51T70 40V70H-70Z" fill="#dbb477" />
          <path
            d="M-45-12Q-22-19-5-11M22 38q15-9 34-6M-28 54q15-9 26-7"
            fill="none"
            stroke="#fff0bf"
            strokeWidth="2"
          />
        </>
      )}
    </g>
  );
}

export function DevelopmentArt({ kind }: { kind: Development | 'back' }) {
  const colors = {
    knight: '#597c86',
    roads: '#bb7755',
    plenty: '#8c9d57',
    monopoly: '#a3894b',
    victory: '#8a7694',
    back: '#285d64',
  };
  return (
    <svg viewBox="0 0 120 150" aria-hidden="true" className="ct-card-art">
      <rect
        x="2"
        y="2"
        width="116"
        height="146"
        rx="9"
        fill="#faf0d6"
        stroke="#c4b18b"
        strokeWidth="2"
      />
      <rect x="9" y="9" width="102" height="132" rx="5" fill={colors[kind]} />
      <path d="M15 115Q60 80 105 115V135H15Z" fill="#172e2b" opacity=".2" />
      <circle cx="60" cy="66" r="38" fill="#fff2c5" opacity=".13" />
      <path
        d="M17 18h16M17 18v16M103 18H87M103 18v16M17 132h16M17 132v-16M103 132H87M103 132v-16"
        fill="none"
        stroke="#f8dea0"
      />
      {kind === 'knight' && (
        <>
          <path d="M34 108L39 64 60 53 81 64 86 108Z" fill="#c0ccd0" />
          <path d="M47 61V42Q60 24 74 43V61Z" fill="#e9e6d5" stroke="#324c5a" strokeWidth="2" />
          <path d="M45 43H77V54H45Z" fill="#3b5660" />
          <path d="M52 45v7M59 45v7M66 45v7" stroke="#d4dbce" strokeWidth="2" />
          <path d="M49 35Q50 19 69 24L63 34" fill="#b7503b" />
          <path
            d="M61 70L85 76V94Q76 112 61 118Q44 108 38 94V76Z"
            fill="#b95039"
            stroke="#f6df9d"
            strokeWidth="3"
          />
          <path d="M61 78V105M49 90H73" stroke="#f6df9d" strokeWidth="4" />
        </>
      )}
      {kind === 'roads' && (
        <>
          <path d="M17 83L40 51 63 70 87 45 105 80V126H17Z" fill="#71905c" />
          <path d="M23 127Q91 95 64 83T81 36" fill="none" stroke="#f1d397" strokeWidth="19" />
          <path
            d="M23 127Q91 95 64 83T81 36"
            fill="none"
            stroke="#a77e56"
            strokeWidth="12"
            strokeDasharray="3 5"
          />
          <path d="M33 69V36M24 43H52L47 49H24Z" fill="#75472f" stroke="#f0d39d" strokeWidth="2" />
        </>
      )}
      {kind === 'plenty' && (
        <>
          <path
            d="M27 90Q17 44 55 34Q83 29 84 53Q65 44 53 59Q38 83 78 110Q46 123 27 90Z"
            fill="#e0b05c"
            stroke="#fae0a0"
            strokeWidth="2"
          />
          <ellipse cx="72" cy="95" rx="24" ry="17" fill="#624b30" />
          <circle cx="60" cy="91" r="10" fill="#c35d39" />
          <circle cx="80" cy="93" r="11" fill="#e5b857" />
          <path d="M68 87Q60 58 80 51Q88 70 68 87M83 89Q86 70 99 73Q102 90 83 89" fill="#83a464" />
          <path
            d="M42 94Q20 59 40 45M32 72l-9-4M34 64l9-7M36 54l-8-4"
            fill="none"
            stroke="#f7d88d"
            strokeWidth="4"
          />
        </>
      )}
      {kind === 'monopoly' && (
        <>
          <path d="M27 106V68H93V106Z" fill="#e1c48b" />
          <path d="M22 68L60 37 98 68Z" fill="#754c38" stroke="#f0dca5" strokeWidth="2" />
          {[36, 53, 70, 87].map((x) => (
            <path key={x} d={`M${x} 74V100`} stroke="#846748" strokeWidth="5" />
          ))}
          <path d="M22 107H98V114H22Z" fill="#f5dca2" />
          {[32, 48, 67, 84].map((x, i) => (
            <g key={x}>
              <ellipse cx={x} cy={123 - (i % 2) * 4} rx="10" ry="4" fill="#bc8538" />
              <ellipse
                cx={x}
                cy={119 - (i % 2) * 4}
                rx="10"
                ry="4"
                fill="#f4cf65"
                stroke="#ab813a"
              />
            </g>
          ))}
          <circle cx="60" cy="56" r="7" fill="#e6ba57" />
        </>
      )}
      {kind === 'victory' && (
        <>
          <path d="M32 115V60H48V45H72V60H88V115Z" fill="#ebdbc0" />
          <path d="M28 60L40 39 52 60M44 45L60 22 76 45M68 60L80 39 92 60" fill="#bd8159" />
          <path
            d="M54 115V91Q60 80 66 91V115M38 73v10M80 73v10M60 54v14"
            stroke="#73616f"
            strokeWidth="5"
          />
          <path
            d="M26 123Q15 101 22 83M94 123Q105 101 98 83"
            fill="none"
            stroke="#d9b96a"
            strokeWidth="3"
          />
          <path d="M60 14v-6M33 22l-5-6M86 22l5-6" stroke="#f9de94" strokeWidth="2" />
        </>
      )}
      {kind === 'back' && (
        <>
          <path d="M60 29L96 49V91L60 113 24 91V49Z" fill="none" stroke="#e7d49c" strokeWidth="2" />
          <path d="M35 92L48 59 58 76 70 48 88 92Z" fill="#96b4a0" />
          <path d="M70 48L62 68 70 63 78 69Z" fill="#f4dfb0" />
          <path d="M60 17v8M60 117v12M12 70h9M99 70h9" stroke="#ecd9a2" />
          <circle cx="42" cy="48" r="6" fill="#ecd9a2" />
        </>
      )}
    </svg>
  );
}

export function PortArt() {
  return (
    <g aria-hidden="true">
      <ellipse cy="12" rx="23" ry="6" fill="#173f49" opacity=".25" />
      <path
        d="M-25 13Q-13 17-2 13T25 13M-17 19Q-5 23 9 19"
        fill="none"
        stroke="#b7d3ca"
        strokeWidth="1.5"
      />
      <path d="M-22 3H24L15 13H-13Z" fill="#784e35" stroke="#e3bf86" strokeWidth="1.5" />
      <path d="M0-29V5" stroke="#e6c692" strokeWidth="2" />
      <path d="M-3-27L-20 0H-3Z" fill="#fff1cc" />
      <path d="M3-24L20 0H3Z" fill="#ded2ab" />
      <path d="M1-30L13-27 1-23Z" fill="#c65f42" />
    </g>
  );
}

export function Dice({ values }: { values: [number, number] }) {
  const pips: Record<number, number[]> = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  };
  return (
    <div className="ct-dice" role="img" aria-label={`Dice: ${values.join(' and ')}`}>
      {values.map((value, i) => (
        <svg key={i} viewBox="0 0 48 48" className="ct-die" aria-hidden="true">
          <rect
            x="2"
            y="2"
            width="44"
            height="44"
            rx="9"
            fill="#fff8e7"
            stroke="#d6c6a0"
            strokeWidth="2"
          />
          {pips[value].map((n) => (
            <circle
              key={n}
              cx={12 + (n % 3) * 12}
              cy={12 + Math.floor(n / 3) * 12}
              r="3.5"
              fill="#263b38"
            />
          ))}
        </svg>
      ))}
      <strong className="ct-dice-total">{values[0] + values[1]}</strong>
    </div>
  );
}
