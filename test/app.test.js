import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { createApp } from '../src/app.js';

const SESSION_COOKIE = 'session=admin-session';
const VALID_SHARE_TOKEN = 'dz_validsharetoken0001';

class StubAuthService {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.session = {
      session: {
        id: 'session-1',
        expiresAt: new Date('2030-01-01T00:00:00.000Z')
      },
      user: {
        id: 'user-1',
        email: 'admin@example.com',
        name: 'Admin'
      }
    };
    this.apiKeys = [
      this.#buildApiKey({
        id: 'key-1',
        key: VALID_SHARE_TOKEN,
        name: 'Bestehender Link'
      })
    ];
  }

  #buildApiKey({ id, key, name, expiresAt = new Date('2030-02-01T00:00:00.000Z') }) {
    return {
      id,
      key,
      name,
      prefix: 'dz_',
      start: key.slice(0, 8),
      enabled: true,
      permissions: { files: ['write'] },
      createdAt: new Date('2026-03-12T10:00:00.000Z'),
      expiresAt,
      userId: this.session.user.id
    };
  }

  #isAuthenticated(headers = {}) {
    return String(headers.cookie ?? '').includes(SESSION_COOKIE);
  }

  async handleAuthRequest(request) {
    const pathname = new URL(request.url).pathname;

    if (pathname === '/api/auth/sign-in/oauth2') {
      const body = await request.json();
      return new Response(
        JSON.stringify({
          url: `https://pocketid.example/authorize?returnTo=${encodeURIComponent(body.callbackURL)}`
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'set-cookie': 'oauth_state=stub; Path=/; HttpOnly'
          }
        }
      );
    }

    if (pathname === '/api/auth/sign-out') {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'set-cookie': 'session=; Path=/; Max-Age=0'
        }
      });
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: {
        'content-type': 'application/json'
      }
    });
  }

  async getSession(headers) {
    return this.#isAuthenticated(headers) ? this.session : null;
  }

  async listApiKeys() {
    return {
      apiKeys: this.apiKeys.map(({ key, ...apiKey }) => apiKey)
    };
  }

  async createApiKey(_headers, body) {
    const key = `dz_createdtoken${String(this.apiKeys.length + 1).padStart(4, '0')}`;
    const apiKey = this.#buildApiKey({
      id: `key-${this.apiKeys.length + 1}`,
      key,
      name: body.name,
      expiresAt: new Date(Date.now() + body.expiresIn * 1000)
    });
    this.apiKeys.unshift(apiKey);
    return apiKey;
  }

  async deleteApiKey(_headers, body) {
    this.apiKeys = this.apiKeys.filter((apiKey) => apiKey.id !== body.keyId);
    return { success: true };
  }

  async verifyApiKey(key, permissions) {
    const apiKey = this.apiKeys.find((entry) => entry.key === key);
    if (!apiKey) {
      return {
        valid: false,
        error: { code: 'KEY_NOT_FOUND', message: 'Key not found' },
        key: null
      };
    }

    const needsWrite = permissions?.files?.includes('write');
    const hasWrite = apiKey.permissions.files.includes('write');
    if (needsWrite && !hasWrite) {
      return {
        valid: false,
        error: { code: 'INSUFFICIENT_PERMISSIONS', message: 'Insufficient permissions' },
        key: null
      };
    }

    return {
      valid: true,
      error: null,
      key: {
        ...apiKey,
        key: undefined
      }
    };
  }

  close() {}
}

