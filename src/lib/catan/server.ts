import { send } from '@vercel/queue';
import { resolve } from 'node:path';
import { CatanStore, ServiceError, type Room } from './store.ts';
import { evaluate } from './simulation.ts';

const globals = globalThis as typeof globalThis & {
  catanStore?: CatanStore;
  catanLocalStore?: CatanStore;
};
export function localAvailable() {
  return (
    !process.env.VERCEL &&
    (process.env.NODE_ENV === 'development' ||
      process.env.CATAN_ALLOW_LOCAL_HOST === '1' ||
      process.env.CATAN_OFFLINE_ONLY === '1')
  );
}
export function offlineOnly() {
  return localAvailable() && process.env.CATAN_OFFLINE_ONLY === '1';
}
export function getStore(
  hosting: 'server' | 'local' = offlineOnly() ? 'local' : 'server',
): CatanStore {
  if (hosting === 'local') {
    if (!localAvailable())
      throw new ServiceError('Start the local host on your computer to play offline.', 400);
    globals.catanLocalStore ??= new CatanStore(
      resolve(
        /* turbopackIgnore: true */ process.env.CATAN_LOCAL_DATABASE_PATH ??
          '.data/catan-local.sqlite',
      ),
      'local',
    );
    return globals.catanLocalStore;
  }
  if (offlineOnly()) throw new ServiceError('This host runs local games only.', 400);
  if (!globals.catanStore) {
    const url = process.env.CATAN_DATABASE_URL;
    if (!url)
      throw new ServiceError(
        'Online games are not configured on this host. Choose Self-host for a local game.',
        503,
      );
    globals.catanStore = new CatanStore(url);
  }
  return globals.catanStore;
}
export async function processEvaluation(
  code: string,
  revision: number,
  hosting: 'server' | 'local' = 'server',
) {
  const store = getStore(hosting);
  const game = await store.job(code, revision);
  if (!game) return; // Already acknowledged, or no such durable job.
  const configured = Number(process.env.CATAN_SIMULATION_SAMPLES ?? 32);
  const samples = Number.isInteger(configured) ? Math.max(8, Math.min(256, configured)) : 32;
  const odds = await evaluate(game, revision, undefined, { samples });
  await store.saveOdds(code, odds);
}
/** Publish persisted outbox entries. Polling repairs failed publication and expired delivery. */
export async function queueEvaluation(room?: Room): Promise<void> {
  if (room?.winProbability === false || room?.status === 'ended' || room?.status === 'starting')
    return;
  const store = getStore(room?.hosting ?? 'server');
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
          await processEvaluation(job.room, job.revision, store.hosting);
        }
      } catch (error) {
        await store.retryJob(job.room, job.revision);
        console.error('Catan evaluation dispatch failed', error);
      }
    }),
  );
}
