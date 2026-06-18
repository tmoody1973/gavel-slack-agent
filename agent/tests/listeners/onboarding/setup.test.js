import assert from 'node:assert';
import { describe, it } from 'node:test';

import { makeGoLiveSubmit, makeOpenConfirmModal, makeOpenRoleModal } from '../../../listeners/onboarding/setup.js';

const noop = () => {};
const logger = { error: noop, info: noop };

/** Minimal deps so publishHome (called inside Go-live) can assemble + publish. */
function homeDeps(overrides = {}) {
  return {
    upsertSubscription: async () => {},
    listSubscriptions: async () => [],
    listAllWatches: async () => [],
    listUpcoming: async () => [],
    getChannelName: async (id) => id,
    ...overrides,
  };
}

describe('makeOpenRoleModal', () => {
  it('opens the role modal and threads the channel id into private_metadata', async () => {
    let opened;
    const client = {
      views: {
        open: async (args) => {
          opened = args;
        },
      },
    };
    await makeOpenRoleModal(homeDeps())({
      ack: async () => {},
      body: { trigger_id: 'T1', channel: { id: 'C1' } },
      client,
      logger,
    });
    assert.equal(opened.trigger_id, 'T1');
    assert.equal(opened.view.callback_id, 'onboarding_role_modal');
    assert.equal(JSON.parse(opened.view.private_metadata).channelId, 'C1');
  });

  it('carries a null channel when opened from the App Home (no channel context)', async () => {
    let opened;
    const client = {
      views: {
        open: async (args) => {
          opened = args;
        },
      },
    };
    await makeOpenRoleModal(homeDeps())({ ack: async () => {}, body: { trigger_id: 'T1' }, client, logger });
    assert.equal(JSON.parse(opened.view.private_metadata).channelId, null);
  });
});

describe('makeOpenConfirmModal', () => {
  it('pushes a confirm view pre-filled for the picked role + channel', async () => {
    let pushed;
    const client = {
      views: {
        push: async (args) => {
          pushed = args;
        },
      },
    };
    await makeOpenConfirmModal(homeDeps())({
      ack: async () => {},
      body: { trigger_id: 'T2', view: { private_metadata: JSON.stringify({ channelId: 'C1' }) } },
      action: { value: 'organizer' },
      client,
      logger,
    });
    assert.equal(pushed.view.callback_id, 'onboarding_confirm_modal');
    assert.match(JSON.stringify(pushed.view), /LICENSES COMMITTEE/); // organizer default
    const meta = JSON.parse(pushed.view.private_metadata);
    assert.equal(meta.role, 'organizer');
    assert.equal(meta.channelId, 'C1');
  });

  it('silently swallows a forged unknown role — logs, never pushes a view', async () => {
    const pushed = [];
    const client = { views: { push: async (a) => pushed.push(a) } };
    await makeOpenConfirmModal(homeDeps())({
      ack: async () => {},
      body: { trigger_id: 'T', view: { private_metadata: JSON.stringify({ channelId: 'C1' }) } },
      action: { value: 'mayor' },
      client,
      logger,
    });
    assert.equal(pushed.length, 0);
  });
});

