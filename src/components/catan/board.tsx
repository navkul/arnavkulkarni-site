'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Board as BoardState, VisualEvent } from '@/lib/catan/types';
import FlatBoard from './board-flat';
import type { createIsland } from './three-scene';
import './board-3d.css';

export { PLAYER_COLORS } from '@/lib/catan/types';
export { RESOURCE_COLORS } from './board-flat';
export interface BoardProps {
  board: BoardState;
  overlayControls?: ReactNode;
  vertices: number[];
  edges: number[];
  robber: boolean;
  onVertex: (id: number) => void;
  onEdge: (id: number) => void;
  onHex: (id: number) => void;
  visualEvents?: VisualEvent[];
  selectedEdges?: number[];
  selectedHex?: number;
  activeColor?: number;
  reveal?: boolean;
  colors?: number[];
  revealAt?: number;
  now?: number;
  production?: { id: string; at: number; total: number };
  diceEvent?: { id: string; at: number; values: [number, number]; color: number };
}

export default function Board(props: BoardProps) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<ReturnType<typeof createIsland> | null>(null);
  const latest = useRef(props);
  const [mode, setMode] = useState<'loading' | 'three' | 'flat'>('loading');
  const [flat, setFlat] = useState(false);
  useEffect(() => {
    latest.current = props;
    scene.current?.update(props);
  }, [props]);
  useEffect(() => {
    if (flat) return;
    let canceled = false;
    import('./three-scene')
      .then(({ createIsland }) => {
        if (canceled || !host.current) return;
        try {
          scene.current = createIsland(host.current, latest.current, () => {
            setMode('flat');
            setFlat(true);
          });
          setMode('three');
        } catch {
          setMode('flat');
          setFlat(true);
        }
      })
      .catch(() => {
        if (!canceled) {
          setMode('flat');
          setFlat(true);
        }
      });
    return () => {
      canceled = true;
      scene.current?.dispose();
      scene.current = null;
    };
  }, [flat]);

  const useFlat = flat || mode === 'flat';
  const hover = (kind: 'vertex' | 'edge' | 'hex', id: number) => scene.current?.hover({ kind, id });
  return (
    <section
      className={`ct3d-board ${useFlat ? 'ct3d-flat' : ''}`}
      aria-label={useFlat ? undefined : 'Catan island board'}
      data-renderer={useFlat ? 'svg' : mode}
    >
      {useFlat ? (
        <FlatBoard {...props} />
      ) : (
        <>
          <div className="ct3d-viewport" ref={host}>
            <div className="ct3d-controls" aria-label="Map controls">
              <button
                aria-label="Zoom out"
                title="Zoom out"
                onClick={() => scene.current?.zoom(1.15)}
              >
                −
              </button>
              <button
                aria-label="Zoom in"
                title="Zoom in"
                onClick={() => scene.current?.zoom(0.87)}
              >
                +
              </button>
              <button
                aria-label="Reset view"
                title="Reset view"
                onClick={() => scene.current?.reset()}
              >
                ↺
              </button>
            </div>
            {props.board.hexes.map((hex) => (
              <span
                key={`origin${hex.id}`}
                className="ct3d-motion-origin"
                aria-hidden="true"
                data-motion-hex={hex.id}
                data-world-x={hex.x}
                data-world-z={hex.y}
                data-world-y={0.48}
              />
            ))}
            {mode === 'loading' && (
              <div className="ct3d-loading" role="status">
                <span />
                Preparing the island…
              </div>
            )}
            <div className="ct3d-target-layer">
              {props.vertices.map((id) => {
                const v = props.board.vertices[id];
                return (
                  <button
                    key={`v${id}`}
                    className="ct3d-target ct3d-vertex"
                    data-world-x={v.x}
                    data-world-z={v.y}
                    data-world-y={0.36}
                    aria-label={`${v.building ? 'Upgrade city' : 'Build settlement'} ${id + 1}`}
                    onMouseEnter={() => hover('vertex', id)}
                    onMouseLeave={() => scene.current?.hover()}
                    onFocus={() => hover('vertex', id)}
                    onBlur={() => scene.current?.hover()}
                    onClick={() => props.onVertex(id)}
                  >
                    <span aria-hidden="true">+</span>
                    <span className="ct3d-target-name">
                      {v.building ? 'Upgrade to city' : 'Build settlement'}
                    </span>
                  </button>
                );
              })}
              {props.edges.map((id) => {
                const edge = props.board.edges[id],
                  a = props.board.vertices[edge.a],
                  b = props.board.vertices[edge.b];
                return (
                  <button
                    key={`e${id}`}
                    className="ct3d-target ct3d-edge"
                    data-world-x={(a.x + b.x) / 2}
                    data-world-z={(a.y + b.y) / 2}
                    data-world-y={0.34}
                    aria-label={`Build road ${id + 1}`}
                    onMouseEnter={() => hover('edge', id)}
                    onMouseLeave={() => scene.current?.hover()}
                    onFocus={() => hover('edge', id)}
                    onBlur={() => scene.current?.hover()}
                    onClick={() => props.onEdge(id)}
                  >
                    <span aria-hidden="true">·</span>
                    <span className="ct3d-target-name">Build road</span>
                  </button>
                );
              })}
              {props.robber &&
                props.board.hexes
                  .filter((h) => h.id !== props.board.robber)
                  .map((h) => (
                    <button
                      key={`h${h.id}`}
                      className={`ct3d-target ct3d-hex ${props.selectedHex === h.id ? 'is-selected' : ''}`}
                      data-world-x={h.x}
                      data-world-z={h.y}
                      data-world-y={0.6}
                      aria-label={`Hex ${h.id + 1}: ${h.resource}, ${h.number || 'no production'}`}
                      onMouseEnter={() => hover('hex', h.id)}
                      onMouseLeave={() => scene.current?.hover()}
                      onFocus={() => hover('hex', h.id)}
                      onBlur={() => scene.current?.hover()}
                      onClick={() => props.onHex(h.id)}
                    >
                      <span aria-hidden="true">⌖</span>
                      <span className="ct3d-target-name">
                        Move robber · {h.resource} {h.number || ''}
                      </span>
                    </button>
                  ))}
            </div>
          </div>
          <span className="ct3d-sr-only">
            Drag the map to orbit. Scroll or pinch to zoom. Use the map controls or legal building
            buttons with a keyboard.
            {props.board.hexes
              .map(
                (h) =>
                  ` Hex ${h.id + 1}: ${h.resource}, ${h.number || 'no production'}${props.board.robber === h.id ? ', robber' : ''}.`,
              )
              .join('')}
          </span>
        </>
      )}
      {props.overlayControls && (
        <div className="ct3d-overlay-controls">{props.overlayControls}</div>
      )}
    </section>
  );
}
