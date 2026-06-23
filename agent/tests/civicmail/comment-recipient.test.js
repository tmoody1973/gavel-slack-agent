import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveCommentRecipient } from '../../civicmail/comment-recipient.js';

describe('resolveCommentRecipient — where a public comment is sent (guardrail-critical)', () => {
  it('demo/test inbox OVERRIDES everything (a recording must never reach a real clerk)', () => {
    const r = resolveCommentRecipient({
      testInbox: 'demo@example.com',
      contactEmail: 'realclerk@milwaukee.gov',
      bodyName: 'CITY PLAN COMMISSION',
      bodyDirectory: { 'CITY PLAN COMMISSION': 'plan@milwaukee.gov' },
    });
    assert.equal(r.recipient, 'demo@example.com');
    assert.equal(r.demoMode, true);
    assert.equal(r.canSend, true);
  });

  it('uses the per-item contact email when present (no test inbox)', () => {
    const r = resolveCommentRecipient({ contactEmail: 'racminfo@milwaukee.gov', bodyName: 'CITY PLAN COMMISSION' });
    assert.equal(r.recipient, 'racminfo@milwaukee.gov');
    assert.equal(r.demoMode, false);
    assert.equal(r.canSend, true);
    assert.equal(r.source, 'item-contact');
  });

  it('falls back to the per-body directory when there is no item contact', () => {
    const r = resolveCommentRecipient({
      bodyName: 'CITY PLAN COMMISSION',
      bodyDirectory: { 'CITY PLAN COMMISSION': 'plan@milwaukee.gov' },
    });
    assert.equal(r.recipient, 'plan@milwaukee.gov');
    assert.equal(r.canSend, true);
    assert.equal(r.source, 'body-directory');
  });

  it('degrades SAFE: no recipient resolvable and not demo mode → does NOT send', () => {
    const r = resolveCommentRecipient({ bodyName: 'UNKNOWN BODY', bodyDirectory: {} });
    assert.equal(r.recipient, null);
    assert.equal(r.canSend, false);
    assert.match(r.reason, /manual|no recipient|unresolved/i);
  });

  it('body directory match is case/whitespace tolerant', () => {
    const r = resolveCommentRecipient({
      bodyName: '  city plan commission ',
      bodyDirectory: { 'CITY PLAN COMMISSION': 'plan@milwaukee.gov' },
    });
    assert.equal(r.recipient, 'plan@milwaukee.gov');
    assert.equal(r.canSend, true);
  });

  it('ignores a malformed item contact (not an email) and falls through', () => {
    const r = resolveCommentRecipient({
      contactEmail: 'see the website',
      bodyName: 'CITY PLAN COMMISSION',
      bodyDirectory: { 'CITY PLAN COMMISSION': 'plan@milwaukee.gov' },
    });
    assert.equal(r.recipient, 'plan@milwaukee.gov');
    assert.equal(r.source, 'body-directory');
  });
});
