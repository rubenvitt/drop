import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import Fastify from 'fastify';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { loadConfig } from './config.js';
import { createRateLimiter, requestIp, Semaphore } from './security.js';
import { ensureDir, findAvailableFilePath, sanitizeCategory, sanitizeFilename } from './utils.js';

const FILE_WRITE_PERMISSION = { files: ['write'] };
const DEFAULT_TOKEN_EXPIRES_IN_DAYS = 30;
const MAX_TOKEN_EXPIRES_IN_DAYS = 365;

function toHeadersObject(nodeHeaders = {}) {
  const headers = new Headers();

  for (const [key, value] of Object.entries(nodeHeaders)) {
    if (value == null) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
      continue;
    }

    headers.set(key, String(value));
  }

  return headers;
}

function applyWebHeaders(reply, headers) {
  const setCookies = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
  if (setCookies.length > 0) {
    reply.header('set-cookie', setCookies);
  }

  headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') {
      return;
    }
    reply.header(key, value);
  });
}

async function sendWebResponse(reply, response) {
  applyWebHeaders(reply, response.headers);
  reply.status(response.status);

  if (!response.body) {
    return reply.send();
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const payload = await response.json();
    return reply.send(payload);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return reply.send(buffer.length > 0 ? buffer : null);
}

function buildAuthRequest(config, routePath, { method = 'GET', headers = {}, body } = {}) {
  const requestHeaders = toHeadersObject(headers);
  let requestBody = undefined;

  if (body !== undefined) {
    requestHeaders.set('content-type', 'application/json');
    requestBody = JSON.stringify(body);
  }

  return new Request(new URL(routePath, config.betterAuthBaseUrl), {
    method,
    headers: requestHeaders,
    body: requestBody
  });
}

function normalizeReturnTo(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return '/';
  }

  if (!value.startsWith('/') || value.startsWith('//')) {
    return '/';
  }

  return value;
}

function shouldRateLimit(req) {
  const url = req.raw.url ?? req.url ?? '';
  const method = req.method.toUpperCase();

  if (method === 'POST' && (url === '/upload' || url === '/api/admin/tokens')) {
    return true;
  }

  if (method === 'POST' && url.startsWith('/u/') && url.endsWith('/upload')) {
    return true;
  }

  if (method === 'DELETE' && url.startsWith('/api/admin/tokens/')) {
    return true;
  }

  return false;
}

function getAuthPageRedirectTarget(req) {
  return normalizeReturnTo(req.raw.url ?? req.url ?? '/');
}

function mapSession(session) {
  return {
    session: {
      id: session.session.id,
      expiresAt: session.session.expiresAt
    },
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      image: session.user.image ?? null
    }
  };
}

function mapApiKey(apiKey) {
  const mask = `${apiKey.start ?? apiKey.prefix ?? 'dz_'}...`;

  return {
    id: apiKey.id,
    name: apiKey.name ?? 'Unbenannt',
    prefix: apiKey.prefix ?? 'dz_',
    start: apiKey.start ?? null,
    displayToken: mask,
    enabled: Boolean(apiKey.enabled),
    createdAt: apiKey.createdAt,
    expiresAt: apiKey.expiresAt ?? null
  };
}

function parseTokenExpiryDays(value) {
  if (value == null || value === '') {
    return DEFAULT_TOKEN_EXPIRES_IN_DAYS;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > MAX_TOKEN_EXPIRES_IN_DAYS) {
    return null;
  }

  return parsed;
}

function daysToSeconds(days) {
  return days * 24 * 60 * 60;
}

function sendApiError(reply, error, fallbackMessage) {
  const status =
    Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode < 600
      ? error.statusCode
      : Number.isInteger(error?.status) && error.status >= 400 && error.status < 600
        ? error.status
        : 500;
  const message = typeof error?.message === 'string' ? error.message : fallbackMessage;
  return reply.code(status).send({ error: message });
}

