import assert from 'node:assert/strict';
import { test } from 'node:test';
import { informationUnavailable, safeCall } from '../src/errors.js';

test('informationUnavailable returns the structured shape', () => {
  assert.deepEqual(informationUnavailable('not found'), {
    status: 'information_unavailable',
    reason: 'not found',
  });
});

test('safeCall returns the fn result on success', async () => {
  const out = await safeCall(async () => ({ ok: 1 }), 'ctx');
  assert.deepEqual(out, { ok: 1 });
});

test('safeCall converts a thrown error to information_unavailable', async () => {
  const out = await safeCall(async () => {
    throw new Error('Legistar request failed: 503');
  }, 'get_matter(99)');
  assert.equal(out.status, 'information_unavailable');
  assert.match(out.reason, /get_matter\(99\)/);
  assert.match(out.reason, /503/);
});
