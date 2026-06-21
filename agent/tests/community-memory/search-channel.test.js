import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import { searchChannel } from '../../agent/community-memory/search-channel.js';

const msg = (over = {}) => ({
  channel_id: 'C1',
  message_ts: '1750000000.000',
  author_user_id: 'U1',
  is_author_bot: false,
  content: 'discussion text',
  ...over,
});

// One fetch mock that answers EN then ES (two RTS calls per searchChannel).
function fetchReturning(...payloads) {
  let i = 0;
  return mock.fn(async () => ({ ok: true, status: 200, json: async () => payloads[i++] ?? payloads.at(-1) }));
}

describe('searchChannel — channel-scoped live RTS (MOO-125)', () => {
  it('fans out EN+ES, merges, and returns only messages from the target channel', async () => {
    const fetchFn = fetchReturning(
      { ok: true, results: { messages: [msg({ message_ts: '2.0' }), msg({ channel_id: 'C2', message_ts: '3.0' })] } },
      { ok: true, results: { messages: [msg({ message_ts: '4.0' })] } },
    );
    const out = await searchChannel({ queryEn: 'a', queryEs: 'b', channelId: 'C1' }, { userToken: 'xoxp', fetchFn });
    assert.equal(fetchFn.mock.callCount(), 2, 'one RTS call per language');
    assert.ok(
      out.every((m) => m.channel_id === 'C1'),
      'only the target channel survives',
    );
    assert.equal(out.length, 2);
  });

  it('returns [] when the channel has no matching discussion', async () => {
    const fetchFn = fetchReturning({ ok: true, results: { messages: [msg({ channel_id: 'C2' })] } });
    const out = await searchChannel({ queryEn: 'a', queryEs: 'b', channelId: 'C1' }, { userToken: 'xoxp', fetchFn });
    assert.deepEqual(out, []);
  });

  it('returns [] (never throws) when RTS is disabled', async () => {
    const fetchFn = mock.fn();
    const out = await searchChannel(
      { queryEn: 'a', queryEs: 'b', channelId: 'C1' },
      { userToken: 'xoxp', fetchFn, env: { GAVEL_DISABLE_RTS: '1' } },
    );
    assert.deepEqual(out, []);
    assert.equal(fetchFn.mock.callCount(), 0);
  });

  it('returns [] when both RTS calls error (degrade, never throw)', async () => {
    const fetchFn = mock.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }));
    const out = await searchChannel({ queryEn: 'a', queryEs: 'b', channelId: 'C1' }, { userToken: 'xoxp', fetchFn });
    assert.deepEqual(out, []);
  });
});