describe('makeGoLiveSubmit', () => {
  const baseMeta = (channelId) =>
    JSON.stringify({
      role: 'association',
      defaults: { committees: ['LICENSES COMMITTEE'], keywords: [], language: 'en' },
      channelId,
    });

  it('writes subscription+role+configured, republishes Home, posts confirmation', async () => {
    const calls = { upsert: null, posted: null, published: false };
    const deps = homeDeps({
      upsertSubscription: async (input) => {
        calls.upsert = input;
      },
    });
    const client = {
      chat: {
        postMessage: async (args) => {
          calls.posted = args;
        },
      },
      views: {
        publish: async () => {
          calls.published = true;
        },
      },
    };
    await makeGoLiveSubmit(deps)({
      ack: async () => {},
      body: { user: { id: 'U1' } },
      view: { private_metadata: baseMeta('C1'), state: { values: {} } },
      client,
      logger,
    });
    assert.equal(calls.upsert.channelId, 'C1');
    assert.equal(calls.upsert.role, 'association');
    assert.equal(calls.upsert.configured, true);
    assert.equal(typeof calls.upsert.onboardedAt, 'number');
    assert.deepStrictEqual(calls.upsert.committees, ['LICENSES COMMITTEE']);
    assert.equal(calls.posted.channel, 'C1');
    assert.ok(calls.published, 'Home republished after the write');
  });

  it('an organizer also gets the per-area growth proposal posted (FD-D)', async () => {
    const posts = [];
    const deps = homeDeps();
    const client = {
      chat: { postMessage: async (args) => posts.push(args) },
      views: { publish: async () => {} },
    };
    const organizerMeta = JSON.stringify({
      role: 'organizer',
      defaults: { committees: ['LICENSES COMMITTEE'], keywords: ['permit'], language: 'es' },
      channelId: 'C1',
    });
    await makeGoLiveSubmit(deps)({
      ack: async () => {},
      body: { user: { id: 'U1' } },
      view: { private_metadata: organizerMeta, state: { values: {} } },
      client,
      logger,
    });
    // first post = live confirmation, second = the per-area proposal
    assert.equal(posts.length, 2);
    assert.match(JSON.stringify(posts[1].blocks), /#civic-/);
  });

  it('prefers the picker-selected channel over the metadata channel', async () => {
    let upsert;
    const deps = homeDeps({
      upsertSubscription: async (input) => {
        upsert = input;
      },
    });
    const client = { chat: { postMessage: async () => {} }, views: { publish: async () => {} } };
    await makeGoLiveSubmit(deps)({
      ack: async () => {},
      body: { user: { id: 'U1' } },
      view: {
        private_metadata: baseMeta('C1'),
        state: { values: { onboarding_channel: { onboarding_channel_select: { selected_conversation: 'C2' } } } },
      },
      client,
      logger,
    });
    assert.equal(upsert.channelId, 'C2');
  });

  it('acks with a validation error (never crashes) on malformed private_metadata', async () => {
    let acked;
    let wrote = false;
    const deps = homeDeps({
      upsertSubscription: async () => {
        wrote = true;
      },
    });
    await makeGoLiveSubmit(deps)({
      ack: async (arg) => {
        acked = arg;
      },
      body: { user: { id: 'U1' } },
      view: { private_metadata: 'not-json', state: { values: {} } },
      client: {},
      logger,
    });
    assert.equal(acked.response_action, 'errors');
    assert.ok(acked.errors.onboarding_channel);
    assert.equal(wrote, false);
  });

  it('returns a validation error (never writes) when no channel can be resolved', async () => {
    let acked;
    let wrote = false;
    const deps = homeDeps({
      upsertSubscription: async () => {
        wrote = true;
      },
    });
    await makeGoLiveSubmit(deps)({
      ack: async (arg) => {
        acked = arg;
      },
      body: { user: { id: 'U1' } },
      view: { private_metadata: baseMeta(null), state: { values: {} } },
      client: {},
      logger,
    });
    assert.equal(acked.response_action, 'errors');
    assert.ok(acked.errors.onboarding_channel);
    assert.equal(wrote, false);
  });

  it('falls back to a DM when posting the confirmation to the channel is blocked', async () => {
    const posts = [];
    const deps = homeDeps();
    const client = {
      chat: {
        postMessage: async (args) => {
          if (args.channel === 'C1') throw new Error('not_in_channel');
          posts.push(args);
        },
      },
      views: { publish: async () => {} },
    };
    await makeGoLiveSubmit(deps)({
      ack: async () => {},
      body: { user: { id: 'U1' } },
      view: { private_metadata: baseMeta('C1'), state: { values: {} } },
      client,
      logger,
    });
    assert.equal(posts.length, 1);
    assert.equal(posts[0].channel, 'U1', 'DM fallback goes to the installer');
    assert.match(posts[0].text, /invite @Gavel/);
  });

  it('is idempotent — a second identical submit updates without throwing', async () => {
    const deps = homeDeps(); // upsertSubscription is upsert-by-channel
    const client = { chat: { postMessage: async () => {} }, views: { publish: async () => {} } };
    const run = () =>
      makeGoLiveSubmit(deps)({
        ack: async () => {},
        body: { user: { id: 'U1' } },
        view: { private_metadata: baseMeta('C1'), state: { values: {} } },
        client,
        logger,
      });
    await run();
    await assert.doesNotReject(run());
  });
});
