import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CatanStore } from '../../src/lib/catan/store.ts';
import { finishOpening, agreePause } from './helpers.ts';
import { emptyCards } from '../../src/lib/catan/types.ts';

for (const capacity of [3, 5])
  test(`local ${capacity}-seat table persists, enforces capacity, and never records ranked results`, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'catan-local-'));
    const file = join(dir, 'games.sqlite');
    let store = new CatanStore(file, 'local');
    try {
      const sessions = await Promise.all(Array.from({ length: capacity }, () => store.session()));
      const host = sessions[0].identity;
      let room = await store.createRoom(host, 'Offline night', capacity, 'Host', false);
      for (let i = 1; i < capacity; i++)
        room = await store.join(sessions[i].identity, room.code, `Player ${i}`);
      await assert.rejects(
        async () => store.join((await store.session()).identity, room.code, 'Extra'),
        /full/,
      );
      room = (await store.change(host, room.code, room.revision, 'start'))!;
      assert.equal(room.game!.board.hexes.length, capacity === 5 ? 30 : 19);
      assert.equal(room.hosting, 'local');
      assert.equal(room.winProbability, false);
      assert.equal((await store.pendingJobs(room.code)).length, 0);
      room = await finishOpening(store, room);
      room = (await store.change(host, room.code, room.revision, 'pause'))!;
      assert.equal(room.status, 'playing');
      room = await agreePause(store, room);
      await store.close();
      store = new CatanStore(file, 'local');
      assert.equal((await store.room(room.code)).status, 'paused');
      assert.equal((await store.session(sessions[0].secret)).identity.guestId, host.guestId);
      room = (await store.change(host, room.code, room.revision, 'resume'))!;
      const game = room.game!;
      const player = game.players.findIndex(
        (p) => p.id === room.seats.find((s) => s.guestId === host.guestId)!.id,
      );
      game.phase = 'trade';
      game.active = player;
      game.turn = 20;
      [0, 6, 12, 18, 24].forEach(
        (vertex, i) =>
          (game.board.vertices[vertex].building = { player, kind: i < 3 ? 'city' : 'settlement' }),
      );
      game.players[player].development = [{ kind: 'victory', boughtTurn: 1 }];
      game.players[player].resources = { ...emptyCards(), wheat: 2, ore: 3 };
      await store.query('UPDATE rooms SET state=? WHERE code=?', JSON.stringify(room), room.code);
      const finished = (await store.change(host, room.code, room.revision, 'action', {
        type: 'city',
        vertex: 18,
      }))!;
      assert.equal(finished.status, 'finished');
      assert.equal((await store.leaderboard()).totals.games, 0);
      assert.equal((await store.query('SELECT * FROM results')).length, 0);
      assert.equal(await store.canRegister(host), false);
      await assert.rejects(
        store.register(host, 'Local profile', 'long password here'),
        /online games only/,
      );
    } finally {
      await store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

test('local mutex prevents interleaved requests from escaping a rollback', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'catan-mutex-'));
  const store = new CatanStore(join(dir, 'game.sqlite'), 'local');
  try {
    let release!: () => void;
    let entered!: () => void;
    const ready = new Promise<void>((resolve) => (entered = resolve));
    const barrier = new Promise<void>((resolve) => (release = resolve));
    const transaction = store.transaction(async () => {
      await store.query('INSERT INTO limits VALUES(?,?,?)', 'rollback', 0, 1);
      entered();
      await barrier;
      throw new Error('rollback test');
    });
    const rejection = assert.rejects(transaction, /rollback test/);
    await ready;
    const session = store.session();
    release();
    await rejection;
    const result = await session;
    assert.equal((await store.session(result.secret)).identity.guestId, result.identity.guestId);
    assert.equal((await store.query('SELECT * FROM limits')).length, 0);
  } finally {
    await store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Vercel cannot opt into local hosting or suppress ranked results through a local backend', async () => {
  const { getStore, localAvailable, offlineOnly } = await import('../../src/lib/catan/server.ts');
  const previous = { vercel: process.env.VERCEL, local: process.env.CATAN_OFFLINE_ONLY };
  try {
    process.env.VERCEL = '1';
    process.env.CATAN_OFFLINE_ONLY = '1';
    assert.equal(localAvailable(), false);
    assert.equal(offlineOnly(), false);
    assert.throws(() => getStore('local'), /local host on your computer/);
  } finally {
    if (previous.vercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous.vercel;
    if (previous.local === undefined) delete process.env.CATAN_OFFLINE_ONLY;
    else process.env.CATAN_OFFLINE_ONLY = previous.local;
  }
});
