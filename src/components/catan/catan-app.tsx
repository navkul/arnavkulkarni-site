'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import GameTable from './game-table';
import SettingHelp from './setting-help';
import { PLAYER_COLORS } from './board';
import type { Action } from '@/lib/catan/types';
import type { RoomSummary, RoomView } from '@/lib/catan/view';
import type { CatanStore, Odds } from '@/lib/catan/store';

interface Bootstrap {
  hosting: 'server' | 'local';
  localAddresses: string[];
  user: { name: string | null; registered: boolean; canRegister: boolean };
  rooms: RoomSummary[];
}
type Leaderboard = Awaited<ReturnType<CatanStore['leaderboard']>>;
type Profile = Awaited<ReturnType<CatanStore['profile']>>;
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
  if (!res.ok) throw new Error(data.error ?? 'Request failed. Please try again.');
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
  const [selfHost, setSelfHost] = useState(initialHosting === 'local');
  const hosting = selfHost && localAvailable ? 'local' : 'server';
  const api = useCallback(
    <T,>(query = '', body?: unknown) => request<T>(hosting, query, body),
    [hosting],
  );
  const [winProbability, setWinProbability] = useState(true);
  const [findLocal, setFindLocal] = useState(false);
  const [bootstrap, setBootstrap] = useState<Bootstrap>();
  const [room, setRoom] = useState<RoomView>();
  const [code, setCode] = useState(initialCode);
  const [history, setHistory] = useState<Odds[]>([]);
  const [tab, setTab] = useState<'play' | 'profile'>('play');
  const [leaderboard, setLeaderboard] = useState<Leaderboard>();
  const [profile, setProfile] = useState<Profile>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [offline, setOffline] = useState(false);
  const [auth, setAuth] = useState<'login' | 'register'>();
  const [guestName, setGuestName] = useState(''),
    [roomName, setRoomName] = useState(''),
    [capacity, setCapacity] = useState(4),
    [joinCode, setJoinCode] = useState('');
  const [profileName, setProfileName] = useState(''),
    [password, setPassword] = useState('');
  const [copied, setCopied] = useState(false);
  const currentCode = useRef(code);
  currentCode.current = code;
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const ticket = ++sequence.current;
    try {
      const data = await api<Bootstrap>();
      if (ticket !== sequence.current) return;
      setBootstrap(data);
      setOffline(false);
      if (code) {
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
      if (tab === 'play' && !code && hosting === 'server')
        setLeaderboard(await api<Leaderboard>('?leaderboard'));
      if (tab === 'profile' && data.user.registered) setProfile(await api<Profile>('?profile'));
    } catch (err) {
      setOffline(true);
      setError((err as Error).message);
    }
  }, [code, tab, api, hosting]);
  useEffect(() => {
    const seq = sequence;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await refresh();
      if (!disposed) timer = setTimeout(poll, 1800);
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
    currentCode.current = next;
    setRoom(undefined);
    setHistory([]);
    setTab('play');
    setError('');
    setCopied(false);
    const params = new URLSearchParams();
    if (next) params.set('room', next);
    if (nextHosting === 'local') params.set('hosting', 'local');
    window.history.replaceState(null, '', `/catan${params.size ? '?' + params : ''}`);
  }
  async function run(fn: () => Promise<void>, refreshAfter = true) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await fn();
      if (refreshAfter) await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function command(command: string, action?: Action) {
    if (!room) return;
    await run(async () => {
      const result = await api<{ room: RoomView | null }>('', {
        command,
        code: room.code,
        revision: room.revision,
        action,
      });
      if (command === 'leave' || !result.room) openRoom('');
      else setRoom(result.room);
    });
  }
  const user = bootstrap?.user;
  return (
    <main className={`ct-app${code ? ' ct-in-game' : ''}`}>
      <header className="ct-header">
        <Link href="/" className="ct-back">
          ← Home
        </Link>
        <div className="ct-account-actions">
          {hosting === 'local' ? (
            <span className="ct-muted">Local · unranked</span>
          ) : user?.registered ? (
            <button
              className="ct-text-button"
              onClick={() => {
                setTab('profile');
                setAuth(undefined);
              }}
            >
              {user.name}
            </button>
          ) : (
            <button className="ct-text-button" onClick={() => setAuth('login')}>
              Sign in
            </button>
          )}
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
      {auth && (
        <section className="ct-panel ct-auth">
          <div className="ct-section-heading">
            <h2>{auth === 'register' ? 'Create profile' : 'Sign in'}</h2>
            <button onClick={() => setAuth(undefined)} aria-label="Close account form">
              ×
            </button>
          </div>
          <p>
            {auth === 'register'
              ? 'Save your completed game to a profile. Your name and aggregate stats will appear on the public leaderboard.'
              : 'Sign in to restore your games and see your statistics.'}
          </p>
          <form
            className="ct-inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await api('', { command: auth, name: profileName, password });
                setPassword('');
                setAuth(undefined);
                setRoom(undefined);
              });
            }}
          >
            <label>
              Profile name
              <input
                autoComplete="username"
                value={profileName}
                minLength={2}
                maxLength={24}
                required
                onChange={(e) => setProfileName(e.target.value)}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete={auth === 'register' ? 'new-password' : 'current-password'}
                minLength={auth === 'register' ? 10 : undefined}
                maxLength={128}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button className="ct-primary" disabled={busy}>
              {auth === 'register' ? 'Create profile & save stats' : 'Sign in'}
            </button>
          </form>
        </section>
      )}
      {tab === 'play' && !code && (
        <>
          <h1 className="ct-page-title">Catan</h1>
          <div className="ct-lobby-grid">
            <section className="ct-lobby-section">
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
                  Table name
                  <input
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    minLength={2}
                    maxLength={24}
                    placeholder="Friday night"
                    required
                  />
                </label>
                <label>
                  Your name
                  <input
                    value={user?.registered ? (user.name ?? '') : guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    readOnly={user?.registered}
                    minLength={2}
                    maxLength={24}
                    autoComplete="nickname"
                    placeholder="Name"
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
                            e.target.checked ? '/catan?hosting=local' : '/catan',
                          );
                        setFindLocal(false);
                        setError('');
                        setBootstrap(undefined);
                        setAuth(undefined);
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
                        setSelfHost(true);
                        setBootstrap(undefined);
                        setOffline(false);
                        setAuth(undefined);
                        openRoom(result.room.code, 'local');
                        setRoom(result.room);
                      }, false)
                    }
                  >
                    Start test game
                  </button>
                  <p className="ct-muted">
                    Development only · control all {capacity} seats · no stats
                  </p>
                </div>
              )}
            </section>
            <section className="ct-lobby-section">
              <h2>Join a table</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  openRoom(joinCode.trim().toUpperCase());
                }}
              >
                <label>
                  Table code
                  <input
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    minLength={6}
                    maxLength={6}
                    placeholder="ABC234"
                    autoCapitalize="characters"
                    required
                  />
                </label>
                <button disabled={busy || !bootstrap}>Join table</button>
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
        </>
      )}
      {tab === 'play' && code && (
        <>
          <div className="ct-room-heading">
            <button onClick={() => openRoom('')}>← All tables</button>
            <div>
              <h1>{room?.name ?? 'Finding your table…'}</h1>
              <span className="ct-room-code">{code}</span>
            </div>
            <button
              onClick={() => {
                const invite =
                  room?.hosting === 'local' && bootstrap?.localAddresses[0]
                    ? `${bootstrap.localAddresses[0]}&room=${code}`
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
              {copied ? 'Link copied' : 'Copy invite link'}
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
          {room && (!room.game || room.status === 'lobby') && (
            <section className="ct-panel ct-waiting">
              <span className="ct-eyebrow">The island is waiting</span>
              <h2>
                {room.seats.length} of {room.capacity} seats filled
              </h2>
              <div className="ct-seat-grid">
                {Array.from({ length: room.capacity }, (_, i) => (
                  <div className={room.seats[i] ? 'ct-seat-filled' : 'ct-seat-empty'} key={i}>
                    <span style={{ background: room.seats[i] ? PLAYER_COLORS[i] : '#dedfd3' }}>
                      {room.seats[i]?.name[0] ?? '+'}
                    </span>
                    <strong>{room.seats[i]?.name ?? 'Open seat'}</strong>
                    <small>
                      {room.seats[i]
                        ? `${room.seats[i].host ? 'Host · ' : ''}${room.seats[i].registered ? 'Profile' : 'Guest'}`
                        : 'Invite a friend'}
                    </small>
                  </div>
                ))}
              </div>
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
                      Your name at the table
                      <input
                        minLength={2}
                        maxLength={24}
                        required
                        value={guestName}
                        onChange={(e) => setGuestName(e.target.value)}
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
                  <button disabled={busy} onClick={() => void command('leave')}>
                    Leave table
                  </button>
                </div>
              )}
              <p className="ct-muted">
                {room.capacity >= 5
                  ? '5–6 player island with paired turns. After the primary player, the player three seats ahead can build and trade with the bank.'
                  : '3–4 player classic island.'}{' '}
                Starting order is randomized. Everyone places two settlements and two roads.
              </p>
            </section>
          )}
          {room?.game && (
            <>
              {testingAvailable && room.testing && (
                <div className="ct-test-toolbar">
                  <span>
                    <strong>Test game</strong> · You control every seat. Turns switch automatically.
                  </span>
                  <label>
                    View / control player
                    <select
                      value={room.me}
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
                        })
                      }
                    >
                      {room.game.players.map((p, i) => (
                        <option key={i} value={i}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
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
                          ? 'Your profile and the leaderboard have been updated.'
                          : 'Your result counts anonymously unless you choose to create a profile.'}
                      </>
                    )}
                  </p>
                  <div className="ct-action-row">
                    {room.hosting !== 'local' && !user?.registered && (
                      <button
                        className="ct-primary"
                        onClick={() => {
                          setAuth('register');
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                      >
                        Create profile & keep my stats
                      </button>
                    )}
                    <button onClick={() => openRoom('')}>Back to tables</button>
                    <button onClick={() => openRoom('')}>View leaderboard</button>
                  </div>
                </section>
              )}
            </>
          )}
        </>
      )}
      {tab === 'play' && !code && (
        <section className="ct-leaderboard" id="leaderboard" aria-labelledby="ct-leaderboard-title">
          <h2 id="ct-leaderboard-title">Leaderboard</h2>
          {hosting === 'local' ? (
            <p className="ct-muted">
              Local games don’t count toward stats. The leaderboard is available online.
            </p>
          ) : leaderboard ? (
            <div className="ct-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Player</th>
                    <th scope="col">Games</th>
                    <th scope="col">Wins</th>
                    <th scope="col">Win rate</th>
                    <th scope="col">Avg. points</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.rows.map((r) => (
                    <tr key={r.name}>
                      <th scope="row">{r.name}</th>
                      <td>{r.games}</td>
                      <td>{r.wins}</td>
                      <td>{r.winRate}%</td>
                      <td>{r.averagePoints}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!leaderboard.rows.length && <p className="ct-empty">No completed games yet.</p>}
            </div>
          ) : (
            <p className="ct-muted">Loading leaderboard…</p>
          )}
        </section>
      )}
      {tab === 'profile' && (
        <section className="ct-stats-page">
          <button className="ct-text-button" onClick={() => openRoom('')}>
            ← Back to tables
          </button>
          <h1>{user?.registered ? `${user.name}’s stats` : 'Your stats'}</h1>
          {!user?.registered ? (
            <div className="ct-panel">
              <p>
                Sign in to see your wins, building habits, resource production, and game history.
              </p>
              <div className="ct-action-row">
                <button className="ct-primary" onClick={() => setAuth('login')}>
                  Sign in
                </button>
                {user?.canRegister && (
                  <button onClick={() => setAuth('register')}>
                    Create profile from my first game
                  </button>
                )}
              </div>
              <p className="ct-muted">
                New here? Play a game as a guest first. Then you can save that result to a profile.
              </p>
            </div>
          ) : profile ? (
            <>
              <div className="ct-stat-grid">
                <Stat label="Games played" value={profile.games} />
                <Stat label="Wins" value={profile.wins} />
                <Stat label="Win rate" value={`${profile.winRate.toFixed(1)}%`} />
                <Stat label="Average points" value={profile.averagePoints.toFixed(1)} />
                <Stat label="Best score" value={profile.bestPoints} />
                <Stat label="Avg. turns per game" value={profile.averageTurns.toFixed(1)} />
              </div>
              <div className="ct-panel">
                <h2>Your style of play</h2>
                <div className="ct-stat-grid">
                  <Stat label="Resources produced" value={profile.resourcesProduced} />
                  <Stat label="Trades completed" value={profile.trades} />
                  <Stat label="Cards stolen" value={profile.cardsStolen} />
                  <Stat label="Cards lost to robber" value={profile.cardsLostToRobber} />
                  <Stat label="Cards discarded" value={profile.cardsDiscarded} />
                  <Stat label="Roads built" value={profile.roadsBuilt} />
                  <Stat label="Settlements built" value={profile.settlementsBuilt} />
                  <Stat label="Cities built" value={profile.citiesBuilt} />
                  <Stat label="Development bought" value={profile.developmentBought} />
                </div>
                <p className="ct-muted">
                  Totals across completed games; starting settlements and roads are included. A
                  paired player’s action phase counts as a turn.
                </p>
              </div>
              <div className="ct-panel">
                <h2>By table size</h2>
                <div className="ct-stat-grid">
                  {profile.bySize.map((s) => (
                    <Stat
                      key={s.players}
                      label={`${s.players} players · ${s.games} games`}
                      value={`${s.wins} wins`}
                    />
                  ))}
                </div>
              </div>
              <section className="ct-panel">
                <h2>Game history</h2>
                {profile.history.length ? (
                  profile.history.map((h) => (
                    <details key={h.room}>
                      <summary>
                        {h.won ? 'Victory' : 'Finished'} · {h.points} points · {h.players} players ·{' '}
                        {new Date(h.finished).toLocaleDateString()}
                      </summary>
                      <p>
                        {h.turns} turns. Opponents:{' '}
                        {h.opponents
                          .map((o) => `${o.name} (${o.points} pts${o.won ? ', winner' : ''})`)
                          .join(', ')}
                        .
                      </p>
                      <button onClick={() => openRoom(h.room)}>Revisit island</button>
                    </details>
                  ))
                ) : (
                  <p>No completed games yet.</p>
                )}
              </section>
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await api('', { command: 'logout' });
                    setProfile(undefined);
                    openRoom('');
                  })
                }
              >
                Sign out
              </button>
            </>
          ) : (
            <p>Loading your stats…</p>
          )}
        </section>
      )}
    </main>
  );
}
function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="ct-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
