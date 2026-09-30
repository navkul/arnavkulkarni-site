import { spawn } from 'node:child_process';
import { rm, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
// Isolated test storage: this runner never touches the normal catan.sqlite file.
const path = resolve(root, '.data/catan-e2e.sqlite');
await mkdir(resolve(root, '.data'), { recursive: true });
for (const suffix of ['', '-wal', '-shm']) await rm(path + suffix, { force: true });
const env = {
  ...process.env,
  CATAN_DATABASE_PATH: path,
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