function createMultipartPayload({
  boundary = '----dropzone-test-boundary',
  fields = {},
  file = {
    name: 'demo.txt',
    type: 'text/plain',
    content: 'hello'
  }
} = {}) {
  const parts = [];

  for (const [name, value] of Object.entries(fields)) {
    parts.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
    );
  }

  parts.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n${file.content}\r\n`
  );
  parts.push(`--${boundary}--\r\n`);

  return {
    body: Buffer.from(parts.join('')),
    contentType: `multipart/form-data; boundary=${boundary}`
  };
}

async function createTestApp() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'dropzone-auth-test-'));
  const config = {
    host: '127.0.0.1',
    port: 0,
    uploadDir: path.join(tempDir, 'uploads'),
    metaDir: path.join(tempDir, 'meta'),
    maxFileSizeMb: 10,
    allowedMime: ['text/plain'],
    maxParallelUploads: 2,
    rateLimitPerMin: 100,
    timezone: 'Europe/Berlin',
    caddyDomain: 'drop.local',
    nodeEnv: 'test',
    staticDir: path.join(process.cwd(), 'public'),
    authDbPath: path.join(tempDir, 'auth.sqlite'),
    authDbDir: path.join(tempDir, 'auth'),
    betterAuthSecret: 'test-secret',
    betterAuthBaseUrl: 'http://localhost:8080',
    pocketIdDiscoveryUrl: 'https://pocketid.example/.well-known/openid-configuration',
    pocketIdClientId: 'client-id',
    pocketIdClientSecret: 'client-secret'
  };
  const app = await createApp({
    config,
    authService: new StubAuthService(config.betterAuthBaseUrl)
  });

  return {
    app,
    config,
    tempDir
  };
}

test('redirects browser routes to login and protects upload endpoint by session', async (t) => {
  const { app, config, tempDir } = await createTestApp();
  t.after(async () => {
    await app.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  const pageResponse = await app.inject({
    method: 'GET',
    url: '/'
  });
  assert.equal(pageResponse.statusCode, 302);
  assert.equal(pageResponse.headers.location, '/login?returnTo=%2F');

  const anonymousUpload = await app.inject({
    method: 'POST',
    url: '/upload'
  });
  assert.equal(anonymousUpload.statusCode, 401);

  const multipart = createMultipartPayload({
    fields: {
      hint: 'Wichtiger Hinweis',
      category: 'berichte'
    }
  });
  const uploadResponse = await app.inject({
    method: 'POST',
    url: '/upload',
    headers: {
      cookie: SESSION_COOKIE,
      'content-type': multipart.contentType
    },
    payload: multipart.body
  });
  assert.equal(uploadResponse.statusCode, 200);

  const storedFile = await readFile(path.join(config.uploadDir, 'berichte', 'demo.txt'), 'utf8');
  assert.equal(storedFile, 'hello');
});

test('accepts valid share links and rejects invalid ones', async (t) => {
  const { app, config, tempDir } = await createTestApp();
  t.after(async () => {
    await app.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  const pageResponse = await app.inject({
    method: 'GET',
    url: `/u/${VALID_SHARE_TOKEN}`
  });
  assert.equal(pageResponse.statusCode, 200);

  const invalidPage = await app.inject({
    method: 'GET',
    url: '/u/dz_invalidtoken'
  });
  assert.equal(invalidPage.statusCode, 401);

  const multipart = createMultipartPayload();
  const uploadResponse = await app.inject({
    method: 'POST',
    url: `/u/${VALID_SHARE_TOKEN}/upload`,
    headers: {
      'content-type': multipart.contentType
    },
    payload: multipart.body
  });
  assert.equal(uploadResponse.statusCode, 200);

  const sharedUpload = await readFile(path.join(config.uploadDir, 'demo.txt'), 'utf8');
  assert.equal(sharedUpload, 'hello');

  const invalidUpload = await app.inject({
    method: 'POST',
    url: '/u/dz_invalidtoken/upload',
    headers: {
      'content-type': multipart.contentType
    },
    payload: multipart.body
  });
  assert.equal(invalidUpload.statusCode, 401);
});

test('lists, creates and revokes share tokens for an authenticated admin', async (t) => {
  const { app, tempDir } = await createTestApp();
  t.after(async () => {
    await app.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  const anonymousList = await app.inject({
    method: 'GET',
    url: '/api/admin/tokens'
  });
  assert.equal(anonymousList.statusCode, 401);

  const initialList = await app.inject({
    method: 'GET',
    url: '/api/admin/tokens',
    headers: {
      cookie: SESSION_COOKIE
    }
  });
  assert.equal(initialList.statusCode, 200);
  assert.equal(initialList.json().tokens.length, 1);

  const createResponse = await app.inject({
    method: 'POST',
    url: '/api/admin/tokens',
    headers: {
      cookie: SESSION_COOKIE,
      'content-type': 'application/json'
    },
    payload: JSON.stringify({
      name: 'Neuer Link',
      expiresInDays: 14
    })
  });
  assert.equal(createResponse.statusCode, 201);
  assert.match(createResponse.json().rawToken, /^dz_/);

  const listAfterCreate = await app.inject({
    method: 'GET',
    url: '/api/admin/tokens',
    headers: {
      cookie: SESSION_COOKIE
    }
  });
  assert.equal(listAfterCreate.json().tokens.length, 2);

  const createdTokenId = createResponse.json().token.id;
  const deleteResponse = await app.inject({
    method: 'DELETE',
    url: `/api/admin/tokens/${createdTokenId}`,
    headers: {
      cookie: SESSION_COOKIE
    }
  });
  assert.equal(deleteResponse.statusCode, 200);
  assert.equal(deleteResponse.json().success, true);
});

test('starts Pocket ID login and clears session on logout', async (t) => {
  const { app, tempDir } = await createTestApp();
  t.after(async () => {
    await app.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  const loginResponse = await app.inject({
    method: 'GET',
    url: '/login/pocketid?returnTo=%2Fadmin'
  });
  assert.equal(loginResponse.statusCode, 302);
  assert.match(loginResponse.headers.location, /^https:\/\/pocketid\.example\/authorize/);

  const logoutResponse = await app.inject({
    method: 'POST',
    url: '/logout',
    headers: {
      cookie: SESSION_COOKIE
    }
  });
  assert.equal(logoutResponse.statusCode, 302);
  assert.equal(logoutResponse.headers.location, '/login');
});
