import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildMattersQuery, mapMatterSummary, createLegistarClient } from '../../poller/legistar.js';

test('buildMattersQuery: filters by MatterIntroDate >= now - lookback, newest first', () => {
  const q = buildMattersQuery('2026-06-16T12:00:00Z', 7);
  assert.match(q, /^matters\?/);
  // URLSearchParams encodes spaces as '+' (like buildEventsQuery) — normalize before asserting.
  const decoded = decodeURIComponent(q).replace(/\+/g, ' ');
  // 2026-06-16 minus 7 days = 2026-06-09
  assert.ok(decoded.includes("MatterIntroDate ge datetime'2026-06-09'"), q);
  assert.ok(decoded.includes('MatterIntroDate desc'), q);
  assert.ok(decoded.includes('$top=1000'), q);
});

test('mapMatterSummary: normalizes the fields the sweep matches on', () => {
  const row = mapMatterSummary({
    MatterId: 73861,
    MatterFile: '260229',
    MatterTitle: 'Rezoning 2000 S 13th St',
    MatterName: 'Zoning change',
    MatterIntroDate: '2026-06-10T00:00:00',
    MatterBodyName: 'ZONING, NEIGHBORHOODS & DEVELOPMENT',
    MatterTypeName: 'Ordinance',
  });
  assert.deepEqual(row, {
    matterId: 73861,
    file: '260229',
    title: 'Rezoning 2000 S 13th St',
    name: 'Zoning change',
    introDate: '2026-06-10T00:00:00',
    bodyName: 'ZONING, NEIGHBORHOODS & DEVELOPMENT',
    typeName: 'Ordinance',
  });
});

test('mapMatterSummary: missing optionals degrade to empty/undefined', () => {
  const row = mapMatterSummary({ MatterId: 5 });
  assert.equal(row.matterId, 5);
  assert.equal(row.file, '');
  assert.equal(row.title, '');
  assert.equal(row.name, '');
  assert.equal(row.introDate, undefined);
});

test('fetchRecentMatters: maps the OData array through the client', async () => {
  const client = createLegistarClient({
    fetch: async () => ({
      ok: true,
      json: async () => [{ MatterId: 1, MatterFile: '1', MatterTitle: 't', MatterName: 'n' }],
    }),
    client: 'milwaukee',
    userAgent: 'test',
    now: () => '2026-06-16T00:00:00Z',
  });
  const out = await client.fetchRecentMatters(7);
  assert.equal(out.length, 1);
  assert.equal(out[0].matterId, 1);
});
