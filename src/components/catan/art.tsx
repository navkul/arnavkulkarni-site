import { useId, type ReactNode } from 'react';
import type { Development, Resource } from '@/lib/catan/types';

/** Original SVG illustrations; bundled with the app for offline play. */
export function TerrainArt({ kind }: { kind: Resource | 'desert' }) {
  const ink = useId();
  const sky = {
    wood: '#94ac78',
    brick: '#dfac82',
    sheep: '#c8d6a0',
    wheat: '#f1d88b',
    ore: '#bed1cd',
    desert: '#f3deb0',
  }[kind];
  return (
    <g aria-hidden="true">
      <defs>
        <linearGradient id={`${ink}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor={sky} />
          <stop offset="1" stopColor="#fff6d9" />
        </linearGradient>
        <pattern
          id={`${ink}-paper`}
          width="11"
          height="13"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(-12)"
        >
          <path d="M1 2h2M7 9h1M4 12h2" stroke="#fff9da" strokeWidth=".7" opacity=".25" />
          <path d="M3 6h1M9 3h1" stroke="#354f42" strokeWidth=".5" opacity=".16" />
        </pattern>
      </defs>
      <rect x="-70" y="-70" width="140" height="140" fill={`url(#${ink}-sky)`} />
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
      )}{' '}
      <rect x="-70" y="-70" width="140" height="140" fill={`url(#${ink}-paper)`} />
    </g>
  );
}

/** An original miniature-print treatment shared by both decks. */
export function IllustratedCard({
  title,
  category,
  accent,
  children,
  footer,
}: {
  title: string;
  category: string;
  accent: string;
  children: ReactNode;
  footer?: string;
}) {
  const id = useId();
  return (
    <svg viewBox="0 0 120 150" aria-hidden="true" className="ct-card-art ct-illustrated-card">
      <defs>
        <linearGradient id={`${id}-stock`} x2="1" y2="1">
          <stop stopColor="#fffdf4" />
          <stop offset=".5" stopColor="#f3ebd6" />
          <stop offset="1" stopColor="#d9c9a5" />
        </linearGradient>
        <linearGradient id={`${id}-foil`} x2="1" y2="1">
          <stop stopColor="#d7b75d" />
          <stop offset=".45" stopColor="#fff0bd" />
          <stop offset="1" stopColor="#957334" />
        </linearGradient>
        <clipPath id={`${id}-window`}>
          <path d="M12 32Q60 24 108 32V115Q60 123 12 115Z" />
        </clipPath>
        <pattern id={`${id}-grain`} width="6" height="7" patternUnits="userSpaceOnUse">
          <path d="M1 1h.7M4 5h.5" stroke="#704e30" opacity=".1" strokeWidth=".5" />
        </pattern>
      </defs>
      <rect
        x="2"
        y="2"
        width="116"
        height="146"
        rx="7"
        fill={`url(#${id}-stock)`}
        stroke="#b5a079"
      />
      <rect
        x="5"
        y="5"
        width="110"
        height="140"
        rx="5"
        fill="none"
        stroke={accent}
        strokeWidth=".6"
      />
      <path
        d="M9 31V10H111V31M9 119V140H111V119"
        fill="none"
        stroke={`url(#${id}-foil)`}
        strokeWidth="1.4"
      />
      <text
        x="60"
        y="17"
        textAnchor="middle"
        fill={accent}
        fontFamily="Georgia, serif"
        fontSize="5.3"
        letterSpacing="2"
      >
        {category.toUpperCase()}
      </text>
      <text
        x="60"
        y="27"
        textAnchor="middle"
        fill="#3e3b30"
        fontFamily="Georgia, serif"
        fontWeight="700"
        fontSize={category === 'Resource' ? '12' : title.length > 13 ? '8.8' : '10.2'}
      >
        {title}
      </text>
      <g clipPath={`url(#${id}-window)`}>{children}</g>
      <path
        d="M12 32Q60 24 108 32V115Q60 123 12 115Z"
        fill="none"
        stroke={accent}
        strokeWidth=".75"
      />
      <path
        d="M17 130H34M86 130H103M58 126L62 130 58 134 54 130Z"
        fill="none"
        stroke="#aa8b47"
        strokeWidth=".7"
      />
      <text
        x="60"
        y="140"
        textAnchor="middle"
        fill="#62543b"
        fontFamily="Georgia, serif"
        fontSize="5.8"
      >
        {footer}
      </text>
      <rect
        x="3"
        y="3"
        width="114"
        height="144"
        rx="6"
        fill={`url(#${id}-grain)`}
        pointerEvents="none"
      />
      <path d="M9 7H111M5 12V137" fill="none" stroke="#fffef1" strokeOpacity=".85" />
      <path d="M9 145H109Q115 145 115 139V12" fill="none" stroke="#8f7955" strokeOpacity=".3" />
    </svg>
  );
}

