import assert from 'node:assert';
import { describe, it } from 'node:test';

import { makeGoLiveSubmit, makeOpenConfirmModal, makeOpenRoleModal } from '../../../listeners/onboarding/setup.js';
import { committeesAndKeywordsForTopics } from '../../../onboarding/topics.js';

const noop = () => {};
const logger = { error: noop, info: noop };

/** Minimal deps so publishHome (called inside Go-live) can assemble + publish.
 * getSubscription defaults to an already-configured channel so the MOO-122 sample
 * alert (first-configure only) is skipped unless a test opts in (overrides it to
 * null = brand-new channel). */
function homeDeps(overrides = {}) {
  return {
    upsertSubscription: async () => {},
    listSubscriptions: async () => [],
    listAllWatches: async () => [],
    listUpcoming: async () => [],
    getSubscription: async () => ({ channelId: 'C1', configured: true }),
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

  it('writes the union of the SELECTED topic chips, not the raw metadata defaults (MOO-121)', async () => {
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
        // metadata defaults are LICENSES, but the user checked streets + safety
        private_metadata: baseMeta('C1'),
        state: {
          values: {
            onboarding_topics_block: {
              onboarding_topics: { selected_options: [{ value: 'streets' }, { value: 'safety' }] },
            },
          },
        },
      },
      client,
      logger,
    });
    const expected = committeesAndKeywordsForTopics(['streets', 'safety']);
    assert.deepStrictEqual(upsert.committees, expected.committees);
    assert.deepStrictEqual(upsert.keywords, expected.keywords);
    assert.ok(!upsert.committees.includes('LICENSES COMMITTEE'), 'deselected default dropped');
  });

  it('falls back to the metadata defaults when the topics block is absent (older modal)', async () => {
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
      view: { private_metadata: baseMeta('C1'), state: { values: {} } },
      client,
      logger,
    });
    assert.deepStrictEqual(upsert.committees, ['LICENSES COMMITTEE']);
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

describe('makeGoLiveSubmit — "show, don\'t tell" sample alert (MOO-122)', () => {
  const meta = (committees, keywords = []) =>
    JSON.stringify({ role: 'association', defaults: { committees, keywords, language: 'en' }, channelId: 'C1' });

  const collectPosts = (posts) => ({
    chat: { postMessage: async (a) => posts.push(a) },
    views: { publish: async () => {} },
  });

  it('on first configure, posts a sample alert card for a matching upcoming item', async () => {
    const posts = [];
    const deps = homeDeps({
      getSubscription: async () => null, // brand-new channel
      listUpcoming: async () => [
        {
          eventItemId: 555,
          eventBodyName: 'LICENSES COMMITTEE',
          title: 'Tavern license for 123 Main',
          eventDate: '2026-06-22T00:00:00',
        },
      ],
    });
    await makeGoLiveSubmit(deps)({
      ack: async () => {},
      body: { user: { id: 'U1' } },
      view: { private_metadata: meta(['LICENSES COMMITTEE']), state: { values: {} } },
      client: collectPosts(posts),
      logger,
    });
    // post[0] = live confirmation, post[1] = the sample card
    assert.equal(posts.length, 2);
    const sample = posts[1];
    assert.match(JSON.stringify(sample.blocks), /live example from this week/);
    assert.match(JSON.stringify(sample.blocks), /Tavern license for 123 Main/);
    const actions = sample.blocks.find((b) => b.type === 'actions');
    const watch = actions.elements.find((e) => e.action_id === 'alert_watch');
    assert.equal(watch.value, '555', 'Watch button wired to the real eventItemId');
  });

  it('on first configure with no matching item, posts the graceful fallback line (never an empty card)', async () => {
    const posts = [];
    const deps = homeDeps({
      getSubscription: async () => null,
      listUpcoming: async () => [
        { eventItemId: 9, eventBodyName: 'CITY PLAN COMMISSION', title: 'Rezoning', eventDate: '2026-06-22T00:00:00' },
      ],
    });
    await makeGoLiveSubmit(deps)({
      ack: async () => {},
      body: { user: { id: 'U1' } },
      view: { private_metadata: meta(['LICENSES COMMITTEE']), state: { values: {} } },
      client: collectPosts(posts),
      logger,
    });
    assert.equal(posts.length, 2);
    assert.match(posts[1].text, /Nothing on the agenda for your topics this week/);
    assert.ok(!posts[1].blocks, 'fallback is a plain one-liner, not a card');
  });

  it('does NOT post a sample when the channel was already configured (dedup on re-run)', async () => {
    const posts = [];
    const deps = homeDeps({
      getSubscription: async () => ({ channelId: 'C1', configured: true }),
      listUpcoming: async () => [
        {
          eventItemId: 1,
          eventBodyName: 'LICENSES COMMITTEE',
          title: 'Tavern license',
          eventDate: '2026-06-22T00:00:00',
        },
      ],
    });
    await makeGoLiveSubmit(deps)({
      ack: async () => {},
      body: { user: { id: 'U1' } },
      view: { private_metadata: meta(['LICENSES COMMITTEE']), state: { values: {} } },
      client: collectPosts(posts),
      logger,
    });
    assert.equal(posts.length, 1, 'only the live confirmation — no sample on re-configure');
  });

  it('localizes the sample intro to Spanish for an ES channel', async () => {
    const posts = [];
    const deps = homeDeps({
      getSubscription: async () => null,
      listUpcoming: async () => [
        {
          eventItemId: 2,
          eventBodyName: 'LICENSES COMMITTEE',
          title: 'Tavern license',
          eventDate: '2026-06-22T00:00:00',
        },
      ],
    });
    const esMeta = JSON.stringify({
      role: 'association',
      defaults: { committees: ['LICENSES COMMITTEE'], keywords: [], language: 'es' },
      channelId: 'C1',
    });
    await makeGoLiveSubmit(deps)({
      ack: async () => {},
      body: { user: { id: 'U1' } },
      view: { private_metadata: esMeta, state: { values: {} } },
      client: collectPosts(posts),
      logger,
    });
    assert.match(JSON.stringify(posts[1].blocks), /ejemplo real de esta semana/);
  });

  it('a sample-post failure never breaks Go-live (confirmation already sent)', async () => {
    let confirmed = false;
    const deps = homeDeps({
      getSubscription: async () => null,
      listUpcoming: async () => {
        throw new Error('convex down');
      },
    });
    const client = {
      chat: {
        postMessage: async (a) => {
          if (a.text?.includes("You're live")) confirmed = true;
        },
      },
      views: { publish: async () => {} },
    };
    await assert.doesNotReject(
      makeGoLiveSubmit(deps)({
        ack: async () => {},
        body: { user: { id: 'U1' } },
        view: { private_metadata: meta(['LICENSES COMMITTEE']), state: { values: {} } },
        client,
        logger,
      }),
    );
    assert.ok(confirmed, 'live confirmation still posted despite sample failure');
  });
});
