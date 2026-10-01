'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PlayerAvatar } from './avatar';
import type { CatanStore } from '@/lib/catan/store';
import './profile.css';

type Profile = Awaited<ReturnType<CatanStore['profile']>>;
async function fetchApi(hosting: 'server' | 'local', path = '', body?: Record<string, unknown>) {
  const response = await fetch(
    `/api/catan${path}${path.includes('?') ? '&' : '?'}hosting=${hosting}`,
    {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Please try again.');
  return data;
}
async function photoBlob(file: File) {
  if (!file.type.startsWith('image/'))
    throw new Error('Choose a photo from your camera or device.');
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 320;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser could not prepare your photo.');
  const side = Math.min(bitmap.width, bitmap.height);
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    320,
    320,
  );
  bitmap.close();
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not prepare this picture.'))),
      'image/jpeg',
      0.86,
    ),
  );
}
export default function CatanProfile({
  hosting = 'server',
  initialMode = 'login',
  tableCode,
}: {
  hosting?: 'server' | 'local';
  initialMode?: 'login' | 'register';
  tableCode?: string;
}) {
  const api = useCallback(
    (path = '', body?: Record<string, unknown>) => fetchApi(hosting, path, body),
    [hosting],
  );
  const [profile, setProfile] = useState<Profile | null>();
  const home =
    profile && tableCode
      ? `/catan?room=${tableCode}&hosting=${hosting}`
      : hosting === 'local'
        ? '/catan?hosting=local'
        : '/catan';
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [micPending, setMicPending] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [recorded, setRecorded] = useState<{ blob: Blob; url: string }>();
  const [soundName, setSoundName] = useState('');
  const [emoji, setEmoji] = useState('🎉');
  const recorder = useRef<MediaRecorder | null>(null);
  const requestingMic = useRef(false);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const load = useCallback(async () => {
    const bootstrap = await api();
    if (!bootstrap.user.registered) {
      setProfile(null);
      return;
    }
    const next: Profile = await api('?profile');
    setProfile(next);
    setDisplayName(next.name ?? '');
  }, [api]);
  useEffect(() => {
    mounted.current = true;
    void Promise.resolve()
      .then(load)
      .catch((e) => setError(e.message));
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
      if (recorder.current?.state === 'recording') recorder.current.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
    };
  }, [load]);
  useEffect(() => {
    if (!recorded) return;
    return () => URL.revokeObjectURL(recorded.url);
  }, [recorded]);
  useEffect(() => {
    if (!recording) return;
    const interval = setInterval(() => setSeconds((value) => Math.min(5, value + 0.1)), 100);
    return () => clearInterval(interval);
  }, [recording]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }
  async function upload(kind: 'avatar' | 'sound', blob: Blob) {
    const query = new URLSearchParams({ kind, name: soundName, emoji, hosting });
    const response = await fetch(`/api/catan/media?${query}`, {
      method: 'POST',
      headers: { 'Content-Type': blob.type },
      body: blob,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    await load();
  }
  function stopRecording() {
    if (timer.current) clearTimeout(timer.current);
    if (recorder.current?.state === 'recording') recorder.current.stop();
    stream.current?.getTracks().forEach((track) => track.stop());
    setRecording(false);
  }
  async function startRecording() {
    if (requestingMic.current || recorder.current?.state === 'recording') return;
    requestingMic.current = true;
    setMicPending(true);
    setError('');
    setRecorded(undefined);
    setSeconds(0);
    try {
      if (
        !window.isSecureContext ||
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === 'undefined'
      )
        throw new Error('Recording needs a supported browser on HTTPS or localhost.');
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      if (!mounted.current) {
        mic.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = mic;
      const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      if (!mime) {
        mic.getTracks().forEach((track) => track.stop());
        throw new Error(
          'Your browser cannot make a supported recording. Try Chrome, Safari or Firefox.',
        );
      }
      const next = new MediaRecorder(mic, { mimeType: mime, audioBitsPerSecond: 48000 });
      recorder.current = next;
      const chunks: Blob[] = [];
      next.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      next.onstop = () => {
        mic.getTracks().forEach((track) => track.stop());
        if (!mounted.current) return;
        setRecording(false);
        const blob = new Blob(chunks, { type: next.mimeType });
        if (blob.size > 262144) {
          setError('That recording is too large. Try a shorter one.');
          return;
        }
        if (blob.size) {
          setRecorded({ blob, url: URL.createObjectURL(blob) });
        }
      };
      next.onerror = () => {
        if (timer.current) clearTimeout(timer.current);
        mic.getTracks().forEach((track) => track.stop());
        setRecording(false);
        setError('Recording was interrupted. Please try again.');
      };
      next.start();
      setRecording(true);
      timer.current = setTimeout(stopRecording, 5000);
    } catch (e) {
      stream.current?.getTracks().forEach((track) => track.stop());
      setError(
        e instanceof DOMException && e.name === 'NotAllowedError'
          ? 'Allow microphone access to record your own sounds.'
          : e instanceof Error
            ? e.message
            : 'Could not start your microphone.',
      );
    } finally {
      requestingMic.current = false;
      setMicPending(false);
    }
  }
  return (
    <main className="ct-profile-page">
      <header className="ct-profile-nav">
        <Link href={home}>← Catan</Link>
      </header>
      {hosting === 'local' && (
        <p className="ct-profile-hint">Saved on this host. Local games don’t count toward stats.</p>
      )}
      {error && (
        <p role="alert" className="ct-profile-message ct-profile-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="ct-profile-message">
          {notice}
        </p>
      )}
      {profile === undefined ? (
        error ? (
          <button disabled={busy} onClick={() => void run(load)}>
            Try again
          </button>
        ) : (
          <p aria-live="polite">Loading your profile…</p>
        )
      ) : !profile ? (
        <section className="ct-profile-auth">
          <div className="ct-profile-tabs">
            <button type="button" aria-pressed={mode === 'login'} onClick={() => setMode('login')}>
              Sign in
            </button>
            <button
              type="button"
              aria-pressed={mode === 'register'}
              onClick={() => setMode('register')}
            >
              Create account
            </button>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                await api('', { command: mode, name: username, password });
                setPassword('');
                try {
                  if (mode === 'register' && displayName.trim())
                    await api('', { command: 'profile-update', displayName });
                } finally {
                  await load();
                }
              });
            }}
          >
            <label>
              Username
              <input
                required
                minLength={2}
                maxLength={24}
                name="catan-username"
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                data-1p-ignore="true"
                data-lpignore="true"
                data-form-type="other"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </label>
            {mode === 'register' && (
              <label>
                Display name
                <input
                  maxLength={24}
                  placeholder="How other players see you"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </label>
            )}
            <label>
              Password
              <input
                required
                type="password"
                minLength={mode === 'register' ? 10 : undefined}
                maxLength={128}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                data-1p-ignore="true"
                data-lpignore="true"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <p className="ct-profile-hint">
              A small hobby site. Use a unique password
              {mode === 'register' ? ' of at least 10 characters' : ''}.
            </p>
            <button className="ct-profile-primary" disabled={busy}>
              {busy ? 'One moment…' : mode === 'register' ? 'Create account' : 'Sign in'}
            </button>
          </form>
          <Link className="ct-profile-guest" href={home}>
            Or pull up a chair as a guest →
          </Link>
        </section>
      ) : (
        <div className="ct-profile-grid">
          <section className="ct-profile-card ct-profile-identity">
            <div className="ct-profile-avatar-row">
              <PlayerAvatar name={profile.name ?? 'You'} src={profile.avatarUrl} size={84} />
              <div>
                <h2>{profile.name}</h2>
                <p>@{profile.username}</p>
              </div>
            </div>
            <div className="ct-profile-photo-actions">
              <label className="ct-profile-button">
                Choose photo
                <input
                  type="file"
                  accept="image/*"
                  disabled={busy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file)
                      void run(async () => {
                        await upload('avatar', await photoBlob(file));
                        setNotice('Your new photo is ready at the table.');
                      });
                    event.target.value = '';
                  }}
                />
              </label>
              <label className="ct-profile-button">
                Use camera
                <input
                  type="file"
                  accept="image/*"
                  capture="user"
                  disabled={busy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file)
                      void run(async () => {
                        await upload('avatar', await photoBlob(file));
                        setNotice('Your new photo is ready at the table.');
                      });
                    event.target.value = '';
                  }}
                />
              </label>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  await api('', { command: 'profile-update', displayName });
                  await load();
                  setNotice('Display name saved.');
                });
              }}
            >
              <label>
                Display name
                <input
                  required
                  minLength={2}
                  maxLength={24}
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </label>
              <button disabled={busy || displayName === profile.name}>Save name</button>
            </form>
            <button
              className="ct-profile-signout"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  stopRecording();
                  await api('', { command: 'logout' });
                  await load();
                })
              }
            >
              Sign out
            </button>
          </section>
          <section className="ct-profile-card">
            <p className="ct-profile-eyebrow">Your completed games</p>
            <h2>A little friendly competition.</h2>
            <div className="ct-profile-stats">
              {[
                [profile.games, 'Games'],
                [profile.wins, 'Wins'],
                [`${Math.round(profile.winRate)}%`, 'Win rate'],
                [profile.averagePoints.toFixed(1), 'Avg. points'],
              ].map(([value, label]) => (
                <div key={label}>
                  <strong>{value}</strong>
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <p className="ct-profile-hint">
              Online completed games count here. Local and test tables are just for fun.
            </p>
            {profile.history.length > 0 ? (
              <ul className="ct-profile-history">
                {profile.history.slice(0, 5).map((game) => (
                  <li key={game.room}>
                    <span>
                      {game.won ? '🏆 Victory' : '⛵ Island explored'}
                      <small>
                        {new Date(game.finished).toLocaleDateString()} · {game.players} players
                      </small>
                    </span>
                    <strong>{game.points} pts</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ct-profile-empty">
                <Link href={home}>Start a table →</Link>
              </p>
            )}
          </section>
          <section className="ct-profile-card ct-profile-sounds">
            <div className="ct-profile-section-title">
              <div>
                <p className="ct-profile-eyebrow">Sound a little more like you</p>
                <h2>Your table sounds</h2>
              </div>
              <span>
                {profile.sounds.length}/10 saved ·{' '}
                {profile.sounds.filter((sound) => sound.active).length}/3 active
              </span>
            </div>
            <p className="ct-profile-hint">
              Record up to 5 seconds with your microphone. Your three active sounds appear in your
              own player box for everyone at your table to hear.
            </p>
            <div className="ct-profile-recorder">
              <button
                className={recording ? 'ct-profile-recording' : 'ct-profile-primary'}
                disabled={busy || micPending || (!recording && profile.sounds.length >= 10)}
                onClick={() => (recording ? stopRecording() : void startRecording())}
              >
                {recording
                  ? `■ Stop · ${seconds.toFixed(1)}s`
                  : micPending
                    ? 'Allow microphone…'
                    : '● Record a sound'}
              </button>
              {recording && <progress aria-label="Recording progress" max={5} value={seconds} />}
              <span>Made by you. No audio uploads.</span>
            </div>
            {recorded && (
              <form
                className="ct-profile-recorded"
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(async () => {
                    await upload('sound', recorded.blob);
                    setRecorded(undefined);
                    setSoundName('');
                    setNotice('Sound saved. Give it a spin at your table.');
                  });
                }}
              >
                <audio controls src={recorded.url} />
                <label>
                  Sound name
                  <input
                    required
                    minLength={2}
                    maxLength={24}
                    value={soundName}
                    onChange={(event) => setSoundName(event.target.value)}
                    placeholder="Victory sheep"
                  />
                </label>
                <label>
                  Icon
                  <select value={emoji} onChange={(event) => setEmoji(event.target.value)}>
                    {['🎉', '🐑', '⚓', '😈', '🎲', '👏', '😂', '💬'].map((icon) => (
                      <option key={icon}>{icon}</option>
                    ))}
                  </select>
                </label>
                <button disabled={busy}>Save sound</button>
                <button type="button" disabled={busy} onClick={() => setRecorded(undefined)}>
                  Discard
                </button>
              </form>
            )}
            <div className="ct-profile-sound-list">
              {profile.sounds.map((sound) => (
                <article key={sound.id}>
                  <span className="ct-profile-sound-emoji">{sound.emoji}</span>
                  <div>
                    <strong>{sound.name}</strong>
                    <audio
                      aria-label={`Preview ${sound.name}`}
                      controls
                      preload="none"
                      src={sound.url}
                    />
                  </div>
                  <label className="ct-profile-active">
                    <input
                      type="checkbox"
                      checked={sound.active}
                      disabled={
                        busy ||
                        (!sound.active && profile.sounds.filter((item) => item.active).length >= 3)
                      }
                      onChange={(event) =>
                        void run(async () => {
                          await api('', {
                            command: 'sound-update',
                            id: sound.id,
                            active: event.target.checked,
                          });
                          await load();
                        })
                      }
                    />
                    Active
                  </label>
                  <button
                    aria-label={`Delete ${sound.name}`}
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await api('', { command: 'sound-delete', id: sound.id });
                        await load();
                      })
                    }
                  >
                    ×
                  </button>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
