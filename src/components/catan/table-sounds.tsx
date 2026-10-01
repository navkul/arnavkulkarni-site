'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { RoomView } from '@/lib/catan/view';
import './table-sounds.css';

/** One audio context per table, unlocked by a real gesture and closed on departure. */
export function TableSounds({ room }: { room: RoomView }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const audio = useRef<AudioContext | null>(null);
  const playing = useRef<AudioBufferSourceNode | null>(null);
  const buffers = useRef(new Map<string, Promise<AudioBuffer>>());
  const seen = useRef(new Set(room.soundEvents.map((event) => event.id)));
  const currentEvent = useRef('');
  const alive = useRef(false);
  const mutedRef = useRef(false);
  const [muted, setMuted] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [coolingDown, setCoolingDown] = useState(false);
  const cooldownTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const profileUrl = `/catan/profile?table=${room.code}${room.hosting === 'local' ? '&hosting=local' : ''}`;
  const unlock = useCallback(() => {
    if (mutedRef.current) return;
    try {
      audio.current ??= new AudioContext();
      void audio.current
        .resume()
        .then(() => {
          if (alive.current) setReady(audio.current?.state === 'running');
        })
        .catch(() => {
          if (alive.current) setReady(false);
        });
    } catch {
      if (alive.current) setReady(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    const awaken = (event: Event) => {
      if (event.isTrusted) unlock();
    };
    document.addEventListener('pointerdown', awaken, { passive: true });
    document.addEventListener('keydown', awaken);
    const cached = buffers.current;
    return () => {
      alive.current = false;
      clearTimeout(cooldownTimer.current);
      document.removeEventListener('pointerdown', awaken);
      document.removeEventListener('keydown', awaken);
      playing.current?.stop();
      playing.current = null;
      void audio.current?.close();
      audio.current = null;
      cached.clear();
    };
  }, [unlock]);

  useEffect(() => {
    const events = room.soundEvents.filter((event) => !seen.current.has(event.id));
    for (const event of events) seen.current.add(event.id);
    if (seen.current.size > 64) seen.current = new Set(room.soundEvents.map((event) => event.id));
    // Never replay history on reconnect or queue an old reaction behind a newer one.
    const event = events.at(-1);
    const context = audio.current;
    if (
      !event ||
      room.serverNow - event.at > 5000 ||
      mutedRef.current ||
      context?.state !== 'running'
    )
      return;
    currentEvent.current = event.id;
    let buffer = buffers.current.get(event.url);
    if (!buffer) {
      buffer = fetch(event.url, { credentials: 'same-origin' }).then(async (response) => {
        if (!response.ok) throw new Error('That recording is no longer available.');
        return context.decodeAudioData(await response.arrayBuffer());
      });
      if (buffers.current.size >= 30) buffers.current.clear();
      buffers.current.set(event.url, buffer);
    }
    void buffer
      .then((decoded) => {
        if (
          !alive.current ||
          mutedRef.current ||
          currentEvent.current !== event.id ||
          context.state !== 'running'
        )
          return;
        playing.current?.stop();
        const source = context.createBufferSource();
        const volume = context.createGain();
        volume.gain.value = 0.7;
        source.buffer = decoded;
        source.connect(volume);
        volume.connect(context.destination);
        source.onended = () => {
          source.disconnect();
          volume.disconnect();
          if (playing.current === source) playing.current = null;
        };
        playing.current = source;
        source.start(0, 0, Math.min(decoded.duration, 5));
      })
      .catch(() => {
        buffers.current.delete(event.url);
        if (alive.current) setError('A table sound could not play on this device.');
      });
  }, [room.soundEvents, room.serverNow]);

  async function sendSound(soundId: string) {
    if (sending || coolingDown) return;
    unlock();
    setSending(true);
    setError('');
    try {
      const response = await fetch(`/api/catan?hosting=${room.hosting}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'play-sound', code: room.code, soundId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not play this sound.');
      if (!alive.current) return;
      setCoolingDown(true);
      cooldownTimer.current = setTimeout(() => {
        if (alive.current) setCoolingDown(false);
      }, 6000);
      dialog.current?.close();
    } catch (cause) {
      if (alive.current) setError((cause as Error).message);
    } finally {
      if (alive.current) setSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="ct-player-sounds"
        aria-label="Your table sounds"
        title="Your table sounds"
        onClick={() => {
          unlock();
          dialog.current?.showModal();
        }}
      >
        <span aria-hidden="true">{muted ? '🔇' : '♪'}</span>
      </button>
      <dialog
        className="ct-game-dialog ct-sounds-dialog"
        ref={dialog}
        aria-label="Your table sounds"
      >
        <header>
          <h2>Your sounds</h2>
          <button type="button" aria-label="Close sounds" onClick={() => dialog.current?.close()}>
            ×
          </button>
        </header>
        {room.mySounds.length ? (
          <>
            <p className="ct-muted">Play a reaction for the table.</p>
            <div className="ct-sound-pad">
              {room.mySounds.map((sound) => (
                <button
                  key={sound.id}
                  type="button"
                  disabled={sending || coolingDown}
                  onClick={() => void sendSound(sound.id)}
                  aria-label={`Play ${sound.name} to the table`}
                >
                  <span aria-hidden="true">{sound.emoji}</span>
                  <strong>{sound.name}</strong>
                </button>
              ))}
            </div>
            {coolingDown && (
              <p className="ct-muted">Give the table a moment before the next sound.</p>
            )}
          </>
        ) : (
          <p>Record your own reactions in your profile, then choose up to three for the table.</p>
        )}
        <div className="ct-sound-preferences">
          <button
            type="button"
            role="switch"
            aria-checked={!muted}
            onClick={() => {
              const next = !muted;
              mutedRef.current = next;
              setMuted(next);
              if (next) {
                playing.current?.stop();
                playing.current = null;
              } else unlock();
            }}
          >
            {muted ? '🔇 Table sounds off' : '♪ Table sounds on'}
          </button>
          {!ready && !muted && (
            <button type="button" onClick={unlock}>
              Enable audio
            </button>
          )}
          <Link href={profileUrl}>Manage recordings →</Link>
        </div>
        {error && <p role="alert">{error}</p>}
      </dialog>
    </>
  );
}
