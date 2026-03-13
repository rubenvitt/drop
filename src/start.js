import 'dotenv/config';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const cliPath = path.join(projectRoot, 'node_modules', '@better-auth', 'cli', 'dist', 'index.mjs');

if (!existsSync(cliPath)) {
  throw new Error(`Better Auth CLI not found at ${cliPath}`);
}

const result = spawnSync(process.execPath, [cliPath, 'migrate', '--config', 'src/auth.js', '--yes'], {
  cwd: projectRoot,
  env: process.env,
  encoding: 'utf8'
});

if (result.stdout) {
  process.stdout.write(result.stdout);
}

if (result.stderr) {
  process.stderr.write(result.stderr);
}

if (result.status !== 0) {
  const authDbPath = process.env.AUTH_DB_PATH ?? '/data/auth/better-auth.sqlite';
  console.error(
    `[startup] Better Auth migration failed. Check that ${authDbPath} is writable and that BETTER_AUTH_SECRET, BETTER_AUTH_BASE_URL, POCKET_ID_DISCOVERY_URL, POCKET_ID_CLIENT_ID and POCKET_ID_CLIENT_SECRET are set correctly.`
  );
  process.exit(result.status ?? 1);
}

await import('./server.js');
