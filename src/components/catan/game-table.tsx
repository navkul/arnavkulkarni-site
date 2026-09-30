'use client';
import { useState } from 'react';
import Board, { PLAYER_COLORS } from './board';
import {
  RESOURCES,
  cardCount,
  emptyCards,
  type Action,
  type Cards,
  type Resource,
} from '@/lib/catan/types';
import type { RoomView } from '@/lib/catan/view';
import type { Odds } from '@/lib/catan/store';

export function ResourcePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Resource;
  onChange: (r: Resource) => void;
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value as Resource)}>
        {RESOURCES.map((r) => (
          <option key={r}>{r}</option>
        ))}
      </select>
    </label>
  );
}
function CardsPicker({
  label,
  value,
  onChange,
  max,
}: {
  label: string;
  value: Cards;
  onChange: (c: Cards) => void;
  max?: Cards;
}) {
  return (
    <fieldset className="ct-card-picker">
      <legend>{label}</legend>
      {RESOURCES.map((r) => (
        <label key={r}>
          {r}
          <input
            type="number"
            min="0"
            max={max?.[r] ?? 24}
            value={value[r]}
            onChange={(e) =>
              onChange({
                ...value,
                [r]: Math.max(0, Math.min(max?.[r] ?? 24, Number(e.target.value) || 0)),
              })
            }
          />
        </label>
      ))}
    </fieldset>
  );
}
const cardText = (c: Cards) =>
  RESOURCES.filter((r) => c[r])
    .map((r) => `${c[r]} ${r}`)
    .join(', ');
