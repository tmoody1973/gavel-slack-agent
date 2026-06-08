import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchSubscriptions } from '../../alerts/match.js';

const row = {
  eventBodyName: 'ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE',
  title: 'An ordinance relating to rezoning of 234 N Ave',
};

const sub = (channelId, committees = [], keywords = []) => ({ channelId, committees, keywords });

test('matches on committee name (case-insensitive)', () => {
  const out = matchSubscriptions(row, [sub('C1', ['zoning, neighborhoods & development committee'])]);
  assert.deepEqual(out, ['C1']);
});

test('matches on a title keyword (case-insensitive)', () => {
  const out = matchSubscriptions(row, [sub('C2', [], ['REZONING'])]);
  assert.deepEqual(out, ['C2']);
});

test('no match returns empty', () => {
  assert.deepEqual(matchSubscriptions(row, [sub('C3', ['LICENSES COMMITTEE'], ['demolition'])]), []);
});

test('dedups a channel that matches on both committee and keyword', () => {
  const out = matchSubscriptions(row, [sub('C4', ['ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE'], ['rezoning'])]);
  assert.deepEqual(out, ['C4']);
});
