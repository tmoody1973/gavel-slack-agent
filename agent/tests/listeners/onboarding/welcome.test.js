import assert from 'node:assert';
import { describe, it } from 'node:test';

import { makeAskGavel, makeMemberJoined, makeWhatCanYouDo } from '../../../listeners/onboarding/welcome.js';

const noop = () => {};
const logger = { error: noop, info: noop };

describe('makeMemberJoined', () => {
  function setup(markResult) {
    const posts = [];
    let markedChannel;
    const deps = {
      markWelcomePosted: async (channelId) => {
        markedChannel = channelId;
        return markResult;
      },
    };
    const client = { chat: { postMessage: async (args) => posts.push(args) } };
    return { posts, deps, client, getMarked: () => markedChannel };
  }

  it('posts the welcome once when the channel claims the welcome (posted:true)', async () => {
    const { posts, deps, client } = setup({ posted: true, language: 'es' });
    await makeMemberJoined(deps)({
      event: { channel: 'C1', user: 'U_human' },
      context: { botUserId: 'B_gavel' },
      client,
      logger,
    });
    assert.equal(posts.length, 1);
    assert.equal(posts[0].channel, 'C1');
    assert.match(JSON.stringify(posts[0].blocks), /Vigilo el ayuntamiento/); // ES welcome
  });

  it('stays silent when the channel already posted / is unconfigured (posted:false)', async () => {
    const { posts, deps, client } = setup({ posted: false, reason: 'already_posted' });
    await makeMemberJoined(deps)({
      event: { channel: 'C1', user: 'U_human' },
      context: { botUserId: 'B_gavel' },
      client,
      logger,
    });
    assert.equal(posts.length, 0);
  });

  it('skips Gavel’s own join without even touching the dedup mutation', async () => {
    const { posts, deps, client, getMarked } = setup({ posted: true, language: 'en' });
    await makeMemberJoined(deps)({
      event: { channel: 'C1', user: 'B_gavel' },
      context: { botUserId: 'B_gavel' },
      client,
      logger,
    });
    assert.equal(posts.length, 0);
    assert.equal(getMarked(), undefined, 'markWelcomePosted never called for the bot join');
  });
});

describe('member welcome actions', () => {
  function actionHarness(value) {
    const posts = [];
    const client = { chat: { postMessage: async (args) => posts.push(args) } };
    const args = {
      ack: async () => {},
      body: { channel: { id: 'C1' }, message: { ts: '111.222' } },
      action: { value },
      client,
      logger,
    };
    return { posts, args };
  }

  it('What can you do? replies in-thread with a transcript example (EN)', async () => {
    const { posts, args } = actionHarness('en');
    await makeWhatCanYouDo()(args);
    assert.equal(posts[0].thread_ts, '111.222');
    assert.match(posts[0].text, /Hopkins Street/);
  });

  it('Ask Gavel opens the thread in the channel language (ES)', async () => {
    const { posts, args } = actionHarness('es');
    await makeAskGavel()(args);
    assert.equal(posts[0].thread_ts, '111.222');
    assert.match(posts[0].text, /Hopkins Street/);
    assert.match(posts[0].text, /Vigilo el ayuntamiento/);
  });
});
