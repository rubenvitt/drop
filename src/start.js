import 'dotenv/config';
import { execFileSync } from 'node:child_process';

execFileSync('pnpm', ['exec', 'better-auth', 'migrate', '--config', 'src/auth.js', '--yes'], {
  stdio: 'inherit'
});

await import('./server.js');
