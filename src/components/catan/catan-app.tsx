'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import GameTable from './game-table';
import { PLAYER_COLORS } from './board';
import type { Action } from '@/lib/catan/types';
import type { RoomSummary, RoomView } from '@/lib/catan/view';
import type { CatanStore, Odds } from '@/lib/catan/store';

interface Bootstrap {
  user: { name: string | null; registered: boolean; canRegister: boolean };
  rooms: RoomSummary[];
}
type Leaderboard = Awaited<ReturnType<CatanStore['leaderboard']>>;
type Profile = Awaited<ReturnType<CatanStore['profile']>>;
async function api<T>(query = '', body?: unknown): Promise<T> {
  const res = await fetch(`/api/catan${query}`, {
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
export default function CatanApp({ initialCode = '' }: { initialCode?: string }) {
  const [bootstrap, setBootstrap] = useState<Bootstrap>();
  const [room, setRoom] = useState<RoomView>();
  const [code, setCode] = useState(initialCode);
  const [history, setHistory] = useState<Odds[]>([]);
  const [tab, setTab] = useState<'play' | 'leaderboard' | 'profile'>('play');
  const [leaderboard, setLeaderboard] = useState<Leaderboard>();
  const [profile, setProfile] = useState<Profile>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [offline, setOffline] = useState(false);
  const [auth, setAuth] = useState<'login' | 'register'>();
  const [guestName, setGuestName] = useState(''),
    [roomName, setRoomName] = useState('Friday night'),
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
      if (tab === 'leaderboard') setLeaderboard(await api<Leaderboard>('?leaderboard'));
      if (tab === 'profile' && data.user.registered) setProfile(await api<Profile>('?profile'));
    } catch (err) {
      setOffline(true);
      setError((err as Error).message);
    }
  }, [code, tab]);
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
  function openRoom(next: string) {
    setCode(next);
    currentCode.current = next;
    setRoom(undefined);
    setHistory([]);
    setTab('play');
    setError('');
    setCopied(false);
    window.history.replaceState(null, '', next ? `/catan?room=${next}` : '/catan');
  }
  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await fn();
      await refresh();
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
    <main className="ct-app">
      <header className="ct-header">
        <Link href="/" className="ct-back">
          ↖ arnavkulkarni
        </Link>
        <Link href="/catan" className="ct-wordmark">
          CATAN<span>AT THE TABLE</span>
        </Link>
        <div>
          {user?.registered ? (
            <button
              onClick={() => {
                setTab('profile');
                setAuth(undefined);
              }}
            >
              {user.name}
            </button>
          ) : (
            <button onClick={() => setAuth('login')}>Sign in</button>
          )}
        </div>
      </header>
      <nav className="ct-nav" aria-label="Catan navigation">
        <button aria-current={tab === 'play' ? 'page' : undefined} onClick={() => setTab('play')}>
          Play
        </button>
        <button
          aria-current={tab === 'leaderboard' ? 'page' : undefined}
          onClick={() => setTab('leaderboard')}
        >
          Leaderboard
        </button>
        <button
          aria-current={tab === 'profile' ? 'page' : undefined}
          onClick={() => setTab('profile')}
        >
          My stats
        </button>
        <span className={`ct-connection ${offline ? 'ct-disconnected' : ''}`}>
          {offline ? 'Reconnecting…' : bootstrap ? 'Connected to the table' : 'Connecting…'}
        </span>
      </nav>
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
          Connection interrupted. Your game is saved on the server. Reconnecting automatically.
        </p>
      )}
      {auth && (
        <section className="ct-panel ct-auth">
          <div className="ct-section-heading">
            <h2>{auth === 'register' ? 'Keep your place in the story.' : 'Welcome back.'}</h2>
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
          <section className="ct-hero">
            <div>
              <span className="ct-eyebrow">3–6 friends. One island.</span>
              <h1>
                Good company.
                <br />
                Great rivalries.
              </h1>
              <p>
                Gather around an island of possibility. Build a little, trade a lot, and make your
                way to ten points.
              </p>
              <div className="ct-hero-tags">
                <span>No account needed</span>
                <span>Live win estimates</span>
                <span>Made for game night</span>
              </div>
            </div>
            <div className="ct-mini-island" aria-hidden="true">
              {['wood', 'wheat', 'ore', 'brick', 'sheep', 'wood', 'wheat'].map((r, i) => (
                <span className={`ct-mini-hex ct-${r}`} key={i}>
                  <b>{[6, 9, 5, 8, 4, 10, 3][i]}</b>
                </span>
              ))}
            </div>
          </section>
          <div className="ct-lobby-grid">
            <section className="ct-panel">
              <span className="ct-eyebrow">Make room for everyone</span>
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
                    });
                    openRoom(result.room.code);
                    setRoom(result.room);
                  });
                }}
              >
                {!user?.registered && (
                  <label>
                    Your name at the table
                    <input
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      minLength={2}
                      maxLength={24}
                      placeholder="e.g. Arnav"
                      required
                    />
                  </label>
                )}
                <label>
                  Table name
                  <input
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    minLength={2}
                    maxLength={24}
                    required
                  />
                </label>
                <label>
                  Island size
                  <select value={capacity} onChange={(e) => setCapacity(Number(e.target.value))}>
                    <option value={4}>Classic island · 3–4 players</option>
                    <option value={6}>Extended island · 5–6 players</option>
                  </select>
                </label>
                <button className="ct-primary" disabled={busy || !bootstrap}>
                  Create a table ↗
                </button>
              </form>
            </section>
            <section className="ct-panel">
              <span className="ct-eyebrow">An invitation to the island</span>
              <h2>Join your friends</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  openRoom(joinCode.trim().toUpperCase());
                }}
              >
                <label>
                  Six-character room code
                  <input
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    minLength={6}
                    maxLength={6}
                    placeholder="ABC234"
                    required
                    autoCapitalize="characters"
                  />
                </label>
                <button disabled={busy || !bootstrap}>Find table →</button>
              </form>
              <p className="ct-muted">
                On the same Wi-Fi? Open the host’s network address on each device, then enter the
                room code or share the invite link.
              </p>
              <p className="ct-muted">
                Play your first game as a guest. Afterward, create a profile to keep your stats and
                pause future games.
              </p>
            </section>
          </div>
          {(bootstrap?.rooms.length ?? 0) > 0 && (
            <section className="ct-tables">
              <h2>Your next game night</h2>
              <div className="ct-room-list">
                {bootstrap!.rooms.map((r) => (
                  <button key={r.code} onClick={() => openRoom(r.code)}>
                    <span>
                      <strong>{r.name}</strong>
                      <small>
                        {r.mine ? 'Your table' : 'Open table'} · {r.players}/{r.capacity} players ·{' '}
                        {r.status}
                      </small>
                    </span>
                    <span>{r.code} ↗</span>
                  </button>
                ))}
              </div>
            </section>
          )}
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
                if (!navigator.clipboard) {
                  setError(`Invite link: ${window.location.href}`);
                  return;
                }
                void navigator.clipboard
                  ?.writeText(window.location.href)
                  .then(() => setCopied(true))
                  .catch(() => setError('Copy the address from your browser to invite friends.'));
              }}
            >
              {copied ? 'Link copied' : 'Copy invite link'}
            </button>
          </div>
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
                      disabled={busy || room.seats.length < (room.capacity === 6 ? 5 : 3)}
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
                {room.capacity === 6
                  ? '5–6 player island with paired turns. After the primary player, the player three seats ahead can build and trade with the bank.'
                  : '3–4 player classic island.'}{' '}
                Starting order is randomized. Everyone places two settlements and two roads.
              </p>
            </section>
          )}
          {room?.game && (
            <>
              <GameTable
                key={`${room.code}:${room.revision}`}
                room={room}
                history={history}
                busy={busy || offline}
                act={(action) => command('action', action)}
                command={command}
              />
              {room.status === 'finished' && (
                <section className="ct-panel ct-finished">
                  <h2>The game is in the books.</h2>
                  <p>
                    Results are saved.{' '}
                    {user?.registered
                      ? 'Your profile and the leaderboard have been updated.'
                      : 'Your result counts anonymously unless you choose to create a profile.'}
                  </p>
                  <div className="ct-action-row">
                    {!user?.registered && (
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
                    <button onClick={() => setTab('leaderboard')}>View leaderboard</button>
                  </div>
                </section>
              )}
            </>
          )}
        </>
      )}
      {tab === 'leaderboard' && (
        <section className="ct-stats-page">
          <span className="ct-eyebrow">The island remembers</span>
          <h1>Bragging rights.</h1>
          <p>
            Public profile stats, ranked by win rate, then games played and average points. Small
            samples can be misleading—check the game count.
          </p>
          {leaderboard ? (
            <>
              <div className="ct-stat-grid">
                <Stat label="Games completed" value={leaderboard.totals.games} />
                <Stat label="Anonymous appearances" value={leaderboard.anonymous.appearances} />
                <Stat label="Anonymous wins" value={leaderboard.anonymous.wins} />
              </div>
              <div className="ct-panel ct-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Player</th>
                      <th>Games</th>
                      <th>Wins</th>
                      <th>Win rate</th>
                      <th>Avg. points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.rows.map((r, i) => (
                      <tr key={r.name}>
                        <td>{i + 1}</td>
                        <th>{r.name}</th>
                        <td>{r.games}</td>
                        <td>{r.wins}</td>
                        <td>{r.winRate}%</td>
                        <td>{r.averagePoints}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!leaderboard.rows.length && (
                  <p className="ct-empty">
                    The first names on this board could be yours. Complete a game and create a
                    profile.
                  </p>
                )}
              </div>
              <p className="ct-muted">
                Guests are counted in results and opponents’ statistics. Their table names never
                appear on the public leaderboard.
              </p>
            </>
          ) : (
            <p>Loading leaderboard…</p>
          )}
        </section>
      )}
      {tab === 'profile' && (
        <section className="ct-stats-page">
          <span className="ct-eyebrow">Your time on the island</span>
          <h1>{user?.registered ? `${user.name}’s playbook.` : 'Every game tells a story.'}</h1>
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
      <footer className="ct-footer">
        <span>A little strategy. A lot of company.</span>
        <details>
          <summary>Playing together & rules</summary>
          <p>
            All devices connect to the same server address. On a local Wi-Fi host, use its network
            IP rather than localhost. Keep the host running while you play; completed and paused
            games persist on disk.
          </p>
          <p>
            Resources and development cards are private. Counts, played knights, structures, and win
            estimates are public at your table. A profile lets you recover your seat on another
            device. Guests should keep this browser’s cookies to return to their seats.
          </p>
          <p>
            Use the{' '}
            <a
              href="https://www.catan.com/understand-catan/game-rules"
              target="_blank"
              rel="noreferrer"
            >
              official base game rules
            </a>
            . The 5–6 player island uses paired turns, with no domestic trading for the paired
            player. This is an independent implementation with original artwork.
          </p>
        </details>
      </footer>
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