export function CardBackArt({ resource = false }: { resource?: boolean }) {
  const id = useId();
  const color = resource ? '#285c70' : '#294c46';
  return (
    <svg viewBox="0 0 120 150" aria-hidden="true" className="ct-card-art ct-card-back">
      <defs>
        <linearGradient id={`${id}-back`} x2="1" y2="1">
          <stop stopColor={color} />
          <stop offset="1" stopColor="#172f36" />
        </linearGradient>
        <pattern id={`${id}-weave`} width="12" height="14" patternUnits="userSpaceOnUse">
          <path
            d="M6 0L12 3.5V10.5L6 14 0 10.5V3.5Z"
            fill="none"
            stroke="#dcc891"
            strokeWidth=".5"
            opacity=".2"
          />
        </pattern>
      </defs>
      <rect x="2" y="2" width="116" height="146" rx="7" fill="#f5e8c9" stroke="#b5a079" />
      <rect x="7" y="7" width="106" height="136" rx="4" fill={`url(#${id}-back)`} />
      <rect
        x="10"
        y="10"
        width="100"
        height="130"
        rx="2"
        fill={`url(#${id}-weave)`}
        stroke="#b99b59"
        strokeWidth=".7"
      />
      <path
        d="M17 25V17H30M90 17H103V25M17 125V133H30M90 133H103V125"
        fill="none"
        stroke="#e0c680"
      />
      <path d="M60 34L96 55V96L60 116 24 96V55Z" fill={color} stroke="#e4cd8d" strokeWidth="1.5" />
      <path d="M60 39L91 57V92L60 110 29 92V57Z" fill="none" stroke="#d7c285" strokeWidth=".5" />
      {resource ? (
        <>
          <path
            d="M33 83L48 57 60 78 72 54 88 83"
            fill="#759589"
            stroke="#d4c88e"
            strokeWidth=".8"
          />
          <path d="M72 54L65 67 72 64 78 67" fill="#f0ddad" />
          <path d="M34 89Q48 81 60 89T86 89M40 96Q51 90 62 96T80 95" fill="none" stroke="#e0c888" />
          <circle cx="45" cy="57" r="4" fill="#ecd392" />
        </>
      ) : (
        <>
          <path
            d="M40 89V67L48 57 56 67V89M59 89V54L66 46 73 54V89M75 89V67L81 59 87 67V89Z"
            fill="#d9c385"
            stroke="#f5e3b1"
            strokeWidth=".7"
          />
          <path d="M37 91H89M45 96H81M48 72v8M66 61v8M81 73v7" stroke={color} strokeWidth="2" />
        </>
      )}
      <text
        x="60"
        y="26"
        textAnchor="middle"
        fontFamily="Georgia, serif"
        fontSize="7.3"
        fill="#e9d49a"
        letterSpacing="2"
      >
        CATAN
      </text>
      <text
        x="60"
        y="127"
        textAnchor="middle"
        fontFamily="Georgia, serif"
        fontSize="5.4"
        fill="#e9d49a"
        letterSpacing="1.1"
      >
        {resource ? 'RESOURCES' : 'DEVELOPMENT'}
      </text>
    </svg>
  );
}

