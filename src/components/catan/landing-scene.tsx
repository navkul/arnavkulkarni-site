'use client';

import { useEffect, useState, type ReactNode } from 'react';
import './landing-scene.css';

function SheepRider({ rival = false }: { rival?: boolean }) {
  const coat = rival ? '#8d639d' : '#d45b46';
  return (
    <g>
      <ellipse cy="29" rx="39" ry="9" fill="#254e4921" />
      <path
        d="M-22 9 -25 27 M-10 12 -8 29 M14 12 10 29 M24 8 26 25"
        stroke="#4c4c40"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <g fill="#fff7de" stroke="#e4d8b6" strokeWidth="1.5">
        <ellipse cy="0" rx="34" ry="23" />
        <circle cx="-20" cy="-12" r="12" />
        <circle cx="-5" cy="-18" r="12" />
        <circle cx="13" cy="-14" r="14" />
        <circle cx="-24" cy="5" r="12" />
        <circle cx="-6" cy="13" r="11" />
        <circle cx="12" cy="12" r="11" />
      </g>
      <path d="M24-9 Q45-18 47 1 Q46 15 32 11Z" fill="#4c4c40" />
      <path d="M33-11 25-20 Q20-17 28-9 M43-9 52-17 Q57-12 47-5" fill="#655e4b" />
      <circle cx="42" cy="-1" r="2.5" fill="#fff9e7" />
      <circle cx="43" cy="-1" r="1.2" fill="#272c2b" />
      <g className="ct-settler-body">
        <path d="M-9-17 9-17 14-38 -11-39Z" fill={coat} />
        <path
          d="M1-17 13-5 20-8"
          fill="none"
          stroke="#374b58"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <g className={rival ? 'ct-rival-arm' : 'ct-builder-arm'}>
          <path
            d="M-7-35 8-25 27-18"
            fill="none"
            stroke={coat}
            strokeWidth="7"
            strokeLinecap="round"
          />
          <circle cx="27" cy="-18" r="4" fill="#e8b080" />
          <g className="ct-paintbrush">
            <path d="M29-18 47-29" stroke="#a37c4d" strokeWidth="4" strokeLinecap="round" />
            <path d="m44-32 7-5 5 7-7 5Z" fill="#b9c7c4" />
            <path d="m48-39 7-5 6 8-7 5Z" fill={coat} />
            <path d="m55-43 5 6" stroke={rival ? '#b995c9' : '#f18b70'} strokeWidth="2" />
          </g>
          {rival && (
            <g className="ct-rival-knife">
              <path
                d="M28-19 49-24 38-13 29-14Z"
                fill="#e6eff0"
                stroke="#738a8c"
                strokeWidth="1.5"
              />
              <path d="M23-16 30-18" stroke="#755241" strokeWidth="5" strokeLinecap="round" />
            </g>
          )}
        </g>
        <circle cy="-51" r="11" fill="#e8b080" />
        <path d="M-14-51 Q-11-72 9-62 L14-50Z" fill={rival ? '#514e7d' : '#be4836'} />
        <path
          d="M-15-50 17-50"
          stroke={rival ? '#514e7d' : '#be4836'}
          strokeWidth="4"
          strokeLinecap="round"
        />
        <circle cx="5" cy="-48" r="1.5" fill="#394b49" />
        <path d="M27-18 37-6" stroke="#9e8260" strokeWidth="1.5" />
      </g>
    </g>
  );
}

