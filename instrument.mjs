import 'dotenv/config';
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

const defaultNodeDsn = 'https://9be2581c21e453db887c01c4858d8915@sentry.rubeen.dev/6';

Sentry.init({
  dsn: process.env.SENTRY_NODE_DSN?.trim() || defaultNodeDsn,
  integrations: [Sentry.fastifyIntegration(), nodeProfilingIntegration()],
  enableLogs: true,
  tracesSampleRate: 1.0,
  profileSessionSampleRate: 1.0,
  profileLifecycle: 'trace',
  sendDefaultPii: true,
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'production',
  release: process.env.npm_package_version
});
