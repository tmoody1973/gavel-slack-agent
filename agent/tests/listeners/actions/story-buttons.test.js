import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  makeStoryAsk,
  makeStoryBrowse,
  makeStoryLeadOverflow,
  makeStoryModalFilter,
} from '../../../listeners/actions/story-buttons.js';
import { primeStore } from '../../../thread-context/index.js';

const newsworthyRow = (over = {}) => ({
  eventItemId: 7,
  eventId: 100,
  matterId: 555,
  title: 'An ordinance creating a police surveillance oversight board',
  eventBodyName: 'COMMON COUNCIL',
  eventDate: '2026-06-23',
  ...over,
});

function makeDeps(overrides = {}) {
  return {
    listSubscriptions: async () => [{ channelId: 'C1', role: 'reporter', language: 'en' }],
    listUpcoming: async () => [newsworthyRow()],
    getChannelName: async () => 'general',
    getDetectedItem: async () => newsworthyRow(),
    getMatter: async () => ({ fileNumber: '230001' }),
    ...overrides,
  };
}

function client() {
  const opened = [];
  const updated = [];
  const pushed = [];
  const dmsOpened = [];
  const posted = [];
  const ephemerals = [];
  return {
    calls: { opened, updated, pushed, dmsOpened, posted, ephemerals },
    views: {
      open: async (v) => opened.push(v),
      update: async (v) => updated.push(v),
      push: async (v) => pushed.push(v),
    },
    conversations: {
      open: async (a) => {
        dmsOpened.push(a);
        return { channel: { id: 'D1' } };
      },
    },
    chat: {
      postMessage: async (m) => {
        posted.push(m);
        return { ts: '111.222' };
      },
      postEphemeral: async (m) => ephemerals.push(m),
    },
  };
}

const logger = { info: () => {}, error: () => {} };

test('makeStoryBrowse opens the filterable modal via trigger_id', async () => {
  const c = client();
  await makeStoryBrowse(makeDeps())({ ack: async () => {}, body: { trigger_id: 'T1' }, client: c, logger });
  assert.equal(c.calls.opened.length, 1);
  assert.equal(c.calls.opened[0].trigger_id, 'T1');
  assert.equal(c.calls.opened[0].view.callback_id, 'story_browse_modal');
});

test('makeStoryModalFilter re-renders the modal for the chosen filter via views.update', async () => {
  const c = client();
  await makeStoryModalFilter(makeDeps())({
    ack: async () => {},
    body: {
      view: { id: 'V1', private_metadata: JSON.stringify({ language: 'en', filter: 'all' }) },
      actions: [{ selected_option: { value: 'c::COMMON COUNCIL' } }],
    },
    client: c,
    logger,
  });
  assert.equal(c.calls.updated.length, 1);
  assert.equal(c.calls.updated[0].view_id, 'V1');
  const select = c.calls.updated[0].view.blocks
    .flatMap((b) => b.elements ?? [])
    .find((e) => e.action_id === 'story_modal_filter');
  assert.equal(select.initial_option?.value, 'c::COMMON COUNCIL');
});

test('overflow "Watch" pushes the pre-filled add-watch modal onto the stack', async () => {
  const c = client();
  await makeStoryLeadOverflow(makeDeps())({
    ack: async () => {},
    body: { trigger_id: 'T2', actions: [{ selected_option: { value: 'w::7' } }] },
    context: { userId: 'U1' },
    client: c,
    logger,
  });
  assert.equal(c.calls.pushed.length, 1);
  assert.equal(c.calls.pushed[0].view.callback_id, 'home_add_watch_modal');
  const entity = c.calls.pushed[0].view.blocks.find((b) => b.block_id === 'watch_entity');
  assert.match(entity.element.initial_value, /surveillance oversight board/);
});

test('overflow "Ask Gavel" opens a primed DM seeded with the item context', async () => {
  const c = client();
  await makeStoryLeadOverflow(makeDeps())({
    ack: async () => {},
    body: { trigger_id: 'T3', actions: [{ selected_option: { value: 'a::7' } }] },
    context: { userId: 'U9' },
    client: c,
    logger,
  });
  assert.deepEqual(c.calls.dmsOpened[0], { users: 'U9' });
  assert.equal(c.calls.posted[0].channel, 'D1');
  const prime = primeStore.getSession('D1', '111.222');
  assert.match(prime, /surveillance oversight board/);
  assert.match(prime, /File #230001/);
  assert.match(prime, /COMMON COUNCIL/);
  // from a modal there's no channel to post an ephemeral into — DM is the only feedback
  assert.equal(c.calls.ephemerals.length, 0);
});

test('carousel "Ask Gavel" button (story_ask) opens the DM AND nudges at the click site', async () => {
  const c = client();
  await makeStoryAsk(makeDeps())({
    ack: async () => {},
    body: { actions: [{ value: '7' }], user: { id: 'U2' }, channel: { id: 'C_CAROUSEL' } },
    context: { userId: 'U2' },
    client: c,
    logger,
  });
  assert.deepEqual(c.calls.dmsOpened[0], { users: 'U2' });
  const prime = primeStore.getSession('D1', '111.222');
  assert.match(prime, /surveillance oversight board/);
  // the fix: a visible ephemeral confirmation in the channel where the user clicked
  assert.equal(c.calls.ephemerals.length, 1);
  assert.equal(c.calls.ephemerals[0].channel, 'C_CAROUSEL');
  assert.equal(c.calls.ephemerals[0].user, 'U2');
  assert.match(c.calls.ephemerals[0].text, /opened a DM|check your messages/i);
});

test('handlers never throw on failure — they log and ack', async () => {
  const c = client();
  const deps = makeDeps({
    listUpcoming: async () => {
      throw new Error('convex down');
    },
  });
  let acked = false;
  await makeStoryBrowse(deps)({ ack: async () => (acked = true), body: { trigger_id: 'T' }, client: c, logger });
  assert.equal(acked, true);
  assert.equal(c.calls.opened.length, 0);
});
