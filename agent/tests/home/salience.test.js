import assert from 'node:assert';
import { describe, it } from 'node:test';

import { districtOf, selectSalient } from '../../home/salience.js';

const reasonsKinds = (entry) => entry.reasons.map((r) => r.kind).sort();

describe('districtOf', () => {
  it('extracts the aldermanic district number from a title', () => {
    assert.equal(districtOf('Appeal of Shirley Walker for fees (2712 N 53rd Street) (7th Aldermanic District)'), 7);
    assert.equal(districtOf('Rezoning at 100 E Wells (1st Aldermanic District)'), 1);
  });
  it('returns null when there is no district in the title', () => {
    assert.equal(districtOf('An ordinance creating an Immigration Advisory Board'), null);
    assert.equal(districtOf(undefined), null);
  });
});

describe('selectSalient', () => {
  const item = (over) => ({ eventItemId: Math.floor(Math.random() * 1e9), title: 'x', eventBodyName: 'X', ...over });

  it('surfaces a walk-on, a consent item, a district match, and a "big" item — drops the rest', () => {
    const walk = item({ eventItemId: 1, title: 'Routine note', walkOnFlag: true, eventDate: '2026-06-25' });
    const consent = item({ eventItemId: 2, title: 'Minor thing', consentFlag: true, eventDate: '2026-06-25' });
    const district = item({
      eventItemId: 3,
      title: 'Paving on Main (7th Aldermanic District)',
      eventDate: '2026-06-25',
    });
    const big = item({
      eventItemId: 4,
      title: 'A substitute resolution authorizing $4.2 million in bonding',
      eventDate: '2026-06-25',
    });
    const boring = item({ eventItemId: 5, title: 'Communication from the City Clerk', eventDate: '2026-06-25' });
    const out = selectSalient([walk, consent, district, big, boring], { boundaries: ['7'], cap: 10 });
    const ids = out.map((e) => e.item.eventItemId);
    assert.ok(ids.includes(1) && ids.includes(2) && ids.includes(3) && ids.includes(4), 'salient items surface');
    assert.ok(!ids.includes(5), 'a routine communication with no signal is dropped');
  });

  it('tags each surfaced item with explainable reasons (the reusable spine for MOO-127)', () => {
    const walk = item({ eventItemId: 1, title: 'X', walkOnFlag: true });
    const [entry] = selectSalient([walk], {});
    assert.deepStrictEqual(reasonsKinds(entry), ['walkOn']);
  });

  it('ranks district + anomaly above a merely "big" item', () => {
    const big = item({ eventItemId: 4, title: 'An ordinance relating to $5 million', eventDate: '2026-06-20' });
    const walk = item({
      eventItemId: 1,
      title: 'Thing (3rd Aldermanic District)',
      walkOnFlag: true,
      eventDate: '2026-06-30',
    });
    const out = selectSalient([big, walk], { boundaries: ['3'], cap: 10 });
    assert.equal(out[0].item.eventItemId, 1, 'the district+walk-on item outranks the big-only item');
  });

  it('only counts a district when it matches a channel boundary', () => {
    const d = item({ eventItemId: 3, title: 'Paving (7th Aldermanic District)' });
    assert.equal(
      selectSalient([d], { boundaries: ['1'] }).length,
      0,
      'district 7 not in boundaries → no district reason',
    );
    const out = selectSalient([d], { boundaries: ['7'] });
    assert.equal(out.length, 1);
    assert.ok(out[0].reasons.some((r) => r.kind === 'district' && r.detail === '7'));
  });

  it('dedupes by eventItemId and caps the result', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      item({ eventItemId: i, title: `An ordinance number ${i} for $1 million`, eventDate: '2026-06-25' }),
    );
    const dup = { ...many[0] };
    const out = selectSalient([...many, dup], { cap: 6 });
    assert.equal(out.length, 6, 'capped at 6');
    assert.equal(new Set(out.map((e) => e.item.eventItemId)).size, 6, 'no duplicate eventItemIds');
  });

  it('returns an empty array for empty / missing input', () => {
    assert.deepStrictEqual(selectSalient([], {}), []);
    assert.deepStrictEqual(selectSalient(undefined, {}), []);
  });
});
