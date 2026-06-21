import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildHomeState } from '../../home/state.js';

const subscriptions = [
  {
    channelId: 'C1',
    committees: ['ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE'],
    keywords: ['rezoning'],
    language: 'es',
  },
  { channelId: 'C2', committees: [], keywords: ['liquor'], language: 'en' },
];
const watches = [
  { channelId: 'C1', entity: 'Punta Cana LLC' },
  { channelId: 'C2', entity: 'File #260234' },
];
const upcoming = [
  {
    eventId: 10,
    eventItemId: 1,
    eventBodyName: 'ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE',
    title: 'A rezoning',
    walkOnFlag: true,
  },
  {
    eventId: 10,
    eventItemId: 2,
    eventBodyName: 'ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE',
    title: 'Another item',
  },
  { eventId: 11, eventItemId: 3, eventBodyName: 'LICENSES COMMITTEE', title: 'Liquor license for Punta Cana LLC' },
  { eventId: 12, eventItemId: 4, eventBodyName: 'FINANCE & PERSONNEL COMMITTEE', title: 'Budget note' },
];

function deps(overrides = {}) {
  return {
    listSubscriptions: async () => subscriptions,
    listAllWatches: async () => watches,
    listUpcoming: async () => upcoming,
    getChannelName: async (id) => ({ C1: 'general', C2: 'cesar-chavez-dr' })[id] ?? id,
    ...overrides,
  };
}

test('strip counts: distinct matched meetings, walk-ons among matches, watch hits', async () => {
  const state = await buildHomeState(deps());
  assert.deepEqual(state.strip, { meetings: 2, lateAdds: 1, watchHits: 1 });
});

test('watches and channels carry resolved names and config', async () => {
  const state = await buildHomeState(deps());
  assert.deepEqual(state.watches[0], { channelId: 'C1', channelName: 'general', entity: 'Punta Cana LLC' });
  assert.equal(state.channels[1].channelName, 'cesar-chavez-dr');
  assert.equal(state.channels[0].language, 'es');
});

test('a failed channel-name lookup degrades to the raw id', async () => {
  const state = await buildHomeState(
    deps({
      getChannelName: async () => {
        throw new Error('missing_scope');
      },
    }),
  );
  assert.equal(state.channels[0].channelName, 'C1');
});

test('no subscriptions yields the empty state regardless of other data', async () => {
  const state = await buildHomeState(deps({ listSubscriptions: async () => [] }));
  assert.deepEqual(state.channels, []);
  assert.equal(state.configuredCount, 0);
});

test('reports configuredCount and surfaces per-channel role/configured', async () => {
  const state = await buildHomeState(
    deps({
      listSubscriptions: async () => [
        {
          channelId: 'C1',
          committees: ['LICENSES COMMITTEE'],
          keywords: [],
          language: 'en',
          configured: true,
          role: 'reporter',
        },
        { channelId: 'C2', committees: [], keywords: ['liquor'], language: 'en' },
      ],
    }),
  );
  assert.equal(state.configuredCount, 1);
  assert.equal(state.channels[0].role, 'reporter');
  assert.equal(state.channels[0].configured, true);
  assert.equal(state.channels[1].configured, false);
  assert.equal(state.channels[1].role, null);
});

test('storyLeads stays empty without a reporter channel (MOO-127 persona gate)', async () => {
  const state = await buildHomeState(deps());
  assert.deepEqual(state.storyLeads, []);
});

test('storyLeads is computed when a reporter channel exists, ranked + tagged', async () => {
  const state = await buildHomeState(
    deps({
      listSubscriptions: async () => [
        { channelId: 'C9', committees: [], keywords: [], language: 'en', role: 'reporter' },
      ],
      listUpcoming: async () => [
        {
          eventId: 12,
          eventItemId: 4,
          eventBodyName: 'FINANCE & PERSONNEL COMMITTEE',
          title: 'Resolution authorizing $5 million in bonding',
          walkOnFlag: true,
        },
        {
          eventId: 13,
          eventItemId: 5,
          eventBodyName: 'COMMON COUNCIL',
          title: 'Communication relating to routine staffing',
        },
      ],
    }),
  );
  assert.equal(state.storyLeads.length, 1);
  assert.equal(state.storyLeads[0].item.eventItemId, 4);
  assert.ok(state.storyLeads[0].tags.some((t) => t.kind === 'money'));
});

test('meetingsWithVideo stays empty without a reporter channel (MOO-142 persona gate)', async () => {
  const state = await buildHomeState(
    deps({
      listRecentMeetingsWithVideo: async () => [
        {
          eventId: 13441,
          eventBodyName: 'ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE',
          eventDate: '2026-06-16',
          eventMedia: 5210,
        },
      ],
      listIngestedEventIds: async () => [13441],
    }),
  );
  assert.deepEqual(state.meetingsWithVideo, []);
});

test('meetingsWithVideo is fetched + searchable-tagged when a reporter channel exists (MOO-142)', async () => {
  const state = await buildHomeState(
    deps({
      listSubscriptions: async () => [
        { channelId: 'C9', committees: [], keywords: [], language: 'en', role: 'reporter' },
      ],
      listRecentMeetingsWithVideo: async () => [
        {
          eventId: 13441,
          eventBodyName: 'ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE',
          eventDate: '2026-06-16',
          eventMedia: 5210,
        },
        { eventId: 13456, eventBodyName: 'FINANCE & PERSONNEL COMMITTEE', eventDate: '2026-06-18', eventMedia: 5213 },
      ],
      listIngestedEventIds: async () => [13441],
    }),
  );
  assert.equal(state.meetingsWithVideo.length, 2);
  assert.equal(state.meetingsWithVideo.find((m) => m.eventId === 13441).searchable, true);
  assert.equal(state.meetingsWithVideo.find((m) => m.eventId === 13456).searchable, false);
});

test('buildHomeState surfaces salient items in `discover` (walk-on + big), regardless of subscription (MOO-123)', async () => {
  const state = await buildHomeState(deps());
  const ids = state.discover.map((e) => e.item.eventItemId);
  assert.ok(ids.includes(1), 'the walk-on surfaces');
  assert.ok(ids.includes(4), 'the budget item surfaces as "big" even though no channel subscribes to Finance');
  for (const entry of state.discover) assert.ok(entry.reasons.length > 0, 'every discover item is explainable');
});
