'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import LandingScene, { LandingShip } from './landing-scene';
import { PlayerAvatar } from './avatar';
import GameTable from './game-table';
import SettingHelp from './setting-help';
import { PLAYER_COLORS, PLAYER_COLOR_NAMES } from '@/lib/catan/types';
import type { Action } from '@/lib/catan/types';
import type { RoomSummary, RoomView } from '@/lib/catan/view';
import type { Odds } from '@/lib/catan/store';

interface Bootstrap {
  hosting: 'server' | 'local';
  localAddresses: string[];
  user: { name: string | null; registered: boolean; canRegister: boolean };
  rooms: RoomSummary[];
}
class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
async function request<T>(hosting: 'server' | 'local', query = '', body?: unknown): Promise<T> {
  const params = new URLSearchParams(query);
  params.set('hosting', hosting);
  const res = await fetch(`/api/catan?${params}`, {
    cache: 'no-store',
    ...(body
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = await res.json();
  if (!res.ok)
    throw new RequestError(data.error ?? 'Request failed. Please try again.', res.status);
  return data as T;
}
export default function CatanApp({
  initialCode = '',
  initialHosting = 'server',
  localAvailable = false,
  localOnly = false,
  testingAvailable = false,
}: {
  initialCode?: string;
  initialHosting?: 'server' | 'local';
  localAvailable?: boolean;
  localOnly?: boolean;
  testingAvailable?: boolean;
}) {
  const basePath = '/catan';
  const [selfHost, setSelfHost] = useState(
    localOnly || (initialHosting === 'local' && !initialCode),
  );
  const [code, setCode] = useState(initialCode);
  const [roomHosting, setRoomHosting] = useState(
    initialCode === 'TESTING' ? 'server' : initialHosting,
  );
  const lobbyHosting = selfHost && localAvailable ? 'local' : 'server';
  // A development test table uses the local store without changing the host's settings.
  const hosting = code ? roomHosting : lobbyHosting;
  const api = useCallback(
    <T,>(query = '', body?: unknown) => request<T>(hosting, query, body),
    [hosting],
  );
  const [winProbability, setWinProbability] = useState(true);
  const [findLocal, setFindLocal] = useState(false);
  const [bootstrap, setBootstrap] = useState<Bootstrap>();
  const [room, setRoom] = useState<RoomView>();
  const [history, setHistory] = useState<Odds[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [offline, setOffline] = useState(false);
  const [guestName, setGuestName] = useState(''),
    [roomName, setRoomName] = useState(''),
    [capacity, setCapacity] = useState(4),
    [joinCode, setJoinCode] = useState('');
  const [copied, setCopied] = useState(false);
  const currentCode = useRef(code);
  currentCode.current = code;
  const currentRoom = useRef(room);
  currentRoom.current = room;
  const sequence = useRef(0);
  const mutationPending = useRef(false);
  const refresh = useCallback(
    async (background = false) => {
      const ticket = ++sequence.current;
      try {
        const data = !background || !code ? await api<Bootstrap>() : undefined;
        if (ticket !== sequence.current) return;
        if (data) setBootstrap(data);
        setOffline(false);
        if (code) {
          if (code === 'TESTING') {
            const result = await api<{ room: RoomView }>('', { command: 'open-practice' });
            if (currentCode.current !== code || ticket !== sequence.current) return;
            currentCode.current = result.room.code;
            setCode(result.room.code);
            setRoom(result.room);
            setHistory([]);
            window.history.replaceState(null, '', `/catan?room=${result.room.code}`);
            return;
          }
          const result = await api<{ room: RoomView; history: Odds[] }>(
            `?room=${encodeURIComponent(code)}`,
          );
          if (currentCode.current !== code || ticket !== sequence.current) return;
          setRoom((previous) =>
            previous?.code === code && previous.revision > result.room.revision
              ? previous
              : result.room,
          );
          setHistory(result.history);
        }
      } catch (err) {
        if (ticket !== sequence.current) return;
        if (err instanceof RequestError && err.status === 404 && code) {
          currentCode.current = '';
          setCode('');
          setRoom(undefined);
          setHistory([]);
          setOffline(false);
          window.history.replaceState(
            null,
            '',
            lobbyHosting === 'local' ? '/catan?hosting=local' : '/catan',
          );
          setError('This table is no longer available. Open or join another table.');
        } else if (
          err instanceof RequestError &&
          err.status === 503 &&
          testingAvailable &&
          hosting === 'server' &&
          !code
        ) {
          setOffline(false);
          setError(
            'Online tables need a database. Use Open test table to test locally — no Self-host setting needed.',
          );
        } else {
          setOffline(true);
          setError((err as Error).message);
        }
      }
    },
    [code, api, hosting, lobbyHosting, testingAvailable],
  );
  useEffect(() => {
    const seq = sequence;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let initial = true;
    const poll = async () => {
      if (!mutationPending.current) {
        await refresh(!initial);
        initial = false;
      }
      if (!disposed)
        timer = setTimeout(poll, document.hidden ? 5000 : currentRoom.current?.game ? 400 : 1800);
    };
    void poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
      seq.current++;
    };
  }, [refresh]);
  function openRoom(next: string, nextHosting = hosting) {
    setCode(next);
    setRoomHosting(nextHosting);
    currentCode.current = next;
    setRoom(undefined);
    setHistory([]);
    setError('');
    setCopied(false);
    const params = new URLSearchParams();
    if (next) params.set('room', next);
    if ((next ? nextHosting : lobbyHosting) === 'local') params.set('hosting', 'local');
    window.history.replaceState(null, '', `${basePath}${params.size ? '?' + params : ''}`);
  }
  async function run(fn: () => Promise<void>, refreshAfter = true) {
    if (busy || mutationPending.current) return;
    mutationPending.current = true;
    // An older poll must not replace the result of this command or its account refresh.
    sequence.current++;
    setBusy(true);
    setError('');
    try {
      await fn();
      if (refreshAfter) await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      mutationPending.current = false;
      setBusy(false);
    }
  }
  async function command(command: string, action?: Action) {
    if (!room) return;
    await run(async () => {
      const body = {
        command,
        code: room.code,
        revision: room.revision,
        action,
        ...(['approve-pause', 'decline-pause'].includes(command)
          ? { pauseRequestId: room.pauseRequest?.id }
          : {}),
      };
      let result: { room: RoomView | null };
      try {
        result = await api('', body);
      } catch (error) {
        if (
          !(error instanceof RequestError) ||
          error.status !== 409 ||
          !['pause', 'resume', 'approve-pause', 'decline-pause'].includes(command)
        )
          throw error;
        const fresh = await api<{ room: RoomView }>(`?room=${room.code}`);
        setRoom(fresh.room);
        // These table-management intents survive another player's move. Votes retain their
        // original request ID, so they cannot accidentally approve a different pause request.
        result = await api('', { ...body, revision: fresh.room.revision });
      }
      if (command === 'leave' || !result.room) openRoom('');
      else setRoom(result.room);
    }, false);
  }
  const user = bootstrap?.user;
  const profileParams = new URLSearchParams();
  if (hosting === 'local') profileParams.set('hosting', 'local');
  if (code && room && !['finished', 'ended'].includes(room.status))
    profileParams.set('table', code);
  const profileHref = `/catan/profile${profileParams.size ? `?${profileParams}` : ''}`;
  return (
    <main
      className={`ct-app${code ? ' ct-in-game' : ' ct-harbor'}${room?.game ? ' ct-playing' : ''}${room?.game && ['ended', 'finished'].includes(room.status) ? ' ct-detail-view' : ''}`}
    >
      <header className="ct-header">
        <Link href="/" className="ct-back">
          ← Home
        </Link>
        <div className="ct-account-actions">
          {hosting === 'local' && <span className="ct-muted">Local · unranked</span>}
          <Link href={profileHref} className="ct-profile-entry">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <circle cx="12" cy="8" r="3.5" />
              <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
            </svg>
            {user?.registered ? user.name || 'My profile' : 'Sign in / Sign up'}
          </Link>
        </div>
      </header>
      {error && (
        <div className="ct-error" role="alert">
          {error}
          <button onClick={() => setError('')} aria-label="Dismiss error">
            ×
          </button>
        </div>
      )}
      {offline && (
        <p className="ct-offline" role="status">
          Connection lost. Reconnecting…
        </p>
      )}
      {!code && (
        <LandingScene>
          <div className="ct-lobby-grid">
            <section className="ct-lobby-section">
              <LandingShip side="start" />
              <h2>Start a table</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    const result = await api<{ room: RoomView }>('', {
                      command: 'create',
                      name: roomName,
                      capacity,
                      guestName,
                      winProbability,
                      selfHost,
                    });
                    openRoom(result.room.code);
                    setRoom(result.room);
                  });
                }}
              >
                <label>
                  <span className="ct-sr-only">Table name</span>
                  <input
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    minLength={2}
                    maxLength={24}
                    placeholder="Table name"
                    name="table-name"
                    autoComplete="off"
                    data-1p-ignore="true"
                    data-lpignore="true"
                    data-form-type="other"
                    required
                  />
                </label>
                <label>
                  <span className="ct-sr-only">Your name</span>
                  <input
                    value={user?.registered ? (user.name ?? '') : guestName}
                    onChange={(e) => {
                      setGuestName(e.target.value);
                    }}
                    readOnly={user?.registered}
                    minLength={2}
                    maxLength={24}
                    autoComplete="nickname"
                    placeholder="Your name"
                    required
                  />
                </label>
                <details className="ct-settings">
                  <summary>Settings</summary>
                  <div className="ct-setting-row">
                    <label htmlFor="ct-probability">Player win probability</label>
                    <SettingHelp label="player win probability">
                      Show estimated chances of winning after each move. These are simulations, not
                      guarantees.
                    </SettingHelp>
                    <input
                      id="ct-probability"
                      type="checkbox"
                      role="switch"
                      checked={winProbability}
                      onChange={(e) => setWinProbability(e.target.checked)}
                    />
                  </div>
                  <div className="ct-setting-row">
                    <label htmlFor="ct-players">Players</label>
                    <SettingHelp label="players">
                      Maximum seats, from 3 to 6. Five or six players use the larger island and
                      paired turns.
                    </SettingHelp>
                    <output htmlFor="ct-players">{capacity}</output>
                  </div>
                  <input
                    id="ct-players"
                    className="ct-range"
                    type="range"
                    min="3"
                    max="6"
                    step="1"
                    value={capacity}
                    onChange={(e) => setCapacity(Number(e.target.value))}
                  />
                  <div className="ct-range-labels" aria-hidden="true">
                    <span>3</span>
                    <span>4</span>
                    <span>5</span>
                    <span>6</span>
                  </div>
                  <div className="ct-setting-row">
                    <label htmlFor="ct-self-host">Self-host</label>
                    <SettingHelp label="self-host">
                      Host on a computer on your Wi-Fi or hotspot. Works without internet once set
                      up. Local games never count toward stats.
                    </SettingHelp>
                    <input
                      id="ct-self-host"
                      type="checkbox"
                      role="switch"
                      checked={selfHost}
                      disabled={localOnly}
                      onChange={(e) => {
                        setSelfHost(e.target.checked);
                        if (localAvailable)
                          window.history.replaceState(
                            null,
                            '',
                            e.target.checked ? `${basePath}?hosting=local` : basePath,
                          );
                        setFindLocal(false);
                        setError('');
                        setBootstrap(undefined);
                      }}
                    />
                  </div>
                  {selfHost && (
                    <p className="ct-local-note">
                      {localAvailable ? (
                        'Keep this computer running. Local games don’t count toward stats.'
                      ) : (
                        <>
                          Run the local host on this computer first.{' '}
                          <Link href="/catan/local">Set up offline play →</Link>
                        </>
                      )}
                    </p>
                  )}
                </details>
                <button
                  className="ct-primary"
                  disabled={busy || !bootstrap || (selfHost && !localAvailable)}
                >
                  Start table
                </button>
              </form>
              {testingAvailable && (
                <div className="ct-test-start">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const result = await request<{ room: RoomView }>('local', '', {
                          command: 'create-test',
                          name: roomName.trim() || 'Test table',
                          guestName: guestName.trim() || 'You',
                          capacity,
                        });
                        setBootstrap(undefined);
                        setOffline(false);
                        openRoom(result.room.code, 'local');
                        setRoom(result.room);
                      }, false)
                    }
                  >
                    Open test table
                  </button>
                  <p className="ct-muted">
                    Development only · no self-host setup · up to 6 players · no stats
                  </p>
                </div>
              )}
            </section>
            <section className="ct-lobby-section">
              <LandingShip side="join" />
              <h2>Join a table</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const next = joinCode.trim().toUpperCase();
                  openRoom(next, next === 'TESTING' ? 'server' : hosting);
                }}
              >
                <label>
                  <span className="ct-sr-only">Table code</span>
                  <input
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    minLength={6}
                    maxLength={7}
                    pattern="([A-Z2-9]{6}|TESTING)"
                    placeholder="Table code"
                    autoCapitalize="characters"
                    required
                  />
                </label>
                <button className="ct-primary" disabled={busy || !bootstrap}>
                  Join table
                </button>
              </form>
              {hosting === 'local' && (
                <div className="ct-local-tables">
                  <button
                    className="ct-text-button"
                    onClick={() => setFindLocal(!findLocal)}
                    aria-expanded={findLocal}
                  >
                    Find local tables
                  </button>
                  {findLocal && (
                    <div className="ct-room-list">
                      {bootstrap?.rooms
                        .filter((r) => r.status === 'lobby' || r.mine)
                        .map((r) => (
                          <button key={r.code} onClick={() => openRoom(r.code)}>
                            <span>
                              {r.name}
                              <small>
                                {r.players}/{r.capacity} players
                              </small>
                            </span>
                            <span>{r.code} →</span>
                          </button>
                        ))}
                      {!bootstrap?.rooms.length && <p className="ct-muted">No local tables yet.</p>}
                    </div>
                  )}
                </div>
              )}
              {!!bootstrap?.rooms.some((r) => r.mine) && !findLocal && (
                <div className="ct-room-list ct-your-tables">
                  <h3>Your tables</h3>
                  {bootstrap.rooms
                    .filter((r) => r.mine)
                    .map((r) => (
                      <button key={r.code} onClick={() => openRoom(r.code)}>
                        <span>
                          {r.name}
                          <small>{r.status}</small>
                        </span>
                        <span>→</span>
                      </button>
                    ))}
                </div>
              )}
            </section>
          </div>
        </LandingScene>
      )}
      {code && (
        <>
          <div className="ct-room-heading">
            <button onClick={() => openRoom('')}>← All tables</button>
            <div>
              <h1>{room?.name ?? 'Finding your table…'}</h1>
              <span className="ct-room-code">{code}</span>
            </div>
            <button
              onClick={() => {
                const invite = room?.practice
                  ? `${window.location.origin}/catan?room=TESTING`
                  : room?.hosting === 'local' && bootstrap?.localAddresses[0]
                    ? `${bootstrap.localAddresses[0].replace('/catan?', `${basePath}?`)}&room=${code}`
                    : window.location.href;
                if (!navigator.clipboard) {
                  setError(`Invite link: ${invite}`);
                  return;
                }
                void navigator.clipboard
                  ?.writeText(invite)
                  .then(() => setCopied(true))
                  .catch(() => setError('Copy the address from your browser to invite friends.'));
              }}
            >
              {copied ? 'Link copied' : room?.practice ? 'Copy practice link' : 'Copy invite link'}
            </button>
          </div>
          {room?.hosting === 'local' && !!bootstrap?.localAddresses.length && (
            <p className="ct-local-address">
              Join on this Wi-Fi:{' '}
              {bootstrap.localAddresses.map((address) => (
                <a key={address} href={`${address}&room=${code}`}>
                  {address.split('?')[0]}?hosting=local&amp;room={code}
                </a>
              ))}
            </p>
          )}
          {!room && (
            <p className="ct-muted">
              Loading table. If the room code is incorrect, return to all tables and check the
              invitation.
            </p>
          )}
          {room?.testing && room.isHost && (
            <div className="ct-test-toolbar">
              <span>
                <strong>{room.practice ? 'Practice table' : 'Test table'}</strong> ·{' '}
                {room.practice
                  ? 'Only you control this table. No stats.'
                  : 'Normal setup and rules.'}{' '}
                Turns switch automatically.
              </span>
              <label>
                View / control player
                <select
                  value={room.seats.findIndex((seat) => seat.me)}
                  disabled={busy}
                  onChange={(e) =>
                    void run(async () => {
                      const result = await api<{ room: RoomView }>('', {
                        command: 'test-player',
                        code: room.code,
                        revision: room.revision,
                        player: Number(e.target.value),
                      });
                      setRoom(result.room);
                    }, false)
                  }
                >
                  {room.seats.map((seat, i) => (
                    <option key={seat.id} value={i} disabled={!seat.controllable}>
                      {seat.name}
                      {!seat.controllable ? ' · connected player' : ''}
                    </option>
                  ))}
                </select>
              </label>
              {room.status === 'lobby' && (
                <button
                  disabled={busy || room.seats.length >= 6}
                  onClick={() => void command('test-add-player')}
                >
                  Add player ({room.seats.length}/6)
                </button>
              )}
              {room.practice && room.status !== 'lobby' && (
                <button disabled={busy} onClick={() => void command('reset-practice')}>
                  Restart setup
                </button>
              )}
              <button disabled={busy} onClick={() => void command('delete-test')}>
                Delete test table
              </button>
            </div>
          )}
          {room && (!room.game || room.status === 'lobby') && (
            <section className="ct-panel ct-waiting">
              <span className="ct-eyebrow">The island is waiting</span>
              <h2>
                {room.seats.length} of {room.capacity} seats filled
              </h2>
              <div className="ct-seat-grid">
                {Array.from({ length: room.capacity }, (_, i) => (
                  <div className={room.seats[i] ? 'ct-seat-filled' : 'ct-seat-empty'} key={i}>
                    {room.seats[i] ? (
                      <PlayerAvatar
                        name={room.seats[i].name}
                        src={room.seats[i].avatarUrl}
                        color={PLAYER_COLORS[room.seats[i].color]}
                        size={48}
                      />
                    ) : (
                      <span style={{ background: '#dedfd3' }}>+</span>
                    )}
                    <strong>{room.seats[i]?.name ?? 'Open seat'}</strong>
                    <small>
                      {room.seats[i]
                        ? `${room.seats[i].host ? 'Host · ' : ''}${room.seats[i].registered ? 'Profile' : 'Guest'}`
                        : 'Invite a friend'}
                    </small>
                  </div>
                ))}
              </div>
              {room.joined &&
                room.status === 'lobby' &&
                (() => {
                  const mine = room.seats.find((s) => s.me)!;
                  const choose = (color: number, locked: boolean) =>
                    void run(async () => {
                      const result = await api<{ room: RoomView }>('', {
                        command: 'color',
                        code,
                        revision: room.revision,
                        color,
                        locked,
                      });
                      setRoom(result.room);
                    });
                  return (
                    <div className="ct-color-picker" aria-label="Your player color">
                      {PLAYER_COLORS.map((color, i) => (
                        <button
                          key={color}
                          type="button"
                          aria-label={`${PLAYER_COLOR_NAMES[i]} color`}
                          title={PLAYER_COLOR_NAMES[i]}
                          aria-pressed={mine.color === i}
                          style={{ background: color }}
                          disabled={
                            busy ||
                            mine.colorLocked ||
                            room.seats.some((s) => !s.me && s.color === i)
                          }
                          onClick={() => choose(i, false)}
                        />
                      ))}
                      <button
                        className="ct-color-lock"
                        disabled={busy}
                        onClick={() => choose(mine.color, !mine.colorLocked)}
                      >
                        {mine.colorLocked ? 'Unlock color' : 'Lock color'}
                      </button>
                    </div>
                  );
                })()}
              {!room.joined && (
                <form
                  className="ct-inline-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      const result = await api<{ room: RoomView }>('', {
                        command: 'join',
                        code,
                        name: guestName,
                      });
                      setRoom(result.room);
                    });
                  }}
                >
                  {!user?.registered && (
                    <label>
                      <span className="ct-sr-only">Your name at the table</span>
                      <input
                        placeholder="Your name"
                        minLength={2}
                        maxLength={24}
                        required
                        value={guestName}
                        onChange={(e) => {
                          setGuestName(e.target.value);
                        }}
                      />
                    </label>
                  )}
                  <button
                    className="ct-primary"
                    disabled={busy || room.seats.length >= room.capacity}
                  >
                    Take a seat
                  </button>
                </form>
              )}
              {room.joined && (
                <div className="ct-action-row">
                  {room.isHost ? (
                    <button
                      className="ct-primary"
                      disabled={busy || room.seats.length < (room.capacity >= 5 ? 5 : 3)}
                      onClick={() => void command('start')}
                    >
                      Start game
                    </button>
                  ) : (
                    <p>Waiting for the host to start.</p>
                  )}
                  {!(room.testing && room.isHost) && (
                    <button disabled={busy} onClick={() => void command('leave')}>
                      Leave table
                    </button>
                  )}
                </div>
              )}
              <p className="ct-muted">
                {room.capacity >= 5
                  ? '5–6 player island with paired turns. After the primary player, the player three seats ahead can build and trade with the bank.'
                  : '3–4 player classic island.'}{' '}
                Roll for first player, then play clockwise. Everyone places two settlements and two
                roads.
              </p>
            </section>
          )}
          {room?.game && (
            <>
              <GameTable
                key={room.code}
                room={room}
                history={history}
                busy={busy || offline}
                act={(action) => command('action', action)}
                command={command}
              />
              {room.status === 'ended' && (
                <section className="ct-panel">
                  <p>This table is closed. Player stats are unchanged.</p>
                  <button onClick={() => openRoom('')}>Back to tables</button>
                </section>
              )}
              {room.status === 'finished' && (
                <section className="ct-panel ct-finished">
                  <h2>The game is in the books.</h2>
                  <p>
                    {room.hosting === 'local' ? (
                      'Saved on this host. This game does not count toward stats.'
                    ) : (
                      <>
                        Results are saved.{' '}
                        {user?.registered
                          ? 'Your profile has been updated.'
                          : 'Your result counts anonymously unless you choose to create a profile.'}
                      </>
                    )}
                  </p>
                  <div className="ct-action-row">
                    {room.hosting !== 'local' && !user?.registered && (
                      <Link
                        className="ct-profile-entry"
                        href={`${profileHref}${profileHref.includes('?') ? '&' : '?'}mode=register`}
                      >
                        Create profile &amp; keep my stats
                      </Link>
                    )}
                    <button onClick={() => openRoom('')}>Back to tables</button>
                  </div>
                </section>
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}
