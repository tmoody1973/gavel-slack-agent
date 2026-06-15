import assert from 'node:assert';
import { describe, it } from 'node:test';

import { SANDBOX_CHANNELS } from '../../sandbox/corpus.js';
import { assertCorpusInvariants } from '../../sandbox/plan.js';

// A Slack user id is "U" + >=8 base-32-ish chars; this loose pattern guards
// against any user identity leaking into the staged corpus (minimal-PII rule).
const SLACK_USER_ID = /\bU[A-Z0-9]{6,}\b/;
const CONTENT_DATE = /^[A-Z][a-z]{2} \d{4}$/;

function allMessages(channel) {
  return [...(channel.messages ?? []), ...(channel.thread?.messages ?? [])];
}

describe('SANDBOX_CHANNELS corpus', () => {
  it('passes every corpus invariant', () => {
    assert.doesNotThrow(() => assertCorpusInvariants(SANDBOX_CHANNELS));
  });

  it('has exactly 3 channels', () => {
    assert.strictEqual(SANDBOX_CHANNELS.length, 3);
  });

  it('has at least one Spanish channel', () => {
    assert.ok(SANDBOX_CHANNELS.some((c) => c.language === 'es'));
  });

  it('gives every channel a valid district boundary', () => {
    for (const c of SANDBOX_CHANNELS) {
      assert.strictEqual(c.boundary.type, 'district');
      assert.ok(String(c.boundary.value).trim().length > 0, `empty boundary on ${c.name}`);
    }
  });

  it('gives every channel committees and keywords', () => {
    for (const c of SANDBOX_CHANNELS) {
      assert.ok(c.committees.length > 0, `no committees on ${c.name}`);
      assert.ok(c.keywords.length > 0, `no keywords on ${c.name}`);
    }
  });

  it('never embeds a Slack user id', () => {
    for (const c of SANDBOX_CHANNELS) {
      for (const m of allMessages(c)) {
        assert.ok(!SLACK_USER_ID.test(m.text), `user-id-like token on ${c.name}: ${m.text}`);
      }
    }
  });

  it('content-dates every message as "Mon YYYY"', () => {
    for (const c of SANDBOX_CHANNELS) {
      for (const m of allMessages(c)) {
        assert.match(m.date, CONTENT_DATE, `bad date on ${c.name}: ${m.date}`);
      }
    }
  });

  it('anchors exactly one developer/LLC thread on Punta Cana / 2000 S 13th St in an es channel', () => {
    const threaded = SANDBOX_CHANNELS.filter((c) => c.thread);
    assert.strictEqual(threaded.length, 1, 'exactly one anchored thread');
    const ch = threaded[0];
    assert.strictEqual(ch.language, 'es', 'anchor thread lives in the Spanish channel');
    assert.ok(ch.thread.messages.length >= 2, 'a thread needs a parent + at least one reply');
    const blob = ch.thread.messages.map((m) => m.text).join(' ');
    assert.match(blob, /Punta Cana/);
    assert.match(blob, /2000 S 13th/);
  });
});
