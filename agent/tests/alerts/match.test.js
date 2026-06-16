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

// MOO-69: the same router serves E-Notify notifications ({category, subject, district}).
const notification = { category: 'licenses', subject: 'RENEWAL Class B Tavern License', district: '3' };

test('routes an E-Notify notification by a subject keyword', () => {
  const out = matchSubscriptions(notification, [sub('N1', [], ['tavern'])]);
  assert.deepEqual(out, ['N1']);
});

test('routes an E-Notify notification by aldermanic district boundary', () => {
  const subWithBoundary = { channelId: 'N2', committees: [], keywords: [], boundary: { type: 'district', value: '3' } };
  assert.deepEqual(matchSubscriptions(notification, [subWithBoundary]), ['N2']);
});

test('does not route to a different district', () => {
  const subWrongDistrict = { channelId: 'N3', committees: [], keywords: [], boundary: { type: 'district', value: '7' } };
  assert.deepEqual(matchSubscriptions(notification, [subWrongDistrict]), []);
});

test('a Legistar item with no district never false-matches a boundary subscription', () => {
  const subWithBoundary = { channelId: 'N4', committees: [], keywords: [], boundary: { type: 'district', value: '3' } };
  assert.deepEqual(matchSubscriptions(row, [subWithBoundary]), []);
});
