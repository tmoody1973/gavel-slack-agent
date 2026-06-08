import assert from 'node:assert/strict';
import { test } from 'node:test';
import { processPendingAlerts } from '../../alerts/process.js';

function harness({ pending, subscriptions }) {
  const posted = [];
  const sent = [];
  const deps = {
    client: 'milwaukee',
    listPending: async () => pending,
    listSubscriptions: async () => subscriptions,
    enrich: async (row) => ({ matter: { fileNumber: `F${row.matterId}` }, event: { inSiteUrl: 'u' }, person: null }),
    generateBilingual: async () => ({
      en: { summary: 'en s', whyItMatters: 'en w' },
      es: { summary: 'es s', whyItMatters: 'es w' },
      addresses: [],
    }),
    buildFooterText: () => ({ text: 'footer' }),
    postCard: async (channel, card) => posted.push({ channel, title: card.text }),
    markSent: async (_client, eventItemId) => sent.push(eventItemId),
    logger: { error: () => {} },
  };
  return { posted, sent, deps };
}

const row = { eventItemId: 1, matterId: 70036, eventId: 13355, eventBodyName: 'ZONING', title: 'rezoning of X' };

test('posts to each matched channel and marks the row sent', async () => {
  const h = harness({ pending: [row], subscriptions: [{ channelId: 'C1', committees: ['ZONING'], keywords: [] }] });
  const out = await processPendingAlerts(h.deps);
  assert.deepEqual(
    h.posted.map((p) => p.channel),
    ['C1'],
  );
  assert.deepEqual(h.sent, [1]);
  assert.equal(out[0].posted, 1);
});

test('no matching subscription still marks sent (no audience, no reprocess)', async () => {
  const h = harness({ pending: [row], subscriptions: [{ channelId: 'C9', committees: ['LICENSES'], keywords: [] }] });
  await processPendingAlerts(h.deps);
  assert.deepEqual(h.posted, []);
  assert.deepEqual(h.sent, [1]);
});

test('an enrichment failure leaves the row pending (not marked sent)', async () => {
  const h = harness({ pending: [row], subscriptions: [] });
  h.deps.enrich = async () => {
    throw new Error('legistar down');
  };
  await processPendingAlerts(h.deps);
  assert.deepEqual(h.sent, []);
});
