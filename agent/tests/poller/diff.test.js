import assert from 'node:assert/strict';
import { test } from 'node:test';
import { diffNewItems } from '../../poller/diff.js';
import { detectionKey } from '../../poller/keys.js';

const item = (client, eventItemId) => ({ client, eventItemId, title: `item ${eventItemId}` });

test('detectionKey composes client and eventItemId', () => {
  assert.equal(detectionKey('milwaukee', 42), 'milwaukee:42');
});

test('empty fetch yields no new items', () => {
  assert.deepEqual(diffNewItems([], new Set()), []);
});

test('all-seen yields no new items', () => {
  const seen = new Set(['milwaukee:1', 'milwaukee:2']);
  assert.deepEqual(diffNewItems([item('milwaukee', 1), item('milwaukee', 2)], seen), []);
});

test('returns only items whose key is not in seen', () => {
  const seen = new Set(['milwaukee:1']);
  const out = diffNewItems([item('milwaukee', 1), item('milwaukee', 2)], seen);
  assert.deepEqual(
    out.map((i) => i.eventItemId),
    [2],
  );
});

test('dedups repeated keys within a single fetch batch', () => {
  const out = diffNewItems([item('milwaukee', 7), item('milwaukee', 7)], new Set());
  assert.equal(out.length, 1);
});

test('same eventItemId under different clients are distinct', () => {
  const out = diffNewItems([item('milwaukee', 5), item('milwaukeecounty', 5)], new Set());
  assert.equal(out.length, 2);
});

test('accepts an array of keys as well as a Set', () => {
  const out = diffNewItems([item('milwaukee', 1), item('milwaukee', 2)], ['milwaukee:1']);
  assert.deepEqual(
    out.map((i) => i.eventItemId),
    [2],
  );
});
