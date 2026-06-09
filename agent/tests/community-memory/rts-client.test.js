import assert from 'node:assert';
import { describe, it, mock } from 'node:test';

import { searchRts } from '../../agent/community-memory/rts-client.js';

function fakeFetch(payload) {
  return mock.fn(async () => ({ json: async () => payload }));
}

describe('searchRts', () => {
  it('POSTs the query with the user token and required params', async () => {
    const fetchFn = fakeFetch({ ok: true, results: { messages: [] } });
    await searchRts('rezoning on 27th street', { userToken: 'xoxp-test', fetchFn });

    assert.strictEqual(fetchFn.mock.callCount(), 1);
    const [url, init] = fetchFn.mock.calls[0].arguments;
    assert.strictEqual(url, 'https://slack.com/api/assistant.search.context');
    assert.strictEqual(init.method, 'POST');
    assert.strictEqual(init.headers.Authorization, 'Bearer xoxp-test');
    const body = init.body;
    assert.strictEqual(body.get('query'), 'rezoning on 27th street');
    assert.strictEqual(body.get('content_types'), 'messages');
    assert.strictEqual(body.get('channel_types'), 'public_channel');
    assert.strictEqual(body.get('limit'), '5');
  });

  it('returns ok with extracted messages on success', async () => {
    const messages = [{ channel_id: 'C1', message_ts: '1.2' }];
    const fetchFn = fakeFetch({ ok: true, results: { messages } });
    const result = await searchRts('q', { userToken: 'xoxp-test', fetchFn });
    assert.deepStrictEqual(result, { ok: true, error: null, messages });
  });

  it('defaults to an empty message list when results are missing', async () => {
    const fetchFn = fakeFetch({ ok: true });
    const result = await searchRts('q', { userToken: 'xoxp-test', fetchFn });
    assert.deepStrictEqual(result.messages, []);
  });

  it('returns ok:false with the Slack error code when blocked', async () => {
    const fetchFn = fakeFetch({ ok: false, error: 'missing_scope' });
    const result = await searchRts('q', { userToken: 'xoxp-test', fetchFn });
    assert.deepStrictEqual(result, { ok: false, error: 'missing_scope', messages: [] });
  });

  it('falls back to unknown_error when Slack omits the error code', async () => {
    const fetchFn = fakeFetch({ ok: false });
    const result = await searchRts('q', { userToken: 'xoxp-test', fetchFn });
    assert.strictEqual(result.error, 'unknown_error');
  });
});