function DevelopmentScene({ kind }: { kind: Development }) {
  const id = useId();
  const sky = {
    knight: '#abc4bf',
    roads: '#d4d6b0',
    plenty: '#dbd5a0',
    monopoly: '#dec29d',
    victory: '#afbdce',
  }[kind];
  return (
    <>
      <defs>
        <linearGradient id={`${id}-scene`} x2="0" y2="1">
          <stop stopColor={sky} />
          <stop offset="1" stopColor="#fbebbe" />
        </linearGradient>
      </defs>
      <rect x="10" y="29" width="100" height="96" fill={`url(#${id}-scene)`} />
      <circle cx="87" cy="44" r="10" fill="#fff0c3" opacity=".7" />
      <path d="M10 58Q27 43 44 57T78 53T111 57V120H10Z" fill="#819c86" opacity=".6" />
      <path d="M10 79Q36 64 57 78T111 72V121H10Z" fill="#657b5a" />
      {kind === 'knight' && (
        <>
          <path d="M26 117L33 77 51 59 72 64 95 116Z" fill="#9b4036" />
          <path d="M36 92L43 67 68 62 79 79 82 115H35Z" fill="#71818a" stroke="#3a4b52" />
          <path
            d="M44 65L49 90H69L72 66M51 92L46 113M68 92L73 113"
            fill="none"
            stroke="#c7d2c8"
            strokeWidth="3"
          />
          <path d="M44 62V46Q56 29 70 46L72 62 58 70Z" fill="#cfdbce" stroke="#405767" />
          <path d="M46 47H71V54L57 61 46 55Z" fill="#324750" />
          <path d="M52 47v8M58 47v9M64 47v7" stroke="#d4d5b5" strokeWidth="1.7" />
          <path d="M54 39Q52 25 75 32L66 39" fill="#a94838" />
          <path d="M83 43L87 40 91 43 87 89 83 90Z" fill="#e0e8d5" stroke="#61767c" />
          <path d="M77 88L94 90M85 90L84 104" stroke="#dbc58c" strokeWidth="3" />
          <path
            d="M52 76L72 82 70 102Q65 113 52 119Q37 110 34 101L32 82Z"
            fill="#a24737"
            stroke="#e6c47a"
            strokeWidth="2"
          />
          <path d="M52 80V112M37 93H69" stroke="#e6c47a" strokeWidth="4" />
          <path d="M52 81V112L65 103 68 84Z" fill="#3d2522" opacity=".12" />
        </>
      )}
      {kind === 'roads' && (
        <>
          <path d="M13 114Q80 102 65 83T82 46" fill="none" stroke="#705941" strokeWidth="21" />
          <path d="M13 112Q78 101 63 82T82 44" fill="none" stroke="#e0c190" strokeWidth="17" />
          <path
            d="M13 112Q78 101 63 82T82 44"
            fill="none"
            stroke="#b5946d"
            strokeWidth="12"
            strokeDasharray="2 4"
          />
          <path d="M38 80L77 75V91L38 95Z" fill="#a28c67" stroke="#5e634a" />
          <path d="M42 91V84Q49 76 55 82V89M59 88V82Q67 75 73 80V86" fill="#4e6954" />
          <path d="M36 77L76 71 79 77 38 84Z" fill="#dec69b" />
          <path d="M29 83V51M23 53L47 49 49 54 26 59Z" fill="#b3905e" stroke="#644e34" />
          <path d="M85 52V38L92 31 102 37V50Z" fill="#e4d7ad" />
          <path d="M83 39L92 29 104 37Z" fill="#b76244" />
          <path d="M21 111l-5-9 8 3M91 93l4-11 6 8M89 107l-4-8 10 2" fill="#b4be7a" />
        </>
      )}
      {kind === 'plenty' && (
        <>
          <path
            d="M21 98Q13 60 38 47Q65 32 86 55Q58 41 47 68Q44 85 74 107Q41 122 21 98Z"
            fill="#bb8140"
            stroke="#f8d689"
            strokeWidth="2"
          />
          <path
            d="M28 101Q21 70 43 56M35 106Q27 75 50 57M43 109Q33 81 57 59"
            fill="none"
            stroke="#e5b969"
            strokeWidth="2"
          />
          <ellipse cx="72" cy="100" rx="26" ry="16" fill="#69472c" transform="rotate(12 72 100)" />
          <circle cx="61" cy="96" r="10" fill="#ba5639" />
          <circle cx="78" cy="104" r="10" fill="#e3a93b" />
          <path d="M78 94Q78 79 91 78Q101 95 88 106Z" fill="#d5b152" stroke="#f2ce75" />
          <path
            d="M62 88Q55 72 62 65Q73 73 69 87M81 83Q87 66 98 74Q96 88 81 90"
            fill="#809955"
            stroke="#b5bf75"
          />
          {[0, 1, 2].map((i) => (
            <g key={i} transform={`translate(${29 + i * 9} ${96 - i * 4}) rotate(${-18 + i * 14})`}>
              <path d="M0 9V-25" stroke="#f6d384" strokeWidth="2" />
              {[-20, -12, -4].map((y) => (
                <path key={y} d={`M0 ${y}q-12-9-6-12q7 3 6 12q10-12 8-4q-2 5-8 7`} fill="#f0cc76" />
              ))}
            </g>
          ))}
          <path d="M89 114Q101 108 101 96" fill="none" stroke="#607345" strokeWidth="3" />
        </>
      )}
      {kind === 'monopoly' && (
        <>
          <path d="M14 110V80L34 68 52 80V111M70 109V75L87 64 108 79V112" fill="#c7ad7b" />
          <path d="M27 115V62H92V115Z" fill="#e2cfa5" stroke="#917248" />
          <path d="M22 64L60 38 97 64Z" fill="#9b5840" stroke="#e9c98e" strokeWidth="2" />
          <path d="M29 62L60 44 89 62" fill="none" stroke="#c78659" />
          {[35, 50, 70, 85].map((x) => (
            <g key={x}>
              <path d={`M${x} 70V104`} stroke="#a78e65" strokeWidth="6" />
              <path d={`M${x - 2} 70V104`} stroke="#f0d8a5" strokeWidth="2" />
            </g>
          ))}
          <path
            d="M23 106H97V111H23ZM19 112H101V118H19Z"
            fill="#e9d09a"
            stroke="#9c7b4b"
            strokeWidth=".7"
          />
          <path d="M56 78Q60 72 64 78V103H56Z" fill="#695746" />
          <circle cx="60" cy="57" r="5" fill="#e6c06b" stroke="#744b33" />
          {[32, 47, 80, 90].map((x, i) => (
            <g key={x} transform={`translate(${x} ${117 - (i % 2) * 5})`}>
              <path d="M-7-6V0Q0 6 7 0V-6" fill="#be8a35" />
              <ellipse cy="-6" rx="7" ry="3" fill="#f2d581" stroke="#8e6e33" strokeWidth=".6" />
            </g>
          ))}
        </>
      )}
      {kind === 'victory' && (
        <>
          <path d="M18 116L23 111H98L105 118Z" fill="#adab83" />
          <path d="M26 111V71H43V60H53V47H71V62H81V75H96V112Z" fill="#e9ddba" stroke="#9b9174" />
          <path
            d="M23 73L34 57 46 73M41 62L53 49 63 62M48 48L61 29 76 48M68 64L79 47 91 64M81 76L90 62 102 76"
            fill="#a95642"
            stroke="#d89d73"
          />
          <path d="M59 30V20M59 20L72 23 59 27" stroke="#8c7352" fill="#d8b651" />
          <path d="M54 112V92Q62 77 70 92V112Z" fill="#756b5c" />
          <path
            d="M32 80V88M43 85V93M61 55V65M79 71V80M89 85V93"
            stroke="#738285"
            strokeWidth="3"
          />
          <path d="M29 98H49M73 99H94M49 76H75M30 107H48" stroke="#b5a785" strokeWidth=".7" />
          <path
            d="M21 113Q10 96 18 80M102 113Q112 96 104 80"
            fill="none"
            stroke="#d8b459"
            strokeWidth="2"
          />
          {[0, 1, 2, 3].map((i) => (
            <g key={i}>
              <ellipse
                cx={17 + (i % 2) * 2}
                cy={87 + i * 7}
                rx="3"
                ry="6"
                fill="#e9cc7b"
                transform={`rotate(-30 ${17 + (i % 2) * 2} ${87 + i * 7})`}
              />
              <ellipse
                cx={106 - (i % 2) * 2}
                cy={87 + i * 7}
                rx="3"
                ry="6"
                fill="#e9cc7b"
                transform={`rotate(30 ${106 - (i % 2) * 2} ${87 + i * 7})`}
              />
            </g>
          ))}
        </>
      )}
    </>
  );
}

