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
  return {
    host: env.HOST ?? '0.0.0.0',
    port: toInt(env.PORT, 8080),
    uploadDir: env.UPLOAD_DIR ?? '/uploads',
    metaDir: env.META_DIR ?? '/data/meta',
    maxFileSizeMb: toInt(env.MAX_FILE_SIZE_MB, 500),
    allowedMime: env.ALLOWED_MIME ? splitCsv(env.ALLOWED_MIME) : defaultAllowedMime,
    authMode: env.AUTH_MODE ?? 'none',
    basicUser: env.BASIC_USER ?? '',
    basicPass: env.BASIC_PASS ?? '',
    tokenSecret: env.TOKEN_SECRET ?? '',
    allowedSubnets: splitCsv(env.ALLOWED_SUBNETS ?? '192.168.0.0/16,10.0.0.0/8,172.16.0.0/12'),
    maxParallelUploads: toInt(env.MAX_PARALLEL_UPLOADS, 3),
    rateLimitPerMin: toInt(env.RATE_LIMIT_PER_MIN, 30),
    timezone: env.TZ ?? 'Europe/Berlin',
    caddyDomain: env.CADDY_DOMAIN ?? 'drop.local',
    nodeEnv: env.NODE_ENV ?? 'production',
    staticDir: path.join(process.cwd(), 'public')
  };
}
