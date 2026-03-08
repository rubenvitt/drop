import 'dotenv/config';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import Fastify from 'fastify';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { loadConfig } from './config.js';
import { authGuard, createRateLimiter, requestIp, Semaphore } from './security.js';
import { ensureDir, findAvailableFilePath, sanitizeCategory, sanitizeFilename } from './utils.js';

const config = loadConfig();
const maxFileSizeBytes = config.maxFileSizeMb * 1024 * 1024;
const semaphore = new Semaphore(config.maxParallelUploads);
const checkRateLimit = createRateLimiter(config.rateLimitPerMin);

const app = Fastify({ logger: true, bodyLimit: maxFileSizeBytes + 1024 * 1024 });

await ensureDir(config.uploadDir);
await ensureDir(config.metaDir);

app.register(fastifyMultipart, {
  limits: {
    fileSize: maxFileSizeBytes,
    files: 25,
    parts: 60
  }
});

app.register(fastifyStatic, {
  root: config.staticDir,
  prefix: '/'
});

app.addHook('onRequest', async (req, reply) => {
  if (!checkRateLimit(requestIp(req))) {
    return reply.code(429).send({ error: 'Rate limit exceeded' });
  }
});

const guard = authGuard(config);

app.get('/health', async () => ({ status: 'ok' }));

app.get('/metrics', async () => ({ status: 'disabled' }));

app.get('/u/:token', { preHandler: guard }, async (_, reply) => {
  return reply.sendFile('index.html');
});

app.get('/', { preHandler: guard }, async (_, reply) => {
  return reply.sendFile('index.html');
});

const handleUpload = async (req, reply) => {
  await semaphore.acquire();

  const ip = requestIp(req);
  const uploaded = [];
  const errors = [];

  try {
    const parts = req.parts();
    let hint = '';
    let category = '';

    for await (const part of parts) {
      if (part.type === 'field') {
        if (part.fieldname === 'hint') {
          hint = String(part.value ?? '').slice(0, 500);
        }
        if (part.fieldname === 'category') {
          category = sanitizeCategory(String(part.value ?? ''));
        }
        continue;
      }

      if (!config.allowedMime.includes(part.mimetype)) {
        part.file.resume();
        errors.push({ file: part.filename, error: 'type_not_allowed' });
        app.log.info({ ip, filename: part.filename, size: 0, result: 'rejected_type' }, 'upload');
        continue;
      }

      const safeName = sanitizeFilename(part.filename || 'upload.bin');
      const targetDir = category ? path.join(config.uploadDir, category) : config.uploadDir;
      await mkdir(targetDir, { recursive: true });
      const finalPath = await findAvailableFilePath(targetDir, safeName);
      const tempPath = `${finalPath}.part-${Date.now()}-${Math.random().toString(16).slice(2)}`;

      let bytes = 0;
      part.file.on('data', (chunk) => {
        bytes += chunk.length;
      });

      try {
        await pipeline(part.file, createWriteStream(tempPath, { flags: 'wx' }));
        await rename(tempPath, finalPath);

        if (hint || category) {
          const fileBase = path.basename(finalPath);
          const metaName = `${fileBase}.json`;
          const metaPath = path.join(config.metaDir, metaName);
          const payload = {
            timestamp: new Date().toISOString(),
            ip,
            filename: fileBase,
            storedPath: finalPath,
            size: bytes,
            hint,
            category
          };
          await writeFile(metaPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

          if (hint) {
            const notePath = path.join(targetDir, `${fileBase}.txt`);
            await writeFile(notePath, `${hint}\n`, 'utf8');
          }
        }

        uploaded.push({ filename: path.basename(finalPath), size: bytes });
        app.log.info({ ip, filename: path.basename(finalPath), size: bytes, result: 'ok' }, 'upload');
      } catch (error) {
        await rm(tempPath, { force: true });
        const tooLarge = error?.code === 'FST_REQ_FILE_TOO_LARGE';
        errors.push({ file: part.filename, error: tooLarge ? 'too_large' : 'store_failed' });
        app.log.error({ ip, filename: part.filename, size: bytes, result: 'error', err: error }, 'upload');
      }
    }

    if (uploaded.length === 0 && errors.some((entry) => entry.error === 'too_large')) {
      return reply.code(413).send({ error: 'One or more files exceed MAX_FILE_SIZE_MB', errors });
    }

    if (uploaded.length === 0 && errors.some((entry) => entry.error === 'type_not_allowed')) {
      return reply.code(415).send({ error: 'Disallowed MIME type', errors });
    }

    return reply.code(errors.length > 0 ? 207 : 200).send({ uploaded, errors });
  } catch (error) {
    if (error?.code === 'FST_REQ_FILE_TOO_LARGE') {
      return reply.code(413).send({ error: 'File too large' });
    }

    req.log.error({ err: error }, 'upload failed');
    return reply.code(500).send({ error: 'Upload failed' });
  } finally {
    semaphore.release();
  }
};

app.post('/upload', { preHandler: guard }, handleUpload);
app.post('/u/:token/upload', { preHandler: guard }, handleUpload);

app.setErrorHandler((error, _req, reply) => {
  if (error?.code === 'FST_REQ_FILE_TOO_LARGE') {
    reply.code(413).send({ error: 'File too large' });
    return;
  }

  if (!reply.sent) {
    reply.code(500).send({ error: 'Internal server error' });
  }
});

const shutdown = async () => {
  await app.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

app.listen({ host: config.host, port: config.port }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
