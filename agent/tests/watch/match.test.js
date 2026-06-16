import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyEntity, matchMatter, dedupKey } from '../../watch/match.js';

const matter = (over = {}) => ({
  matterId: 1,
  file: '260229',
  title: 'Rezoning of 2000 S 13th St from RT4',
  name: 'Zoning change',
  ...over,
});

test('matchMatter: substring hit in title is case-insensitive', () => {
  assert.equal(matchMatter('2000 s 13th st', matter()), true);
  assert.equal(matchMatter('PUNTA CANA LLC', matter({ title: 'Sale to Punta Cana LLC' })), true);
  assert.equal(matchMatter('nonexistent parcel', matter()), false);
});

test('matchMatter: "File #260229" matches the bare MatterFile', () => {
  assert.equal(matchMatter('File #260229', matter()), true);
  assert.equal(matchMatter('file#260229', matter()), true);
  assert.equal(matchMatter('File #999999', matter()), false);
});

test('matchMatter: matches against MatterName too', () => {
  assert.equal(matchMatter('zoning change', matter({ title: 'terse', name: 'Zoning Change Resolution' })), true);
});

test('matchMatter: empty / whitespace entity never matches', () => {
  assert.equal(matchMatter('   ', matter()), false);
});

test('classifyEntity: addresses vs names', () => {
  assert.equal(classifyEntity('2000 S 13th St'), 'address');
  assert.equal(classifyEntity('1108 e chambers st'), 'address');
  assert.equal(classifyEntity('Punta Cana LLC'), 'name');
  assert.equal(classifyEntity('File #260229'), 'name');
});

test('dedupKey: stable and field-sensitive', () => {
  const a = dedupKey({ channelId: 'C1', entity: 'XYZ LLC', kind: 'matter', refId: '42' });
  const b = dedupKey({ channelId: 'C1', entity: 'XYZ LLC', kind: 'matter', refId: '42' });
  const c = dedupKey({ channelId: 'C1', entity: 'XYZ LLC', kind: 'permit', refId: '42' });
  assert.equal(a, b);
  assert.notEqual(a, c);
});