export function DevelopmentArt({ kind }: { kind: Development | 'back' }) {
  if (kind === 'back') return <CardBackArt />;
  const names = {
    knight: 'Knight',
    roads: 'Road building',
    plenty: 'Year of plenty',
    monopoly: 'Monopoly',
    victory: 'Victory point',
  };
  const effects = {
    knight: 'Move the robber · Steal 1',
    roads: 'Build 2 roads for free',
    plenty: 'Take 2, or remaining supply',
    monopoly: 'Take all of 1 resource type',
    victory: '1 hidden victory point',
  };
  const colors = {
    knight: '#4d6e77',
    roads: '#94613d',
    plenty: '#65763c',
    monopoly: '#93662f',
    victory: '#6d6681',
  };
  return (
    <IllustratedCard
      title={names[kind]}
      category={kind === 'victory' ? 'Victory' : kind === 'knight' ? 'Knight' : 'Progress'}
      accent={colors[kind]}
      footer={effects[kind]}
    >
      <DevelopmentScene kind={kind} />
    </IllustratedCard>
  );
}

export function AwardArt({ kind }: { kind: 'longestRoad' | 'largestArmy' }) {
  const road = kind === 'longestRoad';
  return (
    <IllustratedCard
      title={road ? 'Longest road' : 'Largest army'}
      category="Special award"
      accent="#987838"
      footer={road ? '5+ connected roads · 2 points' : '3+ played knights · 2 points'}
    >
      <DevelopmentScene kind={road ? 'roads' : 'knight'} />
      <path d="M81 92L103 92V112L92 120 81 112Z" fill="#e6c674" stroke="#fff0bc" />
      <text
        x="92"
        y="110"
        textAnchor="middle"
        fontFamily="Georgia, serif"
        fontSize="16"
        fill="#67502a"
        fontWeight="700"
      >
        2
      </text>
    </IllustratedCard>
  );
}

