import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createLocalShareUrl,
  getGeneratedShareLinkOptions,
  parseStoredShareTokens,
  reconcileStoredShareTokens,
  upsertStoredShareToken
} from '../public/admin-token-utils.js';

test('createLocalShareUrl builds a share link for the current origin', () => {
  assert.equal(
    createLocalShareUrl('https://drop.example/admin', 'dz-k234-5678-abcd'),
    'https://drop.example/u/dz-k234-5678-abcd'
  );
});

test('parseStoredShareTokens ignores invalid storage content', () => {
  assert.deepEqual(parseStoredShareTokens('not-json'), []);
  assert.deepEqual(parseStoredShareTokens(JSON.stringify([{ id: 'a' }, null])), []);
});

test('upsertStoredShareToken replaces duplicate ids and keeps newest first', () => {
  const entries = upsertStoredShareToken(
    [
      {
        id: 'key-1',
        name: 'Alt',
        rawToken: 'dz-old1-1111-1111'
      }
    ],
    {
      id: 'key-1',
      name: 'Neu',
      rawToken: 'dz-new1-1111-1111'
    }
  );

  assert.deepEqual(entries, [
    {
      id: 'key-1',
      name: 'Neu',
      rawToken: 'dz-new1-1111-1111',
      createdAt: null,
      expiresAt: null
    }
  ]);
});

test('reconcileStoredShareTokens keeps only active tokens and refreshes metadata', () => {
  const reconciled = reconcileStoredShareTokens(
    [
      {
        id: 'key-1',
        name: 'Lokal',
        rawToken: 'dz-k234-5678-abcd',
        expiresAt: null
      },
      {
        id: 'key-2',
        name: 'Veraltet',
        rawToken: 'dz-k999-9999-9999',
        expiresAt: null
      }
    ],
    [
      {
        id: 'key-1',
        name: 'Servername',
        createdAt: '2026-03-13T10:00:00.000Z',
        expiresAt: '2026-03-14T10:00:00.000Z'
      }
    ]
  );

  assert.deepEqual(reconciled, [
    {
      id: 'key-1',
      name: 'Servername',
      rawToken: 'dz-k234-5678-abcd',
      createdAt: '2026-03-13T10:00:00.000Z',
      expiresAt: '2026-03-14T10:00:00.000Z'
    }
  ]);
});

test('getGeneratedShareLinkOptions exposes only active tokens with locally known raw token', () => {
  const options = getGeneratedShareLinkOptions(
    [
      {
        id: 'key-1',
        name: 'Bekannt',
        createdAt: '2026-03-13T10:00:00.000Z',
        expiresAt: '2026-03-14T10:00:00.000Z'
      },
      {
        id: 'key-2',
        name: 'Unbekannt',
        createdAt: '2026-03-13T11:00:00.000Z',
        expiresAt: '2026-03-14T11:00:00.000Z'
      }
    ],
    [
      {
        id: 'key-1',
        name: 'Bekannt',
        rawToken: 'dz-k234-5678-abcd'
      }
    ]
  );

  assert.deepEqual(options, [
    {
      id: 'key-1',
      name: 'Bekannt',
      createdAt: '2026-03-13T10:00:00.000Z',
      expiresAt: '2026-03-14T10:00:00.000Z',
      rawToken: 'dz-k234-5678-abcd'
    }
  ]);
});
