import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeFilename } from '../src/utils.js';

test('sanitize filename keeps extension and strips unsafe chars', () => {
  assert.equal(sanitizeFilename('äö Übung 2026!!.PDF'), 'ao_ubung_2026.pdf');
});

test('sanitize filename provides fallback name', () => {
  assert.equal(sanitizeFilename('$$$'), 'datei');
});