function OddsPanel({ room, history }: { room: RoomView; history: Odds[] }) {
  const odds = room.odds,
    players = room.game!.players;
  return (
    <section className="ct-panel ct-odds">
      <div className="ct-section-heading">
        <h2>Who has the edge?</h2>
        <span className="ct-tag">Server analysis</span>
      </div>
      <p className="ct-muted">
        {odds
          ? odds.revision < room.revision
            ? 'Updating after the latest move…'
            : 'Win estimates after the latest move'
          : 'Simulating possible games…'}
      </p>
      <div className="ct-probability-bar" aria-label="Estimated win probabilities">
        {players.map((p, i) => (
          <div
            key={i}
            style={{
              width: `${odds?.probabilities[i] ?? 100 / players.length}%`,
              background: PLAYER_COLORS[i],
            }}
            title={`${p.name}: ${odds?.probabilities[i] ?? '…'}%`}
          />
        ))}
      </div>
      {players.map((p, i) => (
        <div className="ct-odds-row" key={i}>
          <span>
            <i style={{ background: PLAYER_COLORS[i] }} />
            {p.name}
          </span>
          <strong>{odds ? `${odds.probabilities[i].toFixed(1)}%` : '…'}</strong>
          <span className={(odds?.delta[i] ?? 0) >= 0 ? 'ct-up' : 'ct-down'}>
            {odds ? `${odds.delta[i] > 0 ? '+' : ''}${odds.delta[i].toFixed(1)} pp` : ''}
          </span>
        </div>
      ))}
      {history.length > 1 && (
        <svg
          className="ct-odds-chart"
          viewBox="0 0 300 80"
          role="img"
          aria-label="Win probability history, from 0 to 100 percent"
        >
          <path d="M0 1H300M0 40H300M0 79H300" stroke="#e4e5d9" fill="none" />
          {players.map((_, p) => (
            <polyline
              key={p}
              points={history
                .map(
                  (h, i) => `${(i / (history.length - 1)) * 300},${79 - h.probabilities[p] * 0.78}`,
                )
                .join(' ')}
              fill="none"
              stroke={PLAYER_COLORS[p]}
              strokeWidth="2"
            />
          ))}
        </svg>
      )}
      <details>
        <summary>How the estimate works</summary>
        <p>
          The server knows every hand and simulates future dice, builds, bank trades, development
          cards, and robber moves. It reveals only each player’s estimated chance and change in
          percentage points.
        </p>
        <p>
          {odds?.samples ? `${odds.samples} simulations; ${odds.completed} reached a winner. ` : ''}
          Unfinished simulations use a score-based estimate. This is an experimental model of a
          computer policy; human negotiations and strategy can change the outcome. Small changes may
          be simulation noise.
        </p>
      </details>
    </section>
  );
}
export default function GameTable({
  room,
  history,
  busy,
  act,
  command,
}: {
  room: RoomView;
  history: Odds[];
  busy: boolean;
  act: (a: Action) => Promise<void>;
  command: (c: string) => Promise<void>;
}) {
  const game = room.game!,
    legal = room.legal!,
    me = room.me;
  const [mode, setMode] = useState<'settlement' | 'road' | 'city' | 'free-roads'>(
    game.phase === 'setup-road' ? 'road' : 'settlement',
  );
  const [freeEdges, setFreeEdges] = useState<number[]>([]);
  const [robberHex, setRobberHex] = useState<number>();
  const [victim, setVictim] = useState<number>();
  const [discard, setDiscard] = useState(emptyCards());
  const [give, setGive] = useState<Resource>('wood'),
    [receive, setReceive] = useState<Resource>('ore');
  const [tradeGive, setTradeGive] = useState(emptyCards()),
    [tradeReceive, setTradeReceive] = useState(emptyCards());
  const [tradeTo, setTradeTo] = useState((me + 1) % game.players.length);
  const [development, setDevelopment] = useState('knight');
  const [resourceOne, setResourceOne] = useState<Resource>('wheat'),
    [resourceTwo, setResourceTwo] = useState<Resource>('ore');
  const isActive = game.active === me && room.status === 'playing';
  const isRobber = isActive && game.phase === 'robber';
  const setup = game.phase.startsWith('setup');
  const hand = game.hand!;
  const victims =
    robberHex === undefined
      ? []
      : [
          ...new Set(
            game.board.hexes[robberHex].vertices.flatMap((id) => {
              const player = game.board.vertices[id].building?.player;
              return player !== undefined &&
                player !== me &&
                game.players[player].resourcesCount > 0
                ? [player]
                : [];
            }),
          ),
        ];
  const freeRoads =
    freeEdges.length < 2 &&
    game.board.edges.filter((e) => e.player === me).length + freeEdges.length < 15
      ? game.board.edges
          .filter(
            (e) =>
              e.player === undefined &&
              !freeEdges.includes(e.id) &&
              [e.a, e.b].some((id) => {
                const v = game.board.vertices[id];
                if (v.building) return v.building.player === me;
                return v.edges.some(
                  (edge) => game.board.edges[edge].player === me || freeEdges.includes(edge),
                );
              }),
          )
          .map((e) => e.id)
      : [];
  const selectableVertices = busy
    ? []
    : mode === 'city'
      ? legal.cities
      : mode === 'settlement'
        ? legal.settlements
        : [];
  const selectableEdges = busy
    ? []
    : mode === 'road'
      ? legal.roads
      : mode === 'free-roads'
        ? freeRoads
        : [];
  const phaseText =
    room.status === 'paused'
      ? 'Game paused. Your island is saved.'
      : game.phase === 'finished'
        ? `${game.players[game.winner!].name} wins the island!`
        : game.phase === 'discard'
          ? 'A seven! Players with more than 7 cards must discard half.'
          : isActive
            ? ({
                'setup-settlement': 'Place your starting settlement.',
                'setup-road': 'Connect a road to your new settlement.',
                roll: 'Your turn. Roll the dice or play a development card.',
                robber: 'Move the robber to another hex.',
                trade: game.paired
                  ? 'Your paired turn: build, play a card, or trade with the bank.'
                  : 'Your turn to trade and build.',
              }[game.phase] ?? '')
            : `Waiting for ${game.players[game.active].name}${game.paired ? ' (paired turn)' : ''}.`;
  async function playDevelopment() {
    if (development === 'knight') await act({ type: 'development', card: 'knight' });
    if (development === 'monopoly')
      await act({ type: 'development', card: 'monopoly', resource: resourceOne });
    if (development === 'plenty')
      await act({
        type: 'development',
        card: 'plenty',
        resources:
          cardCount(game.bank) >= 2
            ? [resourceOne, resourceTwo]
            : cardCount(game.bank) === 1
              ? [resourceOne]
              : [],
      });
    if (development === 'roads') {
      setMode('free-roads');
      setFreeEdges([]);
    }
  }
  return (
    <>
      <div className="ct-status" role="status">
        <div>
          <span className="ct-eyebrow">
            {setup
              ? 'Founding the island'
              : `Turn ${game.turn}${game.paired ? ' · paired player' : ''}`}
          </span>
          <h2>{phaseText}</h2>
        </div>
        {game.dice && (
          <div className="ct-dice" aria-label={`Dice: ${game.dice.join(' and ')}`}>
            <span>{game.dice[0]}</span>
            <span>{game.dice[1]}</span>
          </div>
        )}
      </div>
      <div className="ct-players">
        {game.players.map((p, i) => (
          <div
            key={i}
            className={`ct-player ${i === game.active ? 'ct-current' : ''}`}
            style={{ borderTopColor: PLAYER_COLORS[i] }}
          >
            <strong>
              {p.name}
              {i === me ? ' (you)' : ''}
            </strong>
            <span>
              {p.points} points · {p.resourcesCount} resources
            </span>
            <small>
              {p.developmentCount} dev · {p.knights} knights
              {game.longestRoad === i ? ' · Longest road' : ''}
              {game.largestArmy === i ? ' · Largest army' : ''}
            </small>
          </div>
        ))}
      </div>
      <div className="ct-game-layout">
        <div>
          <Board
            board={game.board}
            vertices={selectableVertices}
            edges={selectableEdges}
            robber={isRobber && !busy}
            selectedEdges={freeEdges}
            onVertex={(vertex) =>
              void act({ type: mode === 'city' ? 'city' : 'settlement', vertex })
            }
            onEdge={(edge) =>
              mode === 'free-roads'
                ? setFreeEdges([...freeEdges, edge])
                : void act({ type: 'road', edge })
            }
            onHex={(hex) => {
              setRobberHex(hex);
              const victim = game.board.hexes[hex].vertices
                .map((v) => game.board.vertices[v].building?.player)
                .find((p) => p !== undefined && p !== me && game.players[p].resourcesCount > 0);
              setVictim(victim);
            }}
          />
          {(isActive || game.discard[me] > 0 || game.offer) && (
            <fieldset disabled={busy || room.status !== 'playing'} className="ct-panel ct-controls">
              {isActive && (
                <div className="ct-action-row">
                  {legal.roll && (
                    <button className="ct-primary" onClick={() => void act({ type: 'roll' })}>
                      Roll dice
                    </button>
                  )}
                  {legal.end && (
                    <button className="ct-primary" onClick={() => void act({ type: 'end' })}>
                      End turn
                    </button>
                  )}
                  {legal.buyDevelopment && (
                    <button onClick={() => void act({ type: 'buy-development' })}>
                      Buy development · 1 sheep, wheat, ore
                    </button>
                  )}
                </div>
              )}
              {isActive && (setup || game.phase === 'trade') && (
                <>
                  <div className="ct-action-row">
                    {(['settlement', 'road', 'city'] as const).map((kind) => (
                      <button
                        key={kind}
                        aria-pressed={mode === kind}
                        disabled={
                          !legal[
                            kind === 'city' ? 'cities' : kind === 'road' ? 'roads' : 'settlements'
                          ].length
                        }
                        onClick={() => {
                          setMode(kind);
                          setFreeEdges([]);
                        }}
                      >
                        {kind === 'settlement'
                          ? 'Build settlement'
                          : kind === 'city'
                            ? 'Upgrade city'
                            : 'Build road'}
                      </button>
                    ))}
                  </div>
                  <p className="ct-muted">
                    {setup
                      ? 'Starting pieces are free. Choose a highlighted spot on the island.'
                      : 'Road: wood + brick · Settlement: wood + brick + sheep + wheat · City: 2 wheat + 3 ore'}
                  </p>
                </>
              )}
              {(selectableVertices.length > 0 || selectableEdges.length > 0) && (
                <label className="ct-location-picker">
                  Or choose a board location
                  <select
                    value=""
                    onChange={(e) => {
                      const id = Number(e.target.value);
                      if (mode === 'free-roads') setFreeEdges([...freeEdges, id]);
                      else if (mode === 'road') void act({ type: 'road', edge: id });
                      else void act({ type: mode, vertex: id });
                    }}
                  >
                    <option value="" disabled>
                      Choose{' '}
                      {mode === 'city'
                        ? 'city upgrade'
                        : mode === 'road' || mode === 'free-roads'
                          ? 'road'
                          : 'settlement'}{' '}
                      location
                    </option>
                    {(selectableEdges.length ? selectableEdges : selectableVertices).map((id) => (
                      <option key={id} value={id}>
                        Location {id + 1}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {mode === 'free-roads' && (
                <div className="ct-action-row">
                  <p>{freeEdges.length} of 2 free roads selected.</p>
                  <button
                    disabled={freeEdges.length < 2 && freeRoads.length > 0}
                    onClick={() =>
                      void act({ type: 'development', card: 'roads', edges: freeEdges })
                    }
                  >
                    Place free roads
                  </button>
                  <button
                    onClick={() => {
                      setMode('road');
                      setFreeEdges([]);
                    }}
                  >
                    Cancel selection
                  </button>
                </div>
              )}
              {game.discard[me] > 0 && (
                <div>
                  <CardsPicker
                    label={`Discard exactly ${game.discard[me]} resources`}
                    value={discard}
                    onChange={setDiscard}
                    max={hand.resources}
                  />
                  <button
                    className="ct-primary"
                    disabled={cardCount(discard) !== game.discard[me]}
                    onClick={() => void act({ type: 'discard', cards: discard })}
                  >
                    Discard {cardCount(discard)} cards
                  </button>
                </div>
              )}
              {isRobber && (
                <div className="ct-inline-form">
                  <label>
                    Robber destination
                    <select
                      value={robberHex ?? ''}
                      onChange={(e) => {
                        setRobberHex(e.target.value === '' ? undefined : Number(e.target.value));
                        setVictim(undefined);
                      }}
                    >
                      <option value="">Choose a hex</option>
                      {game.board.hexes
                        .filter((h) => h.id !== game.board.robber)
                        .map((h) => (
                          <option key={h.id} value={h.id}>
                            Hex {h.id + 1} · {h.resource} {h.number || ''}
                          </option>
                        ))}
                    </select>
                  </label>
                  {victims.length > 0 && (
                    <label>
                      Steal from
                      <select
                        value={victim ?? ''}
                        onChange={(e) => setVictim(Number(e.target.value))}
                      >
                        <option value="">Choose player</option>
                        {victims.map((p) => (
                          <option key={p} value={p}>
                            {game.players[p].name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <button
                    className="ct-primary"
                    disabled={
                      robberHex === undefined || (victims.length > 0 && victim === undefined)
                    }
                    onClick={() =>
                      void act({
                        type: 'robber',
                        hex: robberHex!,
                        ...(victims.length ? { victim } : {}),
                      })
                    }
                  >
                    Move robber{victims.length ? ' & steal' : ''}
                  </button>
                </div>
              )}
              {legal.development.length > 0 && (
                <details>
                  <summary>Play a development card</summary>
                  <div className="ct-inline-form">
                    <label>
                      Card
                      <select
                        value={
                          legal.development.includes(
                            development as (typeof legal.development)[number],
                          )
                            ? development
                            : ''
                        }
                        onChange={(e) => setDevelopment(e.target.value)}
                      >
                        <option value="" disabled>
                          Choose card
                        </option>
                        {legal.development.map((c) => (
                          <option key={c} value={c}>
                            {c === 'roads'
                              ? 'Road building'
                              : c === 'plenty'
                                ? 'Year of plenty'
                                : c}
                          </option>
                        ))}
                      </select>
                    </label>
                    {['plenty', 'monopoly'].includes(development) && (
                      <ResourcePicker
                        label="Resource"
                        value={resourceOne}
                        onChange={setResourceOne}
                      />
                    )}
                    {development === 'plenty' && cardCount(game.bank) > 1 && (
                      <ResourcePicker
                        label="Second resource"
                        value={resourceTwo}
                        onChange={setResourceTwo}
                      />
                    )}
                    <button
                      disabled={
                        !legal.development.includes(
                          development as (typeof legal.development)[number],
                        )
                      }
                      onClick={() => void playDevelopment()}
                    >
                      Play card
                    </button>
                  </div>
                </details>
              )}
              {legal.end && (
                <details>
                  <summary>Trade with the bank or a harbor</summary>
                  <div className="ct-inline-form">
                    <ResourcePicker
                      label={`Give ${legal.ratios[give]}`}
                      value={give}
                      onChange={setGive}
                    />
                    <ResourcePicker label="Receive 1" value={receive} onChange={setReceive} />
                    <button
                      disabled={
                        give === receive ||
                        hand.resources[give] < legal.ratios[give] ||
                        !game.bank[receive]
                      }
                      onClick={() => void act({ type: 'bank-trade', give, receive })}
                    >
                      Trade {legal.ratios[give]}:1
                    </button>
                  </div>
                </details>
              )}
              {legal.end && !game.paired && (
                <details>
                  <summary>Offer a trade to another player</summary>
                  <label>
                    Trade with
                    <select value={tradeTo} onChange={(e) => setTradeTo(Number(e.target.value))}>
                      {game.players.map(
                        (p, i) =>
                          i !== me && (
                            <option key={i} value={i}>
                              {p.name}
                            </option>
                          ),
                      )}
                    </select>
                  </label>
                  <CardsPicker
                    label="You give"
                    value={tradeGive}
                    onChange={setTradeGive}
                    max={hand.resources}
                  />
                  <CardsPicker
                    label="You receive"
                    value={tradeReceive}
                    onChange={setTradeReceive}
                  />
                  <button
                    onClick={() =>
                      void act({
                        type: 'offer',
                        to: tradeTo,
                        give: tradeGive,
                        receive: tradeReceive,
                      })
                    }
                  >
                    Send trade offer
                  </button>
                </details>
              )}
              {game.offer && (
                <div className="ct-trade-offer">
                  <strong>
                    {game.players[game.offer.from].name} offers {cardText(game.offer.give)}
                  </strong>
                  <p>
                    For {cardText(game.offer.receive)} from {game.players[game.offer.to].name}.
                  </p>
                  {game.offer.to === me && (
                    <button
                      className="ct-primary"
                      onClick={() => void act({ type: 'accept-trade', offer: game.offer!.id })}
                    >
                      Accept trade
                    </button>
                  )}
                  {game.offer.from === me && (
                    <button onClick={() => void act({ type: 'cancel-trade' })}>Cancel offer</button>
                  )}
                </div>
              )}
            </fieldset>
          )}
          <section className="ct-panel">
            <h2>
              Your hand <span className="ct-tag">Only you can see this</span>
            </h2>
            <div className="ct-hand">
              {RESOURCES.map((r) => (
                <div key={r} className={`ct-resource ct-${r}`}>
                  <strong>{hand.resources[r]}</strong>
                  <span>{r}</span>
                </div>
              ))}
            </div>
            <p className="ct-muted">
              Development cards:{' '}
              {hand.development.length
                ? hand.development
                    .map(
                      (c) =>
                        `${c.kind === 'victory' ? 'Victory point' : c.kind}${c.boughtTurn === game.turn && c.kind !== 'victory' ? ' (next turn)' : ''}`,
                    )
                    .join(' · ')
                : 'None yet'}
            </p>
          </section>
        </div>
        <aside>
          <OddsPanel room={room} history={history} />
          <section className="ct-panel">
            <h2>At the table</h2>
            <p className="ct-muted">
              First to 10 points on their turn wins. Longest road (5+) and largest army (3+) are
              worth 2 points each.
            </p>
            <div className="ct-action-row">
              {room.canPause && (
                <button disabled={busy} onClick={() => void command('pause')}>
                  Pause & save
                </button>
              )}
              {room.canResume && (
                <button
                  disabled={busy}
                  className="ct-primary"
                  onClick={() => void command('resume')}
                >
                  Resume game
                </button>
              )}
            </div>
            <details>
              <summary>Bank supply · {game.deckCount} development cards</summary>
              <p>{cardText(game.bank)}</p>
            </details>
            <details>
              <summary>Recent moves</summary>
              <ol className="ct-log">
                {game.log
                  .slice(-20)
                  .reverse()
                  .map((entry, i) => (
                    <li key={i}>
                      <small>Turn {entry.turn}</small> {entry.text}
                    </li>
                  ))}
              </ol>
            </details>
          </section>
        </aside>
      </div>
    </>
  );
}