export function PortArt() {
  return (
    <g aria-hidden="true" strokeLinejoin="round">
      <ellipse cy="13" rx="25" ry="7" fill="#173f49" opacity=".22" />
      <path
        d="M-27 13Q-16 18-3 14T27 14M-21 19Q-8 24 9 20M-12 25Q0 28 16 24"
        fill="none"
        stroke="#c6e0d5"
        strokeWidth="1.2"
      />
      <path d="M-23 3L-16 13 14 15 25 3Z" fill="#70482f" stroke="#ddb779" strokeWidth="1.2" />
      <path d="M-18 7L19 8M-13 11L15 12" stroke="#af8050" strokeWidth=".7" />
      <path d="M-23 3Q0 8 25 3L22 0Q0 4-21 0Z" fill="#dbb67b" stroke="#75543b" strokeWidth=".6" />
      <path d="M0-31V5" stroke="#976b42" strokeWidth="2.2" />
      <path d="M-2-27Q-13-14-21-1L-3 0Z" fill="#fff2ce" stroke="#bba578" strokeWidth=".65" />
      <path d="M3-24Q16-15 22 0H3Z" fill="#e4d8b1" stroke="#bba578" strokeWidth=".65" />
      <path d="M-4-23L-7-3M5-21L9-2" stroke="#cfbe91" strokeWidth=".7" />
      <path d="M1-31L14-28 1-24Z" fill="#b9553c" />
      <path d="M0-29L-22 3M2-27L24 3" stroke="#a08d6a" strokeWidth=".45" />
      <path d="M-9 2V-2H-4V3M7 3V-1H12V3" fill="#aa7045" stroke="#e3c48c" strokeWidth=".6" />
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
