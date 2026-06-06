import assert from 'node:assert';
import { describe, it } from 'node:test';

import { normalizeSubscription } from '../../subscriptions/normalize.js';

const base = { channelId: 'C0123', committees: ['Zoning'], keywords: ['rezoning'] };

describe('normalizeSubscription', () => {
  it('defaults language to en when omitted', () => {
    assert.strictEqual(normalizeSubscription(base).language, 'en');
  });

  it('keeps es and coerces any other language value to en', () => {
    assert.strictEqual(normalizeSubscription({ ...base, language: 'es' }).language, 'es');
    assert.strictEqual(normalizeSubscription({ ...base, language: 'fr' }).language, 'en');
    assert.strictEqual(normalizeSubscription({ ...base, language: 'EN' }).language, 'en');
  });

  it('throws when channelId is missing or empty', () => {
    assert.throws(() => normalizeSubscription({ committees: ['Zoning'] }), /channelId/);
    assert.throws(() => normalizeSubscription({ ...base, channelId: '  ' }), /channelId/);
  });

  it('defaults client to milwaukee and keeps milwaukeecounty', () => {
    assert.strictEqual(normalizeSubscription(base).client, 'milwaukee');
    assert.strictEqual(normalizeSubscription({ ...base, client: 'milwaukeecounty' }).client, 'milwaukeecounty');
  });

  it('throws on an unrecognized client', () => {
    assert.throws(() => normalizeSubscription({ ...base, client: 'chicago' }), /client/);
  });

  it('trims, drops empties, and dedups committees and keywords', () => {
    const result = normalizeSubscription({
      channelId: 'C0123',
      committees: ['Zoning', ' Zoning ', '', '  ', 'Public Safety'],
      keywords: ['rezoning', 'rezoning', ' demolition '],
    });
    assert.deepStrictEqual(result.committees, ['Zoning', 'Public Safety']);
    assert.deepStrictEqual(result.keywords, ['rezoning', 'demolition']);
  });

  it('strips any field outside the minimal-PII whitelist', () => {
    const result = normalizeSubscription({
      ...base,
      userId: 'U999',
      messageText: 'a private slack message',
      authorEmail: 'someone@example.com',
    });
    assert.deepStrictEqual(Object.keys(result).sort(), ['channelId', 'client', 'committees', 'keywords', 'language']);
  });

  it('passes through a valid district boundary and omits it when absent', () => {
    const withBoundary = normalizeSubscription({ ...base, boundary: { type: 'district', value: '12' } });
    assert.deepStrictEqual(withBoundary.boundary, { type: 'district', value: '12' });
    assert.ok(!('boundary' in normalizeSubscription(base)), 'boundary should be omitted when not provided');
  });
});
