'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { MoveMotion } from './move-motion';
import { PlayerAvatar } from './avatar';
import { TableSounds } from './table-sounds';
import { DevelopmentArt } from './art';
import { TableDice, AwardFlight, useTableClock } from './table-motion';
import { CardStack, ResourceCard, PieceArt, VictoryPoints, PlayedCard, AwardCard } from './cards';
import {
  OPENING_REVEAL_MS,
  OPENING_COUNTDOWN_MS,
  DICE_VISIBLE_MS,
  DICE_DURATION_MS,
  AWARD_DURATION_MS,
  VISUAL_EVENT_WINDOW_MS,
  productionSequenceEnd,
} from '@/lib/catan/motion-timing';
import { COSTS, canAfford } from '@/lib/catan/engine';
import Board, { PLAYER_COLORS } from './board';
import {
  RESOURCES,
  DEVELOPMENT_NAMES,
  cardCount,
  emptyCards,
  type Action,
  type Cards,
  type Resource,
} from '@/lib/catan/types';
import type { RoomView } from '@/lib/catan/view';
import type { Odds } from '@/lib/catan/store';
import './table-layout.css';

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
function ResourceChoices({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Resource;
  onChange: (resource: Resource) => void;
}) {
  return (
    <fieldset className="ct-resource-choices">
      <legend>{label}</legend>
      <div>
        {RESOURCES.map((resource) => (
          <button
            type="button"
            key={resource}
            aria-label={resource}
            aria-pressed={value === resource}
            title={resource}
            onClick={() => onChange(resource)}
          >
            <ResourceCard kind={resource} />
            {value === resource && <span aria-hidden="true">✓</span>}
          </button>
        ))}
      </div>
    </fieldset>
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
        <div className="ct-picker-resource" key={r}>
          <button
            type="button"
            className="ct-picker-card"
            aria-label={`Add ${r} to ${label}`}
            disabled={value[r] >= (max?.[r] ?? 24)}
            onClick={() => onChange({ ...value, [r]: Math.min(max?.[r] ?? 24, value[r] + 1) })}
          >
            <span className="ct-picker-art" aria-hidden="true">
              <ResourceCard kind={r} />
            </span>
            <span aria-hidden="true" className="ct-picker-plus">
              +
            </span>
          </button>
          <label>
            <span className="ct-sr-only">{r}</span>
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
        </div>
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
              background: PLAYER_COLORS[p.color],
            }}
            title={`${p.name}: ${odds?.probabilities[i] ?? '…'}%`}
          />
        ))}
      </div>
      {players.map((p, i) => (
        <div className="ct-odds-row" key={i}>
          <span>
            <i style={{ background: PLAYER_COLORS[p.color] }} />
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
              stroke={PLAYER_COLORS[players[p].color]}
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
  const now = useTableClock(
    room.serverNow,
    Math.max(
      (room.opening?.revealAt ?? 0) + OPENING_REVEAL_MS,
      (room.diceEvent?.at ?? 0) + DICE_VISIBLE_MS,
      ...room.awardEvents.map((e) => e.at + AWARD_DURATION_MS),
      ...room.visualEvents.map((e) => e.at + VISUAL_EVENT_WINDOW_MS),
      productionSequenceEnd(room.visualEvents),
    ),
  );
  const opening = room.opening;
  const starting = room.status === 'starting';
  const waitingOpening = !!opening && now < opening.readyAt;
  const waitingDice = !!room.diceEvent && now < room.diceEvent.at + DICE_DURATION_MS;
  const nextRoller = opening?.contenders.find(
    (id) => !opening.rolls.some((r) => r.round === opening.round && r.playerId === id),
  );
  const canRollOrder = starting && !waitingOpening && nextRoller === game.players[me].id;
  const [mode, setMode] = useState<'settlement' | 'road' | 'city' | 'free-roads' | undefined>(
    game.phase === 'setup-road'
      ? 'road'
      : game.phase === 'setup-settlement'
        ? 'settlement'
        : undefined,
  );
  const [freeEdges, setFreeEdges] = useState<number[]>([]);
  const [robberHex, setRobberHex] = useState<number>();
  const [victim, setVictim] = useState<number>();
  const [discard, setDiscard] = useState(emptyCards());
  const [give, setGive] = useState<Resource>('wood'),
    [receive, setReceive] = useState<Resource>('ore');
  const [tradeGive, setTradeGive] = useState(emptyCards()),
    [tradeReceive, setTradeReceive] = useState(emptyCards());
  const [tradeTo, setTradeTo] = useState<number | 'all'>('all');
  const [purchaseNotice, setPurchaseNotice] = useState('');
  const endDialog = useRef<HTMLDialogElement>(null);
  const tradeDialog = useRef<HTMLDialogElement>(null);
  const actionDialog = useRef<HTMLDialogElement>(null);
  const oddsDialog = useRef<HTMLDialogElement>(null);
  const [tradeTab, setTradeTab] = useState<'table' | 'bank'>('table');
  useEffect(() => {
    if (game.discard[me] > 0 && !waitingDice) actionDialog.current?.showModal();
    else if (game.phase === 'discard') actionDialog.current?.close();
  }, [game.discard, game.phase, me, waitingDice]);
  const [development, setDevelopment] = useState('knight');
  const [resourceOne, setResourceOne] = useState<Resource>('wheat'),
    [resourceTwo, setResourceTwo] = useState<Resource>('ore');
  // Reset move drafts when the authoritative revision changes, while keeping the
  // board, dice and open card history mounted across moves and polling updates.
  useEffect(() => {
    if (game.phase !== 'discard' && game.phase !== 'robber') actionDialog.current?.close();
  }, [game.phase]);
  const [seenRevision, setSeenRevision] = useState(room.revision);
  if (seenRevision !== room.revision) {
    setSeenRevision(room.revision);
    setMode(
      game.phase === 'setup-road'
        ? 'road'
        : game.phase === 'setup-settlement'
          ? 'settlement'
          : undefined,
    );
    setFreeEdges([]);
    setRobberHex(undefined);
    setVictim(undefined);
    setDiscard(emptyCards());
    setPurchaseNotice('');
  }
  const isActive =
    game.active === me && room.status === 'playing' && !waitingOpening && !waitingDice;
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
  const phaseText = starting
    ? now < opening!.revealAt
      ? `Building the island in ${Math.ceil((opening!.revealAt - now) / 1000)}…`
      : now < room.startedAt! + OPENING_COUNTDOWN_MS + OPENING_REVEAL_MS
        ? 'Placing the terrain and numbered discs…'
        : `Round ${opening!.round}: ${game.players.find((p) => p.id === nextRoller)?.name ?? 'Everyone'} rolls for first player.`
    : room.status === 'ended'
      ? 'The host ended this game. No win or stats were recorded.'
      : room.status === 'paused'
        ? 'Game paused. Your island is saved.'
        : game.phase === 'finished'
          ? `${game.players[game.winner!].name} wins the island!`
          : waitingDice
            ? ''
            : game.phase === 'discard'
              ? 'A seven! Players with more than 7 cards must discard half.'
              : isActive
                ? ({
                    'setup-settlement': 'Place your starting settlement.',
                    'setup-road': 'Connect a road to your new settlement.',
                    roll: '',
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
    actionDialog.current?.close();
    if (development === 'roads') {
      setMode('free-roads');
      setFreeEdges([]);
    }
  }
  const controls = (isActive || game.discard[me] > 0 || game.offer) && (
    <fieldset
      disabled={busy || waitingDice || room.status !== 'playing'}
      className="ct-panel ct-controls"
    >
      {mode === 'free-roads' && (
        <div className="ct-action-row">
          <p>{freeEdges.length} of 2 free roads selected.</p>
          <button
            disabled={freeEdges.length < 2 && freeRoads.length > 0}
            onClick={async () => {
              await act({ type: 'development', card: 'roads', edges: freeEdges });
              actionDialog.current?.close();
            }}
          >
            Place free roads
          </button>
          <button
            onClick={() => {
              setMode('road');
              setFreeEdges([]);
              actionDialog.current?.close();
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
          {victims.length === 0 && <p>No player has resources to steal here.</p>}
          {victims.length > 0 && (
            <label>
              Steal from
              <select
                value={victim ?? ''}
                onChange={(e) =>
                  setVictim(e.target.value === '' ? undefined : Number(e.target.value))
                }
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
            disabled={robberHex === undefined || (victims.length > 0 && victim === undefined)}
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
        <details open>
          <summary id="ct-play-development">Play a development card</summary>
          <div className="ct-inline-form">
            <label>
              Card
              <select
                value={
                  legal.development.includes(development as (typeof legal.development)[number])
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
                    {DEVELOPMENT_NAMES[c]}
                  </option>
                ))}
              </select>
            </label>
            {['plenty', 'monopoly'].includes(development) && (
              <ResourcePicker label="Resource" value={resourceOne} onChange={setResourceOne} />
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
                !legal.development.includes(development as (typeof legal.development)[number])
              }
              onClick={() => void playDevelopment()}
            >
              Play card
            </button>
          </div>
        </details>
      )}
    </fieldset>
  );
  const completedTrade = room.visualEvents.findLast(
    (event) =>
      ['accept-trade', 'bank-trade'].includes(event.type) &&
      now >= event.at &&
      now < event.at + 2600 &&
      (event.actorId === game.players[me].id || event.targetPlayerId === game.players[me].id),
  );
  const mapActions = (
    <div className="ct-map-actions">
      {canRollOrder && (
        <button className="ct-primary" disabled={busy} onClick={() => void command('roll-order')}>
          Roll for first player
        </button>
      )}
      {legal.roll && !waitingOpening && (
        <button className="ct-primary" disabled={busy} onClick={() => void act({ type: 'roll' })}>
          Roll dice
        </button>
      )}
      {legal.end && !waitingDice && (
        <button className="ct-primary" disabled={busy} onClick={() => void act({ type: 'end' })}>
          End turn
        </button>
      )}
      {!waitingDice && (legal.end || game.offer) && (
        <button
          className={game.offer ? 'ct-trade-alert' : ''}
          onClick={() => {
            setTradeTab(game.paired ? 'bank' : 'table');
            tradeDialog.current?.showModal();
          }}
        >
          {game.offer ? 'View trade' : 'Trade ⇄'}
        </button>
      )}
      {!waitingDice &&
        ((isRobber && robberHex !== undefined) ||
          game.discard[me] > 0 ||
          mode === 'free-roads') && (
          <button onClick={() => actionDialog.current?.showModal()}>
            {isRobber
              ? 'Steal a resource'
              : game.discard[me] > 0
                ? 'Discard cards'
                : 'Place free roads'}
          </button>
        )}
      <details
        className="ct-table-menu"
        onClick={(event) => {
          if (event.target instanceof HTMLElement && event.target.closest('button'))
            event.currentTarget.open = false;
        }}
      >
        <summary aria-label="Table options">•••</summary>
        <div>
          {room.canPause && (
            <button disabled={busy} onClick={() => void command('pause')}>
              Pause &amp; save
            </button>
          )}
          {room.canResume && (
            <button disabled={busy} onClick={() => void command('resume')}>
              Resume game
            </button>
          )}
          {room.canEnd && (
            <button disabled={busy} onClick={() => endDialog.current?.showModal()}>
              End game
            </button>
          )}{' '}
        </div>
      </details>
    </div>
  );
  return (
    <div className="ct-table">
      <div
        className="ct-players"
        style={{ '--player-count': game.players.length } as CSSProperties}
      >
        {game.players.map((p, i) => (
          <div
            key={i}
            data-player-id={p.id}
            className={`ct-player ${i === game.active && room.status === 'playing' ? 'ct-current' : ''}`}
            aria-label={`${p.name}${i === game.active && room.status === 'playing' ? ', taking their turn' : ''}`}
            style={
              {
                borderTopColor: PLAYER_COLORS[p.color],
                '--player-color': PLAYER_COLORS[p.color],
              } as CSSProperties
            }
          >
            <div className="ct-player-head">
              <div className="ct-player-portrait">
                <PlayerAvatar
                  name={p.name}
                  src={p.avatarUrl}
                  color={PLAYER_COLORS[p.color]}
                  size={30}
                />
                {room.soundEvents
                  .filter((event) => event.playerId === p.id && now < event.at + 5000)
                  .slice(-1)
                  .map((event) => (
                    <span
                      key={event.id}
                      className="ct-sound-reaction"
                      role="status"
                      aria-label={`${p.name}: ${event.name}`}
                      title={event.name}
                    >
                      {event.emoji}
                    </span>
                  ))}
              </div>
              <strong title={`${p.name}${i === me ? ' (you)' : ''}`}>{p.name}</strong>
            </div>
            {i === me && <TableSounds key={room.code} room={room} />}
            <VictoryPoints points={p.points} />
            <div className="ct-player-cards">
              <CardStack count={p.resourcesCount} resource="back" label="resource cards" small />
              <CardStack
                count={p.developmentCount}
                development="back"
                label="development cards"
                small
              />
            </div>
            <div className="ct-played-images">
              {p.playedDevelopment.map((card, index) => (
                <PlayedCard key={index} kind={card.kind} />
              ))}
              {(['longestRoad', 'largestArmy'] as const).map((kind) => (
                <span
                  key={kind}
                  data-award-player={`${p.id}-${kind}`}
                  className="ct-award-destination"
                >
                  {game[kind] === i && (
                    <span
                      style={{
                        visibility: room.awardEvents.some(
                          (e) =>
                            e.kind === kind &&
                            e.playerId === p.id &&
                            now < e.at + AWARD_DURATION_MS,
                        )
                          ? 'hidden'
                          : 'visible',
                      }}
                    >
                      <AwardCard kind={kind} small />
                    </span>
                  )}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="ct-game-layout">
        <div className="ct-board-column">
          <div className="ct-island-stage">
            <div className="ct-status ct-map-heading" role="status">
              <div>
                <span className="ct-eyebrow">
                  {setup
                    ? 'Founding the island'
                    : `Turn ${game.turn}${game.paired ? ' · paired player' : ''}`}
                </span>
                <h2 className="ct-turn-heading">
                  <i style={{ background: PLAYER_COLORS[game.players[game.active].color] }} />
                  {starting
                    ? 'A new island'
                    : room.status === 'ended'
                      ? 'Game ended'
                      : room.status === 'paused'
                        ? 'Game paused'
                        : room.status === 'finished'
                          ? `${game.players[game.winner!].name} wins!`
                          : game.players[game.active].name === 'You'
                            ? 'Your turn'
                            : `${game.players[game.active].name}’s turn`}
                  {isActive && <span className="ct-your-turn">Your turn</span>}
                </h2>
                {phaseText && <p>{phaseText}</p>}
              </div>
            </div>
            {room.pauseRequest && (
              <div className="ct-pause-request" role="status">
                <span>
                  {room.pauseRequest.by} wants to pause &amp; save · {room.pauseRequest.votes}/
                  {room.seats.length} agree
                </span>
                {!room.pauseRequest.agreed && (
                  <button disabled={busy} onClick={() => void command('approve-pause')}>
                    Agree to pause
                  </button>
                )}
                <button disabled={busy} onClick={() => void command('decline-pause')}>
                  Keep playing
                </button>
              </div>
            )}
            {starting && opening!.rolls.length > 0 && (
              <div className="ct-opening-scores" aria-label="Opening rolls">
                {opening!.rolls.map((r, i) => (
                  <span key={i}>
                    {game.players.find((p) => p.id === r.playerId)?.name}:{' '}
                    {r.values[0] + r.values[1]}
                    {opening!.round > 1 ? ` (round ${r.round})` : ''}
                  </span>
                ))}
              </div>
            )}
            {purchaseNotice && (
              <p className="ct-map-notice" role="status">
                {purchaseNotice}
              </p>
            )}
            <TableDice room={room} now={now} />
            <Board
              overlayControls={mapActions}
              colors={game.players.map((p) => p.color)}
              activeColor={game.players[me].color}
              selectedHex={robberHex}
              revealAt={opening?.revealAt}
              now={now}
              diceEvent={room.diceEvent}
              visualEvents={room.visualEvents}
              production={
                room.diceEvent && game.dice
                  ? {
                      id: room.diceEvent.id,
                      at: room.diceEvent.at,
                      total: room.diceEvent.values[0] + room.diceEvent.values[1],
                    }
                  : undefined
              }
              board={game.board}
              reveal={game.phase.startsWith('setup') && game.log.length <= 1}
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
                actionDialog.current?.showModal();
              }}
            />
          </div>
          <section className="ct-hand-panel ct-hand-dock" aria-label="Your private hand">
            <div className="ct-hand-dock-header">
              <strong>Your hand</strong>
              <span>
                {cardCount(hand.resources)} resources · {hand.development.length} development
              </span>
            </div>
            <div className="ct-card-hand">
              {RESOURCES.map((r) => (
                <CardStack showEmpty key={r} count={hand.resources[r]} resource={r} label={r} />
              ))}
              {hand.development.map((card, index) => (
                <button
                  className="ct-hand-development"
                  key={`${index}-${card.kind}`}
                  title={`${DEVELOPMENT_NAMES[card.kind]}${card.boughtTurn === game.turn ? ' · playable next turn' : ''}`}
                  aria-label={DEVELOPMENT_NAMES[card.kind]}
                  onClick={() => {
                    setDevelopment(card.kind);
                    if (!legal.development.includes(card.kind))
                      setPurchaseNotice(
                        card.kind === 'victory'
                          ? 'This card adds one hidden victory point.'
                          : 'This card is not playable yet.',
                      );
                    else {
                      actionDialog.current?.showModal();
                    }
                  }}
                >
                  <DevelopmentArt kind={card.kind} />
                </button>
              ))}
            </div>
          </section>
        </div>
        <aside>
          <section className="ct-panel ct-supplies" aria-label="Supplies and purchases">
            {(['development', 'road', 'settlement', 'city'] as const).map((kind) => {
              const stock =
                kind === 'development'
                  ? game.deckCount
                  : kind === 'road'
                    ? 15 - game.board.edges.filter((e) => e.player === me).length
                    : (kind === 'city' ? 4 : 5) -
                      game.board.vertices.filter(
                        (v) => v.building?.player === me && v.building.kind === kind,
                      ).length;
              return (
                <button
                  className="ct-purchase"
                  aria-pressed={kind !== 'development' && mode === kind}
                  data-motion-deck={kind === 'development' ? '' : undefined}
                  key={kind}
                  aria-label={kind === 'development' ? 'Draw development card' : `Buy ${kind}`}
                  disabled={busy || ['paused', 'finished', 'ended'].includes(room.status)}
                  onClick={() => {
                    const freeSetup =
                      setup && kind === (game.phase === 'setup-road' ? 'road' : 'settlement');
                    if (!freeSetup && !canAfford(hand.resources, COSTS[kind])) {
                      setPurchaseNotice('You do not have enough resources for this.');
                      return;
                    }
                    if (!stock) {
                      setPurchaseNotice(
                        kind === 'development'
                          ? 'The development deck is empty.'
                          : `You have no ${kind} pieces left.`,
                      );
                      return;
                    }
                    if (!isActive || (!freeSetup && game.phase !== 'trade')) {
                      setPurchaseNotice('Make purchases during your trade and build phase.');
                      return;
                    }
                    if (kind === 'development') {
                      setPurchaseNotice('');
                      void act({ type: 'buy-development' });
                      return;
                    }
                    const sites =
                      kind === 'road'
                        ? legal.roads
                        : kind === 'city'
                          ? legal.cities
                          : legal.settlements;
                    if (!sites.length) {
                      setPurchaseNotice('There is no legal location for this piece yet.');
                      return;
                    }
                    setMode(kind);
                    setFreeEdges([]);
                    setPurchaseNotice('Choose a highlighted location on the island.');
                  }}
                >
                  <span className="ct-purchase-picture">
                    {kind === 'development' ? (
                      <CardStack
                        showEmpty
                        count={stock}
                        development="back"
                        label="development cards left"
                        small
                      />
                    ) : (
                      <PieceArt kind={kind} color={PLAYER_COLORS[game.players[me].color]} />
                    )}
                  </span>
                  <span className="ct-purchase-info">
                    <strong>
                      {kind === 'development'
                        ? 'Development'
                        : kind[0].toUpperCase() + kind.slice(1)}
                    </strong>
                    <small>{stock} left</small>
                    <span className="ct-cost-cards" aria-label={cardText(COSTS[kind])}>
                      {RESOURCES.filter((r) => COSTS[kind][r]).map((r) => (
                        <span key={r}>
                          <ResourceCard kind={r} />
                          <b>{COSTS[kind][r]}</b>
                        </span>
                      ))}
                    </span>
                  </span>
                </button>
              );
            })}
            <div className="ct-bank" data-motion-bank aria-label="Resources remaining in the bank">
              {RESOURCES.map((r) => (
                <CardStack
                  key={r}
                  showEmpty
                  count={game.bank[r]}
                  resource={r}
                  label={`${r} left in bank`}
                  small
                />
              ))}
            </div>
            <div className="ct-award-supply">
              {(['longestRoad', 'largestArmy'] as const).map((kind) => (
                <span key={kind} data-award-source={kind}>
                  {game[kind] === undefined && <AwardCard kind={kind} />}
                </span>
              ))}
            </div>
          </section>
          {room.winProbability && room.status !== 'ended' && (
            <button className="ct-odds-trigger" onClick={() => oddsDialog.current?.showModal()}>
              Win probabilities
            </button>
          )}
        </aside>
      </div>
      {room.awardEvents.map((event) => (
        <AwardFlight key={event.id} event={event} now={now} />
      ))}
      <MoveMotion room={room} now={now} />
      <dialog
        ref={tradeDialog}
        className="ct-game-dialog ct-trade-dialog"
        aria-labelledby="ct-trade-title"
      >
        <header>
          <div>
            <span className="ct-eyebrow">Make a deal</span>
            <h2 id="ct-trade-title">The trading table</h2>
          </div>
          <button aria-label="Close trading table" onClick={() => tradeDialog.current?.close()}>
            ×
          </button>
        </header>
        {legal.end && (
          <div className="ct-trade-tabs" role="group" aria-label="Trade type">
            {!game.paired && (
              <button aria-pressed={tradeTab === 'table'} onClick={() => setTradeTab('table')}>
                Players
              </button>
            )}
            <button aria-pressed={tradeTab === 'bank'} onClick={() => setTradeTab('bank')}>
              Bank &amp; ports
            </button>
          </div>
        )}
        {completedTrade && (
          <div key={completedTrade.id} className="ct-trade-success" role="status">
            <span aria-hidden="true">✦</span> Deal made — cards exchanged.
            <div className="ct-trade-success-cards" aria-hidden="true">
              {RESOURCES.filter((r) => completedTrade.give?.[r]).map((r) => (
                <ResourceCard key={'give-' + r} kind={r} />
              ))}
              <b>⇄</b>
              {RESOURCES.filter((r) => completedTrade.receive?.[r]).map((r) => (
                <ResourceCard key={'get-' + r} kind={r} />
              ))}
            </div>
          </div>
        )}
        <fieldset disabled={busy || room.status !== 'playing'}>
          {legal.end && tradeTab === 'bank' && (
            <section className="ct-trade-compose">
              <h3>Bank &amp; ports</h3>
              <div className="ct-bank-resource-pickers">
                <ResourceChoices
                  label={`Give ${legal.ratios[give]}`}
                  value={give}
                  onChange={setGive}
                />
                <span className="ct-bank-exchange" aria-hidden="true">
                  ⇄
                </span>
                <ResourceChoices label="Receive 1" value={receive} onChange={setReceive} />
              </div>
              <div className="ct-inline-form">
                <button
                  disabled={
                    give === receive ||
                    hand.resources[give] < legal.ratios[give] ||
                    !game.bank[receive]
                  }
                  className="ct-primary"
                  onClick={() => void act({ type: 'bank-trade', give, receive })}
                >
                  Trade {legal.ratios[give]}:1
                </button>
              </div>
            </section>
          )}
          {legal.end && !game.paired && tradeTab === 'table' && (
            <section className="ct-trade-compose">
              <h3>Make an offer</h3>
              <label>
                Trade with
                <select
                  value={tradeTo}
                  onChange={(e) =>
                    setTradeTo(e.target.value === 'all' ? 'all' : Number(e.target.value))
                  }
                >
                  <option value="all">Whole table</option>
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
              <CardsPicker label="You receive" value={tradeReceive} onChange={setTradeReceive} />
              <button
                className="ct-primary"
                disabled={busy || cardCount(tradeGive) === 0 || cardCount(tradeReceive) === 0}
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
            </section>
          )}
          {game.offer && (
            <div className="ct-trade-offer">
              <strong>
                {game.players[game.offer.from].name} offers {cardText(game.offer.give)}
              </strong>
              <p>
                For {cardText(game.offer.receive)} from{' '}
                {game.offer.to === 'all'
                  ? 'anyone at the table. First to accept gets the trade'
                  : game.players[game.offer.to].name}
                .
              </p>
              <div className="ct-exchange-preview" aria-hidden="true">
                <div>
                  {RESOURCES.filter((r) => game.offer!.give[r] > 0).map((r) => (
                    <div key={r}>
                      <ResourceCard kind={r} />
                      <b>×{game.offer!.give[r]}</b>
                    </div>
                  ))}
                </div>
                <span>⇄</span>
                <div>
                  {RESOURCES.filter((r) => game.offer!.receive[r] > 0).map((r) => (
                    <div key={r}>
                      <ResourceCard kind={r} />
                      <b>×{game.offer!.receive[r]}</b>
                    </div>
                  ))}
                </div>
              </div>
              {game.offer.from !== me && (game.offer.to === me || game.offer.to === 'all') && (
                <button
                  className="ct-primary"
                  disabled={RESOURCES.some((r) => hand.resources[r] < game.offer!.receive[r])}
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
          {!legal.end && !game.offer && <p>No open offer. Start a trade on your turn.</p>}
        </fieldset>
      </dialog>
      <dialog ref={actionDialog} className="ct-game-dialog" aria-label="Your move">
        <header>
          <h2>
            {isRobber
              ? victims.length
                ? 'Who will you steal from?'
                : 'Move the robber'
              : 'Your move'}
          </h2>
          <button aria-label="Close move" onClick={() => actionDialog.current?.close()}>
            ×
          </button>
        </header>
        {controls}
      </dialog>
      <dialog ref={oddsDialog} className="ct-game-dialog" aria-label="Win probabilities">
        <header>
          <h2>Win probabilities</h2>
          <button aria-label="Close probabilities" onClick={() => oddsDialog.current?.close()}>
            ×
          </button>
        </header>
        <OddsPanel room={room} history={history} />
      </dialog>
      <dialog
        ref={endDialog}
        className="ct-end-dialog"
        aria-labelledby="ct-end-title"
        aria-describedby="ct-end-description"
      >
        <h2 id="ct-end-title">End this game?</h2>
        <p id="ct-end-description">
          This closes the table for everyone. No winner is declared and no player stats change. This
          cannot be undone.
        </p>
        <div className="ct-action-row">
          <button autoFocus onClick={() => endDialog.current?.close()}>
            Keep playing
          </button>
          <button
            className="ct-danger"
            disabled={busy}
            onClick={async () => {
              await command('end-game');
              endDialog.current?.close();
            }}
          >
            End game for everyone
          </button>
        </div>
      </dialog>
    </div>
  );
}
