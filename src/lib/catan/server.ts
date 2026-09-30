import { send } from '@vercel/queue';
import { CatanStore, type Room } from './store.ts';
import { evaluate } from './simulation.ts';

const globals = globalThis as typeof globalThis & { catanStore?: CatanStore };
export function getStore(): CatanStore {
  if (!globals.catanStore) {
    const url = process.env.CATAN_DATABASE_URL;
    if (!url) throw new Error('Set CATAN_DATABASE_URL to a pooled PostgreSQL connection URL.');
    globals.catanStore = new CatanStore(url);
  }
  return globals.catanStore;
}
export async function processEvaluation(code: string, revision: number) {
  const store = getStore();
  const game = await store.job(code, revision);
  if (!game) return; // Already acknowledged, or no such durable job.
  const configured = Number(process.env.CATAN_SIMULATION_SAMPLES ?? 32);
  const samples = Number.isInteger(configured) ? Math.max(8, Math.min(256, configured)) : 32;
  const odds = await evaluate(game, revision, undefined, { samples });
  await store.saveOdds(code, odds);
}
/** Publish persisted outbox entries. Polling repairs failed publication and expired delivery. */
export async function queueEvaluation(room?: Room): Promise<void> {
  const store = getStore();
  const jobs = await store.pendingJobs(room?.code);
  await Promise.all(
    jobs.map(async (job) => {
      try {
        if (process.env.VERCEL) {
          await send('catan-evaluations', job, {
            idempotencyKey: `${job.room}:${job.revision}:${Math.floor(Date.now() / 600_000)}`,
            retentionSeconds: 86400,
          });
        } else {
          // Local development uses the same durable jobs without needing Vercel credentials.
          await processEvaluation(job.room, job.revision);
        }
      } catch (error) {
        await store.retryJob(job.room, job.revision);
        console.error('Catan evaluation dispatch failed', error);
      }
    }),
  );
}
