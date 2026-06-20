import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  makeCommitteeOptions,
  makeDiscoverWatch,
  makeHomeAddWatch,
  makeHomeEditChannel,
  makeHomeWatchRemove,
} from '../../../listeners/actions/home-buttons.js';

const subscription = {
  channelId: 'C1',
  committees: ['LICENSES COMMITTEE'],
  keywords: ['rezoning'],
  language: 'es',
};

function makeDeps(overrides = {}) {
  return {
    listSubscriptions: async () => [subscription],
    listAllWatches: async () => [],
    listUpcoming: async () => [],
    getSubscription: async () => subscription,
    getChannelName: async () => 'general',
    removeWatch: async () => 'someid',
    listCommitteeNames: async () => [
      'LICENSES COMMITTEE',
      'PUBLIC WORKS COMMITTEE',
      'ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE',
    ],
    ...overrides,
  };
}

function boltArgs(action = {}) {
  const opened = [];
  const published = [];
  const args = {
    ack: async () => {},
    body: { trigger_id: 'T1', user: { id: 'U1' }, actions: [action] },
    context: { userId: 'U1' },
    client: {
      views: { open: async (v) => opened.push(v), publish: async (v) => published.push(v) },
    },
    logger: { info: () => {}, error: () => {} },
  };
  return { args, opened, published };
}

test('＋ Watch opens the add-watch modal listing subscribed channels', async () => {
  const { args, opened } = boltArgs({ action_id: 'home_add_watch' });
  await makeHomeAddWatch(makeDeps())(args);
  assert.equal(opened[0].trigger_id, 'T1');
  assert.equal(opened[0].view.callback_id, 'home_add_watch_modal');
  assert.ok(JSON.stringify(opened[0].view).includes('#general'));
});

test('Edit opens the config modal pre-filled from Convex with the channelId in metadata', async () => {
  const { args, opened } = boltArgs({ action_id: 'home_edit_channel', value: 'C1' });
  await makeHomeEditChannel(makeDeps())(args);
  assert.equal(opened[0].view.callback_id, 'home_channel_config_modal');
  assert.equal(opened[0].view.private_metadata, 'C1');
  const all = JSON.stringify(opened[0].view);
  assert.ok(all.includes('LICENSES COMMITTEE'));
  assert.ok(all.includes('rezoning'));
});

test('overflow remove parses the value, removes the watch, and re-publishes the Home', async () => {
  const removed = [];
  const deps = makeDeps({ removeWatch: async (input) => removed.push(input) });
  const { args, published } = boltArgs({
    action_id: 'home_watch_remove',
    selected_option: { value: JSON.stringify({ channelId: 'C1', entity: 'Punta Cana LLC' }) },
  });
  await makeHomeWatchRemove(deps)(args);
  assert.deepEqual(removed, [{ channelId: 'C1', entity: 'Punta Cana LLC' }]);
  assert.equal(published.length, 1);
  assert.equal(published[0].user_id, 'U1');
});

test('committee options filters by query and acks options', async () => {
  const acks = [];
  const handler = makeCommitteeOptions(makeDeps());
  await handler({ ack: async (r) => acks.push(r), options: { value: 'zon' }, logger: { error: () => {} } });
  assert.equal(acks[0].options.length, 1);
  assert.match(acks[0].options[0].value, /ZONING/);
});

test('committee options failure acks an empty list instead of throwing', async () => {
  const acks = [];
  const handler = makeCommitteeOptions(
    makeDeps({
      listCommitteeNames: async () => {
        throw new Error('legistar down');
      },
    }),
  );
  await handler({ ack: async (r) => acks.push(r), options: { value: '' }, logger: { error: () => {} } });
  assert.deepEqual(acks[0], { options: [] });
});

test('button failures log and never throw', async () => {
  const deps = makeDeps({
    listSubscriptions: async () => {
      throw new Error('convex down');
    },
    getSubscription: async () => {
      throw new Error('convex down');
    },
  });
  const a = boltArgs({ action_id: 'home_add_watch' });
  const b = boltArgs({ action_id: 'home_edit_channel', value: 'C1' });
  await makeHomeAddWatch(deps)(a.args);
  await makeHomeEditChannel(deps)(b.args);
  assert.equal(a.opened.length, 0);
  assert.equal(b.opened.length, 0);
});

test('makeDiscoverWatch opens the add-watch modal pre-filled with the clicked item', async () => {
  let opened;
  const deps = {
    listSubscriptions: async () => [{ channelId: 'C1' }],
    getChannelName: async () => 'general',
  };
  const client = {
    views: {
      open: async (a) => {
        opened = a;
      },
    },
  };
  await makeDiscoverWatch(deps)({
    ack: async () => {},
    body: { trigger_id: 'T1', actions: [{ value: 'A resolution authorizing $4.2 million in bonding' }] },
    client,
    logger: { error() {} },
  });
  assert.equal(opened.view.callback_id, 'home_add_watch_modal');
  const entity = opened.view.blocks.find((b) => b.block_id === 'watch_entity');
  assert.equal(entity.element.initial_value, 'A resolution authorizing $4.2 million in bonding');
});
