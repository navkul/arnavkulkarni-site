import { spawn } from 'node:child_process';
import { CatanStore } from '../src/lib/catan/store.ts';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const url = process.env.CATAN_TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('/catan_test'))
  throw new Error('Use the isolated catan_test database.');
const store = new CatanStore(url);
await store.query(
  'TRUNCATE catan.profiles,catan.sessions,catan.rooms,catan.results,catan.odds_history,catan.limits,catan.jobs CASCADE',
);
await store.close();
const env = {
  ...process.env,
  CATAN_DATABASE_URL: url,
  CATAN_SIMULATION_SAMPLES: '8',
  NEXT_TELEMETRY_DISABLED: '1',
};
let child;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child?.kill(signal));
function run(args) {
  return new Promise((resolve, reject) => {
    child = spawn(process.execPath, ['node_modules/next/dist/bin/next', ...args], {
      cwd: root,
      env,
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code, signal) =>
      code === 0 || signal ? resolve() : reject(new Error(`next ${args[0]} exited ${code}`)),
    );
  });
}
await run(['build']);
await run(['start', '--hostname', '0.0.0.0', '--port', '3210']);
