import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CH295_SOURCES } from '../../zoning/sources.js';

test('every source has a url, parent, family, scope', () => {
  assert.ok(CH295_SOURCES.length >= 8);
  for (const s of CH295_SOURCES) {
    assert.match(s.url, /^https:\/\/city\.milwaukee\.gov\/.*\.pdf$/);
    assert.ok(s.parent && s.family && s.scope);
    assert.ok(['district', 'general', 'table'].includes(s.scope));
  }
});

test('subchapters 1-4 are general scope; residential is district scope', () => {
  const general = CH295_SOURCES.filter((s) => s.scope === 'general');
  assert.ok(general.some((s) => /Definitions/i.test(s.parent)));
  const residential = CH295_SOURCES.find((s) => s.family === 'residential');
  assert.equal(residential.scope, 'district');
});

test('includes the intact zoning table source', () => {
  const table = CH295_SOURCES.find((s) => s.scope === 'table');
  assert.ok(table);
  assert.match(table.url, /CH295table\.pdf$/);
});
