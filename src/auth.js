import 'dotenv/config';
import crypto from 'node:crypto';
import { mkdirSync } from 'node:fs';
import Database from 'better-sqlite3';
import { betterAuth } from 'better-auth';
import { fromNodeHeaders } from 'better-auth/node';
import { genericOAuth } from 'better-auth/plugins';
import { apiKey } from '@better-auth/api-key';
import { loadConfig } from './config.js';
import {
  FILE_WRITE_PERMISSION,
  SHARE_TOKEN_ALPHABET,
  SHARE_TOKEN_LENGTH,
  SHARE_TOKEN_SEGMENT_LENGTH,
  SHARE_TOKEN_PREFIX
} from './share-token-config.js';

const DEFAULT_SHARE_TOKEN_EXPIRES_IN_SECONDS = 12 * 60 * 60;
const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;
const ONE_DAY_SECONDS = 24 * 60 * 60;

function required(value, name) {
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

function randomShareToken(length) {
  const bytes = crypto.randomBytes(length);
  let value = '';

  for (const byte of bytes) {
    value += SHARE_TOKEN_ALPHABET[byte % SHARE_TOKEN_ALPHABET.length];
  }

  return value;
}

function formatShareToken(value) {
  const groups = [];

  for (let index = 0; index < value.length; index += SHARE_TOKEN_SEGMENT_LENGTH) {
    groups.push(value.slice(index, index + SHARE_TOKEN_SEGMENT_LENGTH));
  }

  return groups.join('-');
}

function createAuthInstance(config) {
  mkdirSync(config.authDbDir, { recursive: true });

  const database = new Database(config.authDbPath);
  const auth = betterAuth({
    database,
    secret: required(config.betterAuthSecret, 'BETTER_AUTH_SECRET'),
    baseURL: required(config.betterAuthBaseUrl, 'BETTER_AUTH_BASE_URL'),
    trustedOrigins: [required(config.betterAuthBaseUrl, 'BETTER_AUTH_BASE_URL')],
    session: {
      expiresIn: SEVEN_DAYS_SECONDS,
      updateAge: ONE_DAY_SECONDS
    },
    plugins: [
      genericOAuth({
        config: [
          {
            providerId: 'pocketid',
            discoveryUrl: required(config.pocketIdDiscoveryUrl, 'POCKET_ID_DISCOVERY_URL'),
            clientId: required(config.pocketIdClientId, 'POCKET_ID_CLIENT_ID'),
            clientSecret: required(config.pocketIdClientSecret, 'POCKET_ID_CLIENT_SECRET'),
            scopes: ['openid', 'email', 'profile']
          }
        ]
      }),
      apiKey({
        defaultPrefix: SHARE_TOKEN_PREFIX,
        defaultKeyLength: SHARE_TOKEN_LENGTH,
        requireName: true,
        enableMetadata: true,
        permissions: {
          defaultPermissions: FILE_WRITE_PERMISSION
        },
        startingCharactersConfig: {
          shouldStore: true,
          charactersLength: 8
        },
        keyExpiration: {
          defaultExpiresIn: DEFAULT_SHARE_TOKEN_EXPIRES_IN_SECONDS,
          minExpiresIn: 1 / 24,
          maxExpiresIn: 3
        },
        rateLimit: {
          enabled: false
        },
        customKeyGenerator: ({ prefix = SHARE_TOKEN_PREFIX }) =>
          `${prefix}${formatShareToken(randomShareToken(SHARE_TOKEN_LENGTH))}`
      })
    ]
  });

  return { auth, database };
}

export function createBetterAuthService(config = loadConfig()) {
  const { auth, database } = createAuthInstance(config);

  return {
    config,
    async handleAuthRequest(request) {
      return auth.handler(request);
    },
    async getSession(headers) {
      return auth.api.getSession({ headers: fromNodeHeaders(headers) });
    },
    async listApiKeys(headers, query = {}) {
      return auth.api.listApiKeys({
        headers: fromNodeHeaders(headers),
        query
      });
    },
    async createApiKey(headers, body) {
      return auth.api.createApiKey({
        headers: fromNodeHeaders(headers),
        body
      });
    },
    async deleteApiKey(headers, body) {
      return auth.api.deleteApiKey({
        headers: fromNodeHeaders(headers),
        body
      });
    },
    async verifyApiKey(key, permissions) {
      return auth.api.verifyApiKey({
        body: {
          key,
          permissions
        }
      });
    },
    close() {
      database.close();
    }
  };
}

export function createShareUrl(baseUrl, token) {
  const url = new URL(`/u/${token}`, baseUrl);
  return url.toString();
}

export const auth = createAuthInstance(loadConfig()).auth;
