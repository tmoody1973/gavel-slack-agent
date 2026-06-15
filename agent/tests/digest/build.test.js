import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildChannelDigests } from '../../digest/build.js';

const now = '2026-06-15';
const subscriptions = [
  {
    channelId: 'C1',
    committees: ['ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE'],
    keywords: ['rezoning'],
    language: 'es',
  },
  { channelId: 'C2', committees: ['LICENSES COMMITTEE'], keywords: [], language: 'en' },
];
const upcoming = [
  {
    eventId: 1,
    eventItemId: 11,
    eventBodyName: 'ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE',
    title: 'A rezoning',
    eventDate: '2026-06-18T00:00:00',
    matterId: 100,
    walkOnFlag: true,
  },
  {
    eventId: 2,
    eventItemId: 12,
    eventBodyName: 'ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE',
    title: 'Another zoning item',
    eventDate: '2026-06-20T00:00:00',
    matterId: 101,
  },
  {
    eventId: 3,
    eventItemId: 13,
    eventBodyName: 'PUBLIC WORKS COMMITTEE',
    title: 'Paving',
    eventDate: '2026-06-19T00:00:00',
  },
  {
    eventId: 4,
    eventItemId: 14,
    eventBodyName: 'ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE',
    title: 'Far-future zoning',
    eventDate: '2026-07-30T00:00:00',
    matterId: 102,
  },
];
const enrich = async (row) => ({ fileNumber: `F${row.matterId ?? 'x'}`, legistarUrl: `https://leg/${row.eventId}` });

test('filters by subscription, windows to 7 days, counts + flags correctly', async () => {
  const digests = await buildChannelDigests({ subscriptions, upcoming, enrich, now });
  const c1 = digests.find((d) => d.channelId === 'C1');
  assert.equal(c1.total, 2);
  assert.equal(c1.language, 'es');
  assert.match(JSON.stringify(c1.card.blocks), /requiere atención/);
});

test('top is sorted soonest-first and enriched', async () => {
  const [c1] = await buildChannelDigests({ subscriptions, upcoming, enrich, now });
  const all = JSON.stringify(c1.card.blocks);
  assert.ok(all.indexOf('F100') < all.indexOf('F101'));
  assert.ok(all.includes('https://leg/1'));
});

test('a channel with no matches returns a quiet-week entry (total 0)', async () => {
  const digests = await buildChannelDigests({
    subscriptions: [{ channelId: 'C9', committees: ['FIRE AND POLICE COMMISSION'], keywords: [], language: 'en' }],
    upcoming,
    enrich,
    now,
  });
  assert.equal(digests[0].total, 0);
  assert.match(JSON.stringify(digests[0].card.blocks), /quiet week/i);
});

test('enrich is called only for the rendered top-3, not every match', async () => {
  let calls = 0;
  const counting = async (r) => {
    calls += 1;
    return { fileNumber: `F${r.matterId}` };
  };
  const many = Array.from({ length: 6 }, (_, i) => ({
    eventId: 10 + i,
    eventItemId: 20 + i,
    eventBodyName: 'LICENSES COMMITTEE',
    title: `L${i}`,
    eventDate: `2026-06-1${6 + (i % 3)}T00:00:00`,
    matterId: 200 + i,
  }));
  await buildChannelDigests({
    subscriptions: [{ channelId: 'C2', committees: ['LICENSES COMMITTEE'], keywords: [], language: 'en' }],
    upcoming: many,
    enrich: counting,
    now,
  });
  assert.equal(calls, 3);
});