export function LandingShip({ side }: { side: 'start' | 'join' }) {
  const purple = side === 'join';
  return (
    <svg
      viewBox="0 0 220 130"
      className={`ct-harbor-ship ct-harbor-ship-${side}`}
      aria-hidden="true"
    >
      <ellipse cx="106" cy="112" rx="87" ry="10" fill="#78aeb522" />
      <path
        d="M17 108 Q43 104 57 109 M154 113 Q176 107 205 111"
        fill="none"
        stroke="#7faeb8"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        className="ct-tow-rope"
        d={purple ? 'M172 89 Q237 94 278 146' : 'M48 89 Q-15 94 -58 146'}
        fill="none"
        stroke="#a38a60"
        strokeWidth="2.5"
        strokeDasharray="3 2"
      />
      <circle className="ct-tow-rope" cx={purple ? 278 : -58} cy="146" r="4" fill="#a38a60" />
      <g className="ct-ship-direction">
        <g className="ct-ship-hull">
          <path d="M48 80 175 74 152 104 Q98 117 61 98Z" fill="#755241" />
          <path d="M48 80 62 97 151 97 175 74 130 88 73 90Z" fill="#b5885a" />
          <path d="M52 81 130 87 174 75" fill="none" stroke="#ddbd85" strokeWidth="4" />
          <path d="M73 98 147 101" stroke="#574333" strokeWidth="2" />
          <path d="M109 86 109 14" stroke="#74563e" strokeWidth="4" />
          <path d="M108 22 62 73 Q85 83 105 72Z" fill={purple ? '#c4b6da' : '#fff5d7'} />
          <path d="M116 23 Q142 47 148 70 L116 75Z" fill={purple ? '#9480b2' : '#e2d3a7'} />
          <path
            d="M105 21 68 71"
            fill="none"
            stroke={purple ? '#eee2f7' : '#fffdf0'}
            strokeWidth="2"
          />
          <path d="M110 12 135 16 110 26Z" fill={purple ? '#755484' : '#d56b4f'} />
          <path d="M109 16 165 79 M109 16 55 83" stroke="#74563e" strokeWidth="1" opacity=".5" />
          <circle cx="86" cy="94" r="3" fill="#493f37" />
          <circle cx="108" cy="96" r="3" fill="#493f37" />
          <circle cx="131" cy="94" r="3" fill="#493f37" />
          <path d="M153 86 170 85" stroke="#475765" strokeWidth="7" strokeLinecap="round" />
        </g>
      </g>
    </svg>
  );
}

