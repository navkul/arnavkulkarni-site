import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';
const portable = existsSync(resolve(import.meta.dirname, 'server.js'));
const root = portable ? import.meta.dirname : resolve(import.meta.dirname, '../.data/catan-host');
const server = resolve(root, 'server.js');
if (!existsSync(server)) {
  console.error('Prepare the offline host while online first: npm run catan:prepare-local');
  process.exit(1);
}
const port = process.env.CATAN_LOCAL_PORT ?? '3212';
const dataPath = process.env.CATAN_LOCAL_DATABASE_PATH ?? resolve(root, '../catan-local.sqlite');
console.log(`\nHost: http://localhost:${port}/catan?hosting=local`);
for (const n of Object.values(networkInterfaces()).flat())
  if (n?.family === 'IPv4' && !n.internal)
    console.log(`Join on this Wi-Fi: http://${n.address}:${port}/catan?hosting=local`);
console.log('Local games are unranked. Keep this process running while playing.\n');
// Do not forward online credentials to the offline server.
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) => !/^(CATAN_|VERCEL_|STRAVA_|GITHUB_|GH_|PG|POSTGRES|DATABASE_URL)/.test(key),
  ),
);
const child = spawn(process.execPath, [server], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...env,
    NODE_ENV: 'production',
    HOSTNAME: '0.0.0.0',
    PORT: port,
    CATAN_OFFLINE_ONLY: '1',
    CATAN_LOCAL_DATABASE_PATH: dataPath,
    NEXT_TELEMETRY_DISABLED: '1',
  },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 0));
