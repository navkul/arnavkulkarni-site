import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Only this test runner loads the HTTP mock. Normal builds and deployments never do.
const mode = process.env.E2E_STRAVA_MODE ?? 'available';
if (!['available', 'unavailable'].includes(mode)) throw new Error('Invalid Strava test mode');

const root = fileURLToPath(new URL('../', import.meta.url));
const next = fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url));
const mock = new URL('./fixtures/strava-mock.mjs', import.meta.url).href;
const env = {
  ...process.env,
  NODE_ENV: 'production',
  NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import=${mock}`.trim(),
  E2E_STRAVA_MODE: mode,
  STRAVA_ACCESS_TOKEN: `synthetic-test-token-${mode}`,
  STRAVA_CLIENT_ID: '',
  STRAVA_CLIENT_SECRET: '',
  STRAVA_REFRESH_TOKEN: '',
  NEXT_TELEMETRY_DISABLED: '1',
};

let child;
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopping = true;
    child?.kill(signal);
  });
}

function run(args) {
  return new Promise((resolve, reject) => {
    child = spawn(process.execPath, [next, ...args], { cwd: root, env, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0 || signal === 'SIGTERM' || signal === 'SIGINT') resolve();
      else reject(new Error(`next ${args[0]} exited with ${code ?? signal}`));
    });
  });
}

// Invalidate local live API data and results from the other scenario before prerendering.
await rm(new URL('../.next/cache/fetch-cache', import.meta.url), { recursive: true, force: true });
await run(['build']);
if (!stopping) await run(['start', '--hostname', '127.0.0.1', '--port', '3100']);
