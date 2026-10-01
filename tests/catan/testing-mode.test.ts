import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CatanStore } from '../../src/lib/catan/store.ts';
import { roomView } from '../../src/lib/catan/view.ts';
import { testingAvailable } from '../../src/lib/catan/testing-mode.ts';
import { policy, seededRandom } from '../../src/lib/catan/simulation.ts';
import { conserve } from './helpers.ts';

for (const capacity of [3, 6])
  test(`dev sandbox fills ${capacity} seats, skips setup, follows turns and isolates test controls`, async () => {
    const previous = { ...process.env };
    Object.assign(process.env, { NODE_ENV: 'development' });
    delete process.env.VERCEL;
    const dir = mkdtempSync(join(tmpdir(), 'catan-testing-'));
    const store = new CatanStore(join(dir, 'test.sqlite'), 'local');
    try {
      const host = (await store.session()).identity;
      const stranger = (await store.session()).identity;
      let room = await store.createTestRoom(host, 'Solo preview', capacity, 'You');
      assert.equal(room.seats.length, capacity);
      assert.equal(room.status, 'playing');
      assert.equal(room.game!.phase, 'roll');
      assert.equal(room.game!.board.vertices.filter((v) => v.building).length, capacity * 2);
      assert.deepEqual(conserve(room.game!), Array(5).fill(capacity > 4 ? 24 : 19));
      assert.equal(roomView(room, host).legal!.roll, true);
      assert.equal(roomView(room, stranger).game, undefined);
      await assert.rejects(
        store.selectTestPlayer(stranger, room.code, room.revision, 1),
        /Only the test host/,
      );
      room = await store.selectTestPlayer(host, room.code, room.revision, 1);
      assert.equal(roomView(room, host).me, 1);
      assert.equal(roomView(room, host).isHost, true);
      assert.equal(roomView(room, host).canEnd, true);
      await assert.rejects(
        store.selectTestPlayer(host, room.code, room.revision, capacity),
        /Choose a test player/,
      );
      room = await store.selectTestPlayer(host, room.code, room.revision, 0);
      const random = seededRandom(42);
      const firstTurn = room.game!.turn;
      for (let i = 0; i < 100 && room.game!.turn === firstTurn; i++) {
        const next = policy(room.game!, random);
        assert.equal(roomView(room, host).me, next.player);
        room = (await store.change(host, room.code, room.revision, 'action', next.action))!;
      }
      assert.ok(room.game!.turn > firstTurn);
      assert.equal(roomView(room, host).me, room.game!.active);
      assert.equal((await store.query('SELECT * FROM results')).length, 0);
      assert.equal((await store.query('SELECT * FROM jobs')).length, 0);
      Object.assign(process.env, { NODE_ENV: 'production' });
      assert.equal(testingAvailable(), false);
      await assert.rejects(
        store.createTestRoom(host, 'Blocked', capacity, 'You'),
        /local development/,
      );
      await assert.rejects(
        store.selectTestPlayer(host, room.code, room.revision, 0),
        /local development/,
      );
      await assert.rejects(
        store.change(host, room.code, room.revision, 'action', { type: 'roll' }),
        /local development/,
      );
      Object.assign(process.env, { NODE_ENV: 'development', VERCEL: '1' });
      assert.equal(testingAvailable(), false);
      await assert.rejects(
        store.createTestRoom(host, 'Blocked', capacity, 'You'),
        /local development/,
      );
    } finally {
      await store.close();
      rmSync(dir, { recursive: true, force: true });
      for (const key of ['NODE_ENV', 'VERCEL']) {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
      }
    }
  });
