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
