import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeAddWatchSubmit, makeChannelConfigSubmit } from '../../../listeners/views/home-modals.js';

function makeDeps(overrides = {}) {
  return {
    listSubscriptions: async () => [{ channelId: 'C1', committees: [], keywords: ['x'], language: 'en' }],
    listAllWatches: async () => [],
    listUpcoming: async () => [],
    getChannelName: async () => 'general',
    addWatch: async () => 'id',
    upsertSubscription: async () => 'id',
    ...overrides,
  };
}

function submission({ values, privateMetadata = '' }) {
  const acks = [];
  const published = [];
  const args = {
    ack: async (r) => acks.push(r ?? null),
    body: { user: { id: 'U1' } },
    view: { private_metadata: privateMetadata, state: { values } },
    client: { views: { publish: async (v) => published.push(v) } },
    logger: { error: () => {} },
  };
  return { args, acks, published };
}

const watchValues = {
  watch_channel: { value: { selected_option: { value: 'C1' } } },
  watch_entity: { value: { value: '  File #260229  ' } },
};

test('add-watch submit trims the entity, writes the watch, and re-publishes', async () => {
  const added = [];
  const deps = makeDeps({ addWatch: async (input) => added.push(input) });
  const { args, acks, published } = submission({ values: watchValues });
  await makeAddWatchSubmit(deps)(args);
  assert.deepEqual(acks, [null]);
  assert.deepEqual(added, [{ channelId: 'C1', entity: 'File #260229' }]);
  assert.equal(published[0].user_id, 'U1');
});

test('add-watch submit with a blank entity returns an inline error and no mutation', async () => {
  const added = [];
  const deps = makeDeps({ addWatch: async (input) => added.push(input) });
  const { args, acks, published } = submission({
    values: { ...watchValues, watch_entity: { value: { value: '   ' } } },
  });
  await makeAddWatchSubmit(deps)(args);
  assert.equal(acks[0].response_action, 'errors');
  assert.ok(acks[0].errors.watch_entity);
  assert.equal(added.length, 0);
  assert.equal(published.length, 0);
});

const configValues = {
  cfg_committees: {
    home_committees: { selected_options: [{ value: 'LICENSES COMMITTEE' }, { value: 'PUBLIC WORKS COMMITTEE' }] },
  },
  cfg_keywords: { value: { value: ' rezoning , demolition ,, ' } },
  cfg_language: { value: { selected_option: { value: 'es' } } },
};

test('config submit parses committees/keywords/language and upserts on the metadata channel', async () => {
  const upserts = [];
  const deps = makeDeps({ upsertSubscription: async (input) => upserts.push(input) });
  const { args, acks, published } = submission({ values: configValues, privateMetadata: 'C1' });
  await makeChannelConfigSubmit(deps)(args);
  assert.deepEqual(acks, [null]);
  assert.deepEqual(upserts, [
    {
      channelId: 'C1',
      committees: ['LICENSES COMMITTEE', 'PUBLIC WORKS COMMITTEE'],
      keywords: ['rezoning', 'demolition'],
      language: 'es',
    },
  ]);
  assert.equal(published.length, 1);
});

test('config submit with no committees and no keywords returns an inline error', async () => {
  const upserts = [];
  const deps = makeDeps({ upsertSubscription: async (input) => upserts.push(input) });
  const { args, acks } = submission({
    values: {
      cfg_committees: { home_committees: { selected_options: [] } },
      cfg_keywords: { value: { value: '' } },
      cfg_language: { value: { selected_option: { value: 'en' } } },
    },
    privateMetadata: 'C1',
  });
  await makeChannelConfigSubmit(deps)(args);
  assert.equal(acks[0].response_action, 'errors');
  assert.ok(acks[0].errors.cfg_committees);
  assert.equal(upserts.length, 0);
});

test('a Convex failure after ack logs and never throws', async () => {
  const deps = makeDeps({
    upsertSubscription: async () => {
      throw new Error('convex down');
    },
  });
  const { args, acks } = submission({ values: configValues, privateMetadata: 'C1' });
  await makeChannelConfigSubmit(deps)(args);
  assert.deepEqual(acks, [null]);
});
