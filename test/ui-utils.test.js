import test from 'node:test';
import assert from 'node:assert/strict';
import { isShareLinkPath, resolveUploadPath } from '../public/ui-utils.js';

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
