import path from 'node:path';

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const splitCsv = (value) =>
  value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

const defaultAllowedMime = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain'
];

export function loadConfig(env = process.env) {
  const authDbPath = env.AUTH_DB_PATH ?? '/data/auth/better-auth.sqlite';

  return {
    host: env.HOST ?? '0.0.0.0',
    port: toInt(env.PORT, 8080),
    uploadDir: env.UPLOAD_DIR ?? '/uploads',
    metaDir: env.META_DIR ?? '/data/meta',
    maxFileSizeMb: toInt(env.MAX_FILE_SIZE_MB, 500),
    allowedMime: env.ALLOWED_MIME ? splitCsv(env.ALLOWED_MIME) : defaultAllowedMime,
    maxParallelUploads: toInt(env.MAX_PARALLEL_UPLOADS, 3),
    rateLimitPerMin: toInt(env.RATE_LIMIT_PER_MIN, 30),
    timezone: env.TZ ?? 'Europe/Berlin',
    caddyDomain: env.CADDY_DOMAIN ?? 'drop.local',
    nodeEnv: env.NODE_ENV ?? 'production',
    staticDir: path.join(process.cwd(), 'public'),
    authDbPath,
    authDbDir: path.dirname(authDbPath),
    betterAuthSecret: env.BETTER_AUTH_SECRET ?? '',
    betterAuthBaseUrl: env.BETTER_AUTH_BASE_URL ?? '',
    pocketIdDiscoveryUrl: env.POCKET_ID_DISCOVERY_URL ?? '',
    pocketIdClientId: env.POCKET_ID_CLIENT_ID ?? '',
    pocketIdClientSecret: env.POCKET_ID_CLIENT_SECRET ?? ''
  };
}
