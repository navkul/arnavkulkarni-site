import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, readlink, symlink, rm, writeFile } from 'node:fs/promises';
import { resolve, join, dirname, relative, isAbsolute } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const built = spawnSync(process.execPath, ['node_modules/next/dist/bin/next', 'build'], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    CATAN_BUILD_LOCAL: '1',
    CATAN_OFFLINE_ONLY: '1',
    NEXT_TELEMETRY_DISABLED: '1',
  },
});
if (built.status !== 0) process.exit(built.status ?? 1);
const output = resolve(root, '.data/catan-host');
// Runtime data lives separately in .data/catan-local.sqlite, outside this replaceable bundle.
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const source = resolve(root, '.next/standalone');
await cp(source, output, { recursive: true, verbatimSymlinks: true });
// Keep traced external-package aliases portable when the build folder moves.
async function portableLinks(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await portableLinks(path);
    else if (entry.isSymbolicLink()) {
      const target = await readlink(path);
      const resolved = resolve(dirname(path), target);
      const fromSource = relative(source, resolved);
      const remapped =
        !fromSource.startsWith('..') && !isAbsolute(fromSource)
          ? resolve(output, fromSource)
          : resolved;
      const fromOutput = relative(output, remapped);
      if (fromOutput.startsWith('..') || isAbsolute(fromOutput))
        throw new Error(`Non-portable dependency link: ${path}`);
      await rm(path);
      await symlink(relative(dirname(path), remapped), path);
    }
  }
}
await portableLinks(output);
for (const name of await readdir(output))
  if (name.startsWith('.env')) await rm(join(output, name), { force: true });
await cp(resolve(root, '.next/static'), resolve(output, '.next/static'), { recursive: true });
if (existsSync(resolve(root, 'public')))
  await cp(resolve(root, 'public'), resolve(output, 'public'), { recursive: true });
await cp(resolve(root, 'scripts/start-catan-local.mjs'), resolve(output, 'start-local.mjs'));
await writeFile(
  resolve(output, 'README.txt'),
  'Requires Node.js 22.13 or newer. Run: node start-local.mjs\nKeep this computer running. Share the printed Wi-Fi address with players. No internet or database service is required.\n',
);
console.log(
  '\nOffline host prepared. Start anytime with: npm run catan:local\nPortable bundle: .data/catan-host (requires Node 22 on the destination computer).',
);