export default function LandingScene({ children }: { children: ReactNode }) {
  const [playing, setPlaying] = useState(false);
  const [replay, setReplay] = useState(0);
  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const stop = () => {
      if (motion.matches) setPlaying(false);
    };
    motion.addEventListener('change', stop);
    let frame = 0;
    const cleanup = () => {
      cancelAnimationFrame(frame);
      motion.removeEventListener('change', stop);
    };
    if (motion.matches) return cleanup;
    frame = requestAnimationFrame(() => {
      // A fresh entry from the main site always gets the intro; Strict Mode cancels its first frame.
      setPlaying(true);
    });
    return cleanup;
  }, []);
  return (
    <div
      className={`ct-harbor-intro${playing ? ' ct-intro-playing' : ''}`}
      onAnimationEnd={(event) => {
        if (event.animationName === 'ct-tow-start') setPlaying(false);
      }}
    >
      <section className="ct-harbor-hero" aria-label="Welcome to Catan">
        <h1 className="ct-sr-only">CATAN</h1>
        <svg
          key={replay}
          className="ct-harbor-scene"
          viewBox="0 0 1000 290"
          role="img"
          aria-label="A miniature Catan island with sheep-riding settlers and a golden Catan sign"
        >
          <defs>
            <linearGradient id="ct-harbor-sea" x2="0" y2="1">
              <stop stopColor="#daeae7" />
              <stop offset="1" stopColor="#a2cccf" />
            </linearGradient>
            <linearGradient id="ct-harbor-land" x2="0" y2="1">
              <stop stopColor="#cbd795" />
              <stop offset="1" stopColor="#91ad6e" />
            </linearGradient>
            <linearGradient id="ct-harbor-gold" x2="0" y2="1">
              <stop stopColor="#fff1aa" />
              <stop offset=".5" stopColor="#e3b655" />
              <stop offset="1" stopColor="#c68a32" />
            </linearGradient>
            <filter id="ct-harbor-shadow" x="-30%" y="-40%" width="160%" height="190%">
              <feDropShadow dx="0" dy="6" stdDeviation="5" floodColor="#365b56" floodOpacity=".2" />
            </filter>
          </defs>
          <ellipse cx="500" cy="219" rx="401" ry="61" fill="url(#ct-harbor-sea)" />
          <g fill="none" stroke="#fff" strokeWidth="2" opacity=".55">
            <path d="M138 221q28-6 48 0m21 20q40 8 72 0m429 10q51 7 95-4m29-31q31-5 51 0" />
            <path d="M128 239q10 3 24 0m178 18q35 7 70 0m286-2q-33 5-66 0" />
          </g>
          <g filter="url(#ct-harbor-shadow)">
            <path
              d="M220 178 349 125 641 127 787 182 766 219 675 239 382 246 243 218Z"
              fill="#b9915e"
            />
            <path
              d="M215 174 339 120 646 123 791 175 764 209 670 227 383 234 239 209Z"
              fill="#e2cd97"
            />
            <path
              d="M235 169 348 119 643 125 765 177 744 202 660 218 388 224 258 203Z"
              fill="url(#ct-harbor-land)"
            />
            <path
              d="M290 149 357 122 424 145 415 181 347 199 285 181Z"
              fill="#aec382"
              stroke="#c9d79e"
              strokeWidth="2"
            />
            <path
              d="M417 146 483 121 554 145 554 184 483 206 415 181Z"
              fill="#d5bf70"
              stroke="#ebd795"
              strokeWidth="2"
            />
            <path
              d="M557 145 623 126 690 150 685 184 622 203 554 184Z"
              fill="#7ea57a"
              stroke="#a5bd88"
              strokeWidth="2"
            />
            <path d="M347 201 415 183 481 206 479 224 389 226Z" fill="#779d72" />
            <path d="M623 206 687 186 744 202 662 220Z" fill="#d2b66f" />
          </g>
          <g fill="#849792">
            <path d="M251 151 292 72 335 151Z" />
            <path d="M289 149 324 92 359 150Z" fill="#6b8782" />
            <path d="M292 72 276 102 293 95 306 103Z" fill="#e8ece0" />
            <path d="M324 92 312 112 325 108 334 115Z" fill="#d7e3d9" />
          </g>
          <g stroke="#54785b" strokeWidth="4">
            <path d="M682 152V112m35 51V121m-9-3V94" />
          </g>
          <g fill="#4d7d64">
            <path d="M658 142 682 95 706 142Z" />
            <path d="M694 149 717 105 740 149Z" fill="#608b66" />
            <path d="M687 117 708 78 729 117Z" fill="#759969" />
          </g>
          <g className="ct-harbor-house" transform="translate(280 192) scale(1.15)">
            <path d="M-17 0 0 8 19-2V-23L0-31-17-20Z" fill="#e6d6ae" />
            <path d="M0 8 19-2V-23L0-31Z" fill="#c5af88" />
            <path d="M-21-20 0-43 23-23 3-12Z" fill="#815442" />
            <path d="M3-12 23-23 19-28 0-19Z" fill="#604f42" />
            <g className="ct-house-red">
              <path d="M-17 0 0 8 19-2V-23L0-31-17-20Z" fill="#d65343" />
              <path d="M0 8 19-2V-23L0-31Z" fill="#ab3a37" />
              <path d="M-21-20 0-43 23-23 3-12Z" fill="#ad443a" />
              <path d="M3-12 23-23 19-28 0-19Z" fill="#853832" />
            </g>
            <g className="ct-house-purple">
              <path d="M-17 0 0 8 19-2V-23L0-31-17-20Z" fill="#8d639d" />
              <path d="M0 8 19-2V-23L0-31Z" fill="#644c80" />
              <path d="M-21-20 0-43 23-23 3-12Z" fill="#765589" />
              <path d="M3-12 23-23 19-28 0-19Z" fill="#514267" />
            </g>
            <path d="M5 5V-9l7-3V2" fill="#695345" />
            <path d="m-12-14 7 3v7l-7-3Z" fill="#fff1ba" />
            <g className="ct-paint-splash ct-paint-splash-red" fill="#d65343">
              <circle cx="-22" cy="-10" r="2.5" />
              <circle cx="-26" cy="-17" r="1.5" />
              <path d="M-20-2v7" stroke="#d65343" strokeWidth="2" strokeLinecap="round" />
            </g>
            <g className="ct-paint-splash ct-paint-splash-purple" fill="#8d639d">
              <circle cx="24" cy="-12" r="2.5" />
              <circle cx="29" cy="-19" r="1.5" />
              <path d="M22-3v6" stroke="#8d639d" strokeWidth="2" strokeLinecap="round" />
            </g>
          </g>
          <g fill="#f6e6ab" stroke="#8d9b60" strokeWidth="1.5">
            <path d="M333 199v-15m-5 1 5 6 5-8m-13 11 8 6 7-8m-16 8 9 5 8-7" />
            <path d="M653 214v-17m-5 2 5 5 5-8m-12 12 7 4 6-7" />
          </g>
          <g className="ct-delivery-rider" transform="translate(421 184)">
            <g className="ct-sheep-bounce">
              <SheepRider />
            </g>
          </g>
          <g className="ct-rival-rider" transform="translate(760 221)">
            <g className="ct-sheep-bounce">
              <SheepRider rival />
            </g>
          </g>
          <g className="ct-blood-spray" fill="#ba4140" aria-hidden="true">
            <path d="M602 184q-12-14-18-10 1 9 18 10m0 0q-4-19 3-20 7 8-3 20m0 0q12-15 16-7-1 6-16 7" />
            <circle cx="581" cy="165" r="3" />
            <circle cx="620" cy="171" r="2.5" />
            <circle cx="593" cy="155" r="2" />
            <circle cx="617" cy="193" r="2" />
          </g>
          <g
            className="ct-delivered-logo"
            filter="url(#ct-harbor-shadow)"
            fontFamily="Georgia, serif"
            fontWeight="bold"
            fontSize="106"
            textAnchor="middle"
          >
            {'CATAN'.split('').map((letter, index) => (
              <g key={index} className={`ct-sign-letter ct-sign-letter-${index}`}>
                <text x={330 + index * 85} y="156" fill="#95652f" stroke="#95652f" strokeWidth="4">
                  {letter}
                </text>
                <text
                  x={330 + index * 85}
                  y="150"
                  fill="url(#ct-harbor-gold)"
                  stroke="#fff3c4"
                  strokeWidth="1"
                >
                  {letter}
                </text>
              </g>
            ))}
          </g>
          <g fill="none" stroke="#78948b" strokeWidth="2" strokeLinecap="round">
            <path d="M207 80q7-7 14 0 7-7 14 0m529-32q6-6 12 0 6-6 12 0" />
          </g>
        </svg>
        <div className="ct-harbor-hero-footer">
          <button
            type="button"
            className="ct-intro-toggle"
            onClick={() => {
              if (playing) setPlaying(false);
              else {
                setReplay((value) => value + 1);
                setPlaying(true);
              }
            }}
            aria-label={playing ? 'Skip island intro' : 'Replay island intro'}
          >
            {playing ? 'Skip intro' : '↻ Replay'}
          </button>
        </div>
      </section>
      <div
        className="ct-harbor-panels"
        onFocusCapture={() => {
          // Keyboard and pointer users can go straight to the forms at any point.
          if (playing) setPlaying(false);
        }}
      >
        {children}
      </div>
    </div>
  );
}
