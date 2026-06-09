import assert from 'node:assert';
import { describe, it, mock } from 'node:test';

import { runCommunitySearch } from '../../agent/community-memory/search.js';

function message(overrides = {}) {
  return {
    channel_id: 'C001',
    message_ts: '1710000000.000100',
    author_user_id: 'U001',
    is_author_bot: false,
    content: 'prior discussion about the developer',
    permalink: 'https://example.slack.com/archives/C001/p1710000000000100',
    ...overrides,
  };
}

function fetchReturning(payload) {
  return mock.fn(async () => ({ ok: true, status: 200, json: async () => payload }));
}

const QUERIES = { queryEn: 'developer history', queryEs: 'historial del desarrollador' };

describe('runCommunitySearch', () => {
  it('issues one RTS call per language', async () => {
    const fetchFn = fetchReturning({ ok: true, results: { messages: [] } });
    await runCommunitySearch(QUERIES, { userToken: 'xoxp-test', fetchFn, env: {} });

    assert.strictEqual(fetchFn.mock.callCount(), 2);
    const sentQueries = fetchFn.mock.calls.map((c) => c.arguments[1].body.get('query'));
    assert.deepStrictEqual(sentQueries.sort(), ['developer history', 'historial del desarrollador']);
  });

  it('merges and dedupes results across languages', async () => {
    const shared = message();
    const fetchFn = fetchReturning({ ok: true, results: { messages: [shared] } });
    const text = await runCommunitySearch(QUERIES, { userToken: 'xoxp-test', fetchFn, env: {} });
    assert.match(text, /Found 1 prior community message/);
  });

  it('reports no results in plain language', async () => {
    const fetchFn = fetchReturning({ ok: true, results: { messages: [] } });
    const text = await runCommunitySearch(QUERIES, { userToken: 'xoxp-test', fetchFn, env: {} });
    assert.match(text, /No prior community discussion/);
  });

  it('instructs the slack-mcp fallback when RTS is blocked', async () => {
    const fetchFn = fetchReturning({ ok: false, error: 'missing_scope' });
    const text = await runCommunitySearch(QUERIES, { userToken: 'xoxp-test', fetchFn, env: {} });
    assert.match(text, /Real-Time Search is unavailable/);
    assert.match(text, /missing_scope/);
    assert.match(text, /slack-mcp/);
  });

  it('instructs the fallback when fetch throws', async () => {
    const fetchFn = mock.fn(async () => {
      throw new Error('network down');
    });
    const text = await runCommunitySearch(QUERIES, { userToken: 'xoxp-test', fetchFn, env: {} });
    assert.match(text, /Real-Time Search is unavailable/);
    assert.match(text, /slack-mcp/);
  });

  it('forces the fallback when GAVEL_DISABLE_RTS=1, without calling RTS', async () => {
    const fetchFn = fetchReturning({ ok: true, results: { messages: [message()] } });
    const text = await runCommunitySearch(QUERIES, {
      userToken: 'xoxp-test',
      fetchFn,
      env: { GAVEL_DISABLE_RTS: '1' },
    });
    assert.match(text, /Real-Time Search is unavailable/);
    assert.strictEqual(fetchFn.mock.callCount(), 0);
  });

  it('returns the successful side with a note when one language fails', async () => {
    let call = 0;
    const fetchFn = mock.fn(async () => {
      call += 1;
      const payload =
        call === 1 ? { ok: true, results: { messages: [message()] } } : { ok: false, error: 'internal_error' };
      return { ok: true, status: 200, json: async () => payload };
    });
    const text = await runCommunitySearch(QUERIES, { userToken: 'xoxp-test', fetchFn, env: {} });
    assert.match(text, /Found 1 prior community message/);
    assert.match(text, /only one of the two language searches succeeded/i);
  });
});
