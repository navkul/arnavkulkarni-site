import { resolve } from 'node:path';
import { CatanStore, type Room } from './store.ts';
import { evaluate } from './simulation.ts';

const globals = globalThis as typeof globalThis & {
  catanStore?: CatanStore;
  catanEvaluation?: Promise<void>;
  catanQueued?: Set<string>;
};
export function getStore(): CatanStore {
  if (!globals.catanStore) {
    if (process.env.VERCEL && !process.env.CATAN_DATABASE_PATH)
      throw new Error(
        'Catan requires a persistent Node host. Set CATAN_DATABASE_PATH to durable SQLite storage.',
      );
    globals.catanStore = new CatanStore(
      resolve(/* turbopackIgnore: true */ process.env.CATAN_DATABASE_PATH ?? '.data/catan.sqlite'),
    );
  }
  return globals.catanStore;
}
/** Evaluate snapshots in move order so each delta compares consecutive evaluated moves. */
export function queueEvaluation(room: Room): Promise<void> {
  if (!room.game) return Promise.resolve();
  const key = `${room.code}:${room.revision}`;
  globals.catanQueued ??= new Set();
  if (globals.catanQueued.has(key) || (room.odds?.revision ?? -1) >= room.revision)
    return globals.catanEvaluation ?? Promise.resolve();
  globals.catanQueued.add(key);
  const snapshot = structuredClone(room);
  globals.catanEvaluation = (globals.catanEvaluation ?? Promise.resolve())
    .catch(() => {})
    .then(async () => {
      try {
        const store = getStore();
        const current = store.room(snapshot.code);
        const previous = store
          .oddsHistory(snapshot.code)
          .filter((o) => o.revision < snapshot.revision)
          .at(-1);
        if (current.odds && current.odds.revision >= snapshot.revision) return;
        const configured = Number(process.env.CATAN_SIMULATION_SAMPLES ?? 32);
        const samples = Number.isInteger(configured) ? Math.max(8, Math.min(256, configured)) : 32;
        const odds = await evaluate(snapshot.game!, snapshot.revision, previous, { samples });
        store.saveOdds(snapshot.code, odds);
      } catch (error) {
        console.error('Catan evaluation failed', error);
      } finally {
        globals.catanQueued!.delete(key);
      }
    });
  return globals.catanEvaluation;
}
