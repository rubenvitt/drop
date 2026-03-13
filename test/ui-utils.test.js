import test from 'node:test';
import assert from 'node:assert/strict';
import { isShareLinkPath, normalizeShareTokenInput, resolveUploadPath } from '../public/ui-utils.js';

test('resolveUploadPath uses session upload path for root page', () => {
  assert.equal(resolveUploadPath('/'), '/upload');
});

test('resolveUploadPath uses token upload path for share links', () => {
  assert.equal(resolveUploadPath('/u/dz_demo123'), '/u/dz_demo123/upload');
});

test('isShareLinkPath detects token route', () => {
  assert.equal(isShareLinkPath('/u/dz_demo123'), true);
  assert.equal(isShareLinkPath('/admin'), false);
});

test('normalizeShareTokenInput accepts grouped tokens and share links', () => {
  assert.equal(normalizeShareTokenInput('dz k234 5678 abcd'), 'dz-k234-5678-abcd');
  assert.equal(
    normalizeShareTokenInput('https://drop.example/u/dz-k234-5678-abcd'),
    'dz-k234-5678-abcd'
  );
});

test('normalizeShareTokenInput keeps legacy tokens intact', () => {
  assert.equal(normalizeShareTokenInput('dz_validsharetoken0001'), 'dz_validsharetoken0001');
});