function createUploadHandler({ app, config, semaphore }) {
  return async function handleUpload(req, reply) {
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
            const metaPath = path.join(config.metaDir, `${fileBase}.json`);
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
}

export async function createApp({ config = loadConfig(), authService } = {}) {
  const maxFileSizeBytes = config.maxFileSizeMb * 1024 * 1024;
  const semaphore = new Semaphore(config.maxParallelUploads);
  const checkRateLimit = createRateLimiter(config.rateLimitPerMin);
  const resolvedAuthService =
    authService ?? (await import('./auth.js')).createBetterAuthService(config);

  const app = Fastify({ logger: true, bodyLimit: maxFileSizeBytes + 1024 * 1024 });
  const uploadHandler = createUploadHandler({ app, config, semaphore });

  await ensureDir(config.uploadDir);
  await ensureDir(config.metaDir);

  app.decorateRequest('authSession', null);
  app.decorateRequest('shareKey', null);

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

  app.addHook('onClose', async () => {
    resolvedAuthService.close?.();
  });

  app.addHook('onRequest', async (req, reply) => {
    if (shouldRateLimit(req) && !checkRateLimit(requestIp(req))) {
      return reply.code(429).send({ error: 'Rate limit exceeded' });
    }
  });

  const requireSession = (mode) =>
    async function sessionGuard(req, reply) {
      const session = await resolvedAuthService.getSession(req.headers);

      if (!session) {
        if (mode === 'page') {
          const search = new URLSearchParams({ returnTo: getAuthPageRedirectTarget(req) });
          return reply.redirect(`/login?${search.toString()}`);
        }

        return reply.code(401).send({ error: 'Unauthorized' });
      }

      req.authSession = session;
    };

  const requireShareToken = async (req, reply) => {
    const token = req.params?.token;
    if (!token) {
      return reply.code(401).send({ error: 'Invalid token' });
    }

    const result = await resolvedAuthService.verifyApiKey(token, FILE_WRITE_PERMISSION);
    if (!result.valid || !result.key) {
      return reply.code(401).send({ error: 'Invalid token' });
    }

    req.shareKey = result.key;
  };

  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(request, reply) {
      const authRequest = buildAuthRequest(config, request.raw.url ?? request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body
      });
      const response = await resolvedAuthService.handleAuthRequest(authRequest);
      return sendWebResponse(reply, response);
    }
  });

  app.get('/health', async () => ({ status: 'ok' }));

  app.get('/metrics', async () => ({ status: 'disabled' }));

  app.get('/api/session', { preHandler: requireSession('api') }, async (req) => mapSession(req.authSession));

  app.get('/login', async (req, reply) => {
    const session = await resolvedAuthService.getSession(req.headers);
    if (session) {
      return reply.redirect(normalizeReturnTo(req.query?.returnTo));
    }

    return reply.sendFile('login.html');
  });

  app.get('/login.html', async (_, reply) => reply.redirect('/login'));

  app.get('/login/pocketid', async (req, reply) => {
    const returnTo = normalizeReturnTo(req.query?.returnTo);
    const loginRequest = buildAuthRequest(config, '/api/auth/sign-in/oauth2', {
      method: 'POST',
      headers: req.headers,
      body: {
        providerId: 'pocketid',
        callbackURL: returnTo,
        newUserCallbackURL: returnTo,
        errorCallbackURL: `/login?${new URLSearchParams({
          returnTo,
          error: 'oidc_failed'
        }).toString()}`,
        disableRedirect: true
      }
    });

    const response = await resolvedAuthService.handleAuthRequest(loginRequest);
    const payload = await response.json().catch(() => null);

    applyWebHeaders(reply, response.headers);

    if (!response.ok || !payload?.url) {
      return reply.code(response.status).send({ error: 'Pocket ID login could not be started' });
    }

    return reply.redirect(payload.url);
  });

  app.post('/logout', { preHandler: requireSession('api') }, async (req, reply) => {
    const signOutRequest = buildAuthRequest(config, '/api/auth/sign-out', {
      method: 'POST',
      headers: req.headers,
      body: {}
    });
    const response = await resolvedAuthService.handleAuthRequest(signOutRequest);

    applyWebHeaders(reply, response.headers);
    if (!response.ok) {
      return reply.code(response.status).send({ error: 'Logout failed' });
    }

    return reply.redirect('/login');
  });

  app.get('/admin', { preHandler: requireSession('page') }, async (_, reply) => reply.sendFile('admin.html'));

  app.get('/admin.html', { preHandler: requireSession('page') }, async (_, reply) => reply.sendFile('admin.html'));

  app.get('/u/:token', { preHandler: requireShareToken }, async (_, reply) => reply.sendFile('index.html'));

  app.get('/', { preHandler: requireSession('page') }, async (_, reply) => reply.sendFile('index.html'));

  app.get('/index.html', { preHandler: requireSession('page') }, async (_, reply) => reply.sendFile('index.html'));

  app.get('/api/admin/tokens', { preHandler: requireSession('api') }, async (req, reply) => {
    try {
      const result = await resolvedAuthService.listApiKeys(req.headers, {
        limit: 100,
        sortBy: 'createdAt',
        sortDirection: 'desc'
      });

      return {
        tokens: result.apiKeys.map(mapApiKey)
      };
    } catch (error) {
      return sendApiError(reply, error, 'Could not list tokens');
    }
  });

  app.post('/api/admin/tokens', { preHandler: requireSession('api') }, async (req, reply) => {
    const name = String(req.body?.name ?? '').trim();
    if (!name) {
      return reply.code(400).send({ error: 'Name is required' });
    }

    const expiresInDays = parseTokenExpiryDays(req.body?.expiresInDays);
    if (!expiresInDays) {
      return reply
        .code(400)
        .send({ error: `expiresInDays must be between 1 and ${MAX_TOKEN_EXPIRES_IN_DAYS}` });
    }

    try {
      const created = await resolvedAuthService.createApiKey(req.headers, {
        name,
        userId: req.authSession.user.id,
        expiresIn: daysToSeconds(expiresInDays),
        permissions: FILE_WRITE_PERMISSION,
        metadata: {
          createdFor: 'dropzone-share-link'
        }
      });

      return reply.code(201).send({
        token: mapApiKey(created),
        rawToken: created.key,
        shareUrl: new URL(`/u/${created.key}`, config.betterAuthBaseUrl).toString()
      });
    } catch (error) {
      return sendApiError(reply, error, 'Could not create token');
    }
  });

  app.delete('/api/admin/tokens/:id', { preHandler: requireSession('api') }, async (req, reply) => {
    try {
      await resolvedAuthService.deleteApiKey(req.headers, {
        keyId: req.params.id
      });

      return reply.send({ success: true });
    } catch (error) {
      return sendApiError(reply, error, 'Could not delete token');
    }
  });

  app.post('/upload', { preHandler: requireSession('api') }, uploadHandler);
  app.post('/u/:token/upload', { preHandler: requireShareToken }, uploadHandler);

  app.setErrorHandler((error, _req, reply) => {
    if (error?.code === 'FST_REQ_FILE_TOO_LARGE') {
      reply.code(413).send({ error: 'File too large' });
      return;
    }

    if (!reply.sent) {
      reply.code(500).send({ error: 'Internal server error' });
    }
  });

  return app;
}
