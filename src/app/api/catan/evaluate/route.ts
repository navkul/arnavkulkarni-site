import { handleCallback } from '@vercel/queue';
import { processEvaluation } from '@/lib/catan/server';

export const runtime = 'nodejs';
export const maxDuration = 300;
// Vercel isolates queue-triggered functions from public HTTP requests.
// Messages contain only durable job references; game state is read from Postgres.
export const POST = handleCallback<{ room: string; revision: number }>(async (message) => {
  if (!/^[A-Z2-9]{6}$/.test(message.room) || !Number.isSafeInteger(message.revision))
    throw new Error('Invalid evaluation job');
  await processEvaluation(message.room, message.revision);
});
