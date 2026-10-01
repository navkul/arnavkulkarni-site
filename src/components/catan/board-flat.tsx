'use client';
import { useId, useState } from 'react';
import { ResourceIcon, PieceArt } from './cards';
import { TerrainArt, PortArt } from './art';
import type { Board as BoardState } from '@/lib/catan/types';
import { PLAYER_COLORS } from '@/lib/catan/types';
import { OPENING_REVEAL_MS } from '@/lib/catan/motion-timing';
import { useAnimationDelay } from './table-motion';
import './move-motion.css';
export { PLAYER_COLORS } from '@/lib/catan/types';
export const RESOURCE_COLORS = {
  wood: '#487b58',
  brick: '#b36b4e',
  sheep: '#9baa62',
  wheat: '#d6b257',
  ore: '#87949b',
  desert: '#ddc8a0',
};
export default function Board({
  board,
  vertices,
  edges,
  robber,
  onVertex,
  onEdge,
  onHex,
  selectedEdges = [],
  reveal = false,
  colors = [0, 1, 2, 3, 4, 5],
  revealAt,
  now = 0,
}: {
  board: BoardState;
  vertices: number[];
  edges: number[];
  robber: boolean;
  onVertex: (id: number) => void;
  onEdge: (id: number) => void;
  onHex: (id: number) => void;
  selectedEdges?: number[];
  reveal?: boolean;
  colors?: number[];
  revealAt?: number;
  now?: number;
}) {
  const artworkId = useId();
  const [zoom, setZoom] = useState(false);
  const opening = !!revealAt && now < revealAt + OPENING_REVEAL_MS;
  const openingDelay = useAnimationDelay(revealAt ?? 0, now);
  const extentX = Math.max(...board.vertices.map((v) => Math.abs(v.x))) * 60 + 125;
  const extentY = Math.max(...board.vertices.map((v) => Math.abs(v.y))) * 60 + 125;
  const key = (event: React.KeyboardEvent, fn: () => void) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fn();
    }
  };
  return (
    <div
      className={`ct-board-shell ${opening ? 'ct-board-opening' : !revealAt && reveal ? 'ct-board-reveal' : ''}`}
      style={
        {
          '--tile-duration': `${OPENING_REVEAL_MS * 0.18}ms`,
          '--face-duration': `${OPENING_REVEAL_MS * 0.21}ms`,
          '--number-duration': `${OPENING_REVEAL_MS * 0.15}ms`,
        } as React.CSSProperties
      }
    >
      <div className="ct-board-toolbar">
        <span>
          {revealAt && now < revealAt
            ? 'Preparing your island…'
            : opening
              ? 'Building your island…'
              : 'Tap a highlighted spot to play'}
        </span>
        <button onClick={() => setZoom(!zoom)} aria-pressed={zoom}>
          {zoom ? 'Fit island' : 'Zoom in'}
        </button>
      </div>
      <div className="ct-board-scroll">
        <svg
          className="ct-board"
          style={{ minWidth: zoom ? 850 : undefined }}
          viewBox={`${-extentX} ${-extentY} ${extentX * 2} ${extentY * 2}`}
          aria-label="Catan island board"
        >
          <defs>
            {Object.keys(RESOURCE_COLORS).map((resource) => (
              <symbol key={resource} id={`${artworkId}-${resource}`} viewBox="-60 -60 120 120">
                <TerrainArt kind={resource as keyof typeof RESOURCE_COLORS} />
              </symbol>
            ))}
            {board.hexes.map((h) => (
              <clipPath key={h.id} id={`${artworkId}-clip-${h.id}`}>
                <polygon
                  points={h.vertices
                    .map((id) => `${board.vertices[id].x * 60},${board.vertices[id].y * 60}`)
                    .join(' ')}
                />
              </clipPath>
            ))}
            <filter id="tile-shadow">
              <feDropShadow dx="0" dy="3" stdDeviation="3" floodOpacity=".12" />
            </filter>
          </defs>
          {board.hexes.map((h) => (
            <g
              key={h.id}
              role={robber && h.id !== board.robber ? 'button' : undefined}
              tabIndex={robber && h.id !== board.robber ? 0 : undefined}
              aria-label={`Hex ${h.id + 1}: ${h.resource}, ${h.number || 'no production'}${h.id === board.robber ? ', robber' : ''}`}
              className={`ct-tile ${robber && h.id !== board.robber ? 'ct-hex-target' : ''}`}
              style={
                {
                  '--tile-delay': `${openingDelay + (h.id / board.hexes.length) * OPENING_REVEAL_MS * 0.16}ms`,
                  '--face-delay': `${openingDelay + OPENING_REVEAL_MS * 0.25 + (h.id / board.hexes.length) * OPENING_REVEAL_MS * 0.21}ms`,
                  '--number-delay': `${openingDelay + OPENING_REVEAL_MS * 0.6 + ((board.tokenOrder?.indexOf(h.id) ?? h.id) / board.hexes.length) * OPENING_REVEAL_MS * 0.2}ms`,
                  animationDelay: `${((h.id * 7) % board.hexes.length) * 24}ms`,
                } as React.CSSProperties
              }
              onClick={() => robber && h.id !== board.robber && onHex(h.id)}
              onKeyDown={(e) => key(e, () => robber && h.id !== board.robber && onHex(h.id))}
            >
              <polygon
                points={h.vertices
                  .map((id) => `${board.vertices[id].x * 60},${board.vertices[id].y * 60}`)
                  .join(' ')}
                fill={RESOURCE_COLORS[h.resource]}
                stroke="#f5e5bd"
                strokeWidth="3"
                filter="url(#tile-shadow)"
              />
              <g className="ct-terrain-face" clipPath={`url(#${artworkId}-clip-${h.id})`}>
                <use
                  href={`#${artworkId}-${h.resource}`}
                  x={h.x * 60 - 61}
                  y={h.y * 60 - 61}
                  width="122"
                  height="122"
                />
              </g>
              <polygon
                points={h.vertices
                  .map((id) => `${board.vertices[id].x * 60},${board.vertices[id].y * 60}`)
                  .join(' ')}
                fill="none"
                stroke="#f6e3ba"
                strokeWidth="2.5"
              />
              {h.number > 0 && (
                <g className="ct-number-token">
                  <circle cx={h.x * 60} cy={h.y * 60 + 4} r="21" fill="#263e37" opacity=".18" />
                  <circle
                    cx={h.x * 60}
                    cy={h.y * 60}
                    r="21"
                    fill="#fff6de"
                    stroke="#cfb983"
                    strokeWidth="1"
                  />
                  <text
                    x={h.x * 60}
                    y={h.y * 60 + 3}
                    textAnchor="middle"
                    fill={[6, 8].includes(h.number) ? '#a93625' : '#353d36'}
                    fontSize="19"
                    fontWeight="700"
                  >
                    {h.number}
                  </text>
                  <text
                    x={h.x * 60}
                    y={h.y * 60 + 15}
                    textAnchor="middle"
                    fill={[6, 8].includes(h.number) ? '#a93625' : '#806d44'}
                    fontSize="8"
                  >
                    {'•'.repeat(6 - Math.abs(7 - h.number))}
                  </text>
                </g>
              )}
              {board.robber === h.id && (
                <g aria-label="Robber">
                  <circle cx={h.x * 60 + 24} cy={h.y * 60 - 11} r="7" fill="#263a36" />
                  <path
                    d={`M${h.x * 60 + 19},${h.y * 60 - 5} l-5,18 h20 l-5,-18 Z`}
                    fill="#263a36"
                    stroke="#fdf4d9"
                    strokeWidth="1.5"
                  />
                </g>
              )}
            </g>
          ))}
          {board.edges
            .filter((e) =>
              board.ports
                ? board.ports.some((p) => p.edge === e.id)
                : e.hexes.length === 1 &&
                  board.vertices[e.a].port !== undefined &&
                  board.vertices[e.a].port === board.vertices[e.b].port,
            )
            .map((e) => {
              const a = board.vertices[e.a],
                b = board.vertices[e.b],
                x = (a.x + b.x) * 30,
                y = (a.y + b.y) * 30;
              const norm = Math.hypot(x, y),
                px = x + (x / norm) * 65,
                py = y + (y / norm) * 65;
              return (
                <g
                  key={`port-${e.id}`}
                  aria-label={`${a.port === 'any' ? '3:1 any' : `2:1 ${a.port}`} port`}
                >
                  <path
                    d={`M${a.x * 60},${a.y * 60} L${px},${py} L${b.x * 60},${b.y * 60}`}
                    fill="none"
                    stroke="#cfb080"
                    strokeWidth="4"
                  />
                  <g transform={`translate(${px} ${py - 7})`}>
                    <PortArt />
                  </g>
                  <rect x={px - 29} y={py + 17} width="58" height="23" rx="5" fill="#f4edd4" />
                  <g transform={`translate(${px + 13} ${py + 28}) scale(.42)`}>
                    <ResourceIcon kind={a.port!} />
                  </g>
                  <text x={px - 10} y={py + 32} textAnchor="middle" fontSize="10" fill="#234d51">
                    {a.port === 'any' ? '3:1' : '2:1'}
                  </text>
                </g>
              );
            })}
          {board.edges.map((e) => {
            const a = board.vertices[e.a],
              b = board.vertices[e.b],
              legal = edges.includes(e.id),
              selected = selectedEdges.includes(e.id);
            return (
              <g
                key={e.id}
                role={legal ? 'button' : undefined}
                tabIndex={legal ? 0 : undefined}
                aria-label={`Build road ${e.id + 1}`}
                className={legal ? 'ct-edge-target' : ''}
                onClick={() => legal && onEdge(e.id)}
                onKeyDown={(event) => key(event, () => legal && onEdge(e.id))}
              >
                {(e.player !== undefined || selected) && (
                  <line
                    x1={a.x * 60}
                    y1={a.y * 60}
                    x2={b.x * 60}
                    y2={b.y * 60}
                    stroke={selected ? '#fef5dc' : PLAYER_COLORS[colors[e.player!]]}
                    strokeWidth="9"
                    strokeLinecap="round"
                  />
                )}
                {legal && (
                  <>
                    <line
                      x1={a.x * 60}
                      y1={a.y * 60}
                      x2={b.x * 60}
                      y2={b.y * 60}
                      stroke="transparent"
                      strokeWidth="23"
                    />
                    <line
                      x1={(a.x * 3 + b.x) * 15}
                      y1={(a.y * 3 + b.y) * 15}
                      x2={(a.x + b.x * 3) * 15}
                      y2={(a.y + b.y * 3) * 15}
                      stroke="#fff"
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray="3 6"
                    />
                  </>
                )}
              </g>
            );
          })}
          {board.vertices.map((v) => {
            const legal = vertices.includes(v.id),
              x = v.x * 60,
              y = v.y * 60,
              building = v.building;
            return (
              <g
                key={v.id}
                role={legal ? 'button' : undefined}
                tabIndex={legal ? 0 : undefined}
                aria-label={`${building ? 'Upgrade city' : 'Build settlement'} ${v.id + 1}`}
                className={legal ? 'ct-vertex-target' : ''}
                onClick={() => legal && onVertex(v.id)}
                onKeyDown={(e) => key(e, () => legal && onVertex(v.id))}
              >
                {legal && (
                  <circle cx={x} cy={y} r="12" fill="#fff9e5" stroke="#264a43" strokeWidth="2" />
                )}
                {building && (
                  <svg
                    x={x - 14}
                    y={y - 17}
                    width="28"
                    height="27"
                    viewBox="0 0 70 64"
                    overflow="visible"
                  >
                    <PieceArt kind={building.kind} color={PLAYER_COLORS[colors[building.player]]} />
                  </svg>
                )}
                {legal && !building && (
                  <text x={x} y={y + 5} textAnchor="middle" fontSize="15" fill="#264a43">
                    +
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
