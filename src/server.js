import 'dotenv/config';
import * as Sentry from '@sentry/node';
import { loadConfig } from './config.js';
import { createApp } from './app.js';

const config = loadConfig();
const app = await createApp({ config });

const shutdown = async () => {
  try {
    await app.close();
  } finally {
    await Sentry.close(2000);
    process.exit(0);
  }
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

app.listen({ host: config.host, port: config.port }).catch((error) => {
  app.log.error(error);
  Sentry.captureException(error);
  Sentry.close(2000).finally(() => {
    process.exit(1);
  });
});
