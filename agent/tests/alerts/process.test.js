import assert from 'node:assert/strict';
import { test } from 'node:test';
import { processPendingAlerts } from '../../alerts/process.js';

function harness({ pending, subscriptions, person = null, members }) {
  const posted = [];
  const sent = [];
  const footerPersons = [];
  const deps = {
    client: 'milwaukee',
    listPending: async () => pending,
    listSubscriptions: async () => subscriptions,
    enrich: async (row) => ({ matter: { fileNumber: `F${row.matterId}` }, event: { inSiteUrl: 'u' }, person }),
    generateBilingual: async () => ({
      en: { summary: 'en s', whyItMatters: 'en w' },
      es: { summary: 'es s', whyItMatters: 'es w' },
      addresses: [],
    }),
    buildFooterText: (_event, footerPerson) => {
      footerPersons.push(footerPerson);
      return { text: 'footer' };
    },
    postCard: async (channel, card) => posted.push({ channel, title: card.text, body: JSON.stringify(card.blocks) }),
    markSent: async (_client, eventItemId) => sent.push(eventItemId),
    logger: { error: () => {} },
  };
  if (members) {
    deps.listCouncilMembers = async () => members;
  }
  return { posted, sent, footerPersons, deps };
}

const STAMPER = {
  district: 15,
  name: 'Russell W. Stamper, II',
  title: 'District 15 Alderman',
  imageUrl: 'https://city.milwaukee.gov/x/StamperHeadshot.jpg',
  email: 'russell.stamper@milwaukee.gov',
  phone: '414-286-2221',
  webpage: 'https://city.milwaukee.gov/CommonCouncil/Council-Members/District15',
};

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

test('each channel gets a card in its subscribed language', async () => {
  const h = harness({
    pending: [row],
    subscriptions: [
      { channelId: 'C-EN', committees: ['ZONING'], keywords: [], language: 'en' },
      { channelId: 'C-ES', committees: ['ZONING'], keywords: [], language: 'es' },
    ],
  });
  const out = await processPendingAlerts(h.deps);
  const byChannel = Object.fromEntries(h.posted.map((p) => [p.channel, p.body]));
  assert.ok(!byChannel['C-EN'].includes('En español'));
  assert.ok(byChannel['C-ES'].includes('En español'));
  assert.equal(out[0].posted, 2);
});

test('a subscription without a language gets the English-only card', async () => {
  const h = harness({ pending: [row], subscriptions: [{ channelId: 'C1', committees: ['ZONING'], keywords: [] }] });
  await processPendingAlerts(h.deps);
  assert.ok(!h.posted[0].body.includes('En español'));
});

test('a sponsor matching the council directory adds the headshot and suppresses the footer person', async () => {
  const h = harness({
    pending: [row],
    subscriptions: [{ channelId: 'C1', committees: ['ZONING'], keywords: [] }],
    person: { name: 'ALD. STAMPER', email: undefined, phone: undefined },
    members: [STAMPER],
  });
  await processPendingAlerts(h.deps);
  assert.ok(h.posted[0].body.includes('StamperHeadshot.jpg'));
  assert.deepEqual(h.footerPersons, [null]);
});

test('a sponsor with no directory match keeps the current footer behavior', async () => {
  const person = { name: 'THE CHAIR', email: undefined, phone: undefined };
  const h = harness({
    pending: [row],
    subscriptions: [{ channelId: 'C1', committees: ['ZONING'], keywords: [] }],
    person,
    members: [STAMPER],
  });
  await processPendingAlerts(h.deps);
  assert.ok(!h.posted[0].body.includes('"type":"image"'));
  assert.deepEqual(h.footerPersons, [person]);
});

test('works without a listCouncilMembers dep (backward compatible)', async () => {
  const person = { name: 'ALD. STAMPER', email: undefined, phone: undefined };
  const h = harness({
    pending: [row],
    subscriptions: [{ channelId: 'C1', committees: ['ZONING'], keywords: [] }],
    person,
  });
  await processPendingAlerts(h.deps);
  assert.ok(!h.posted[0].body.includes('"type":"image"'));
  assert.deepEqual(h.footerPersons, [person]);
});

test('an enrichment failure leaves the row pending (not marked sent)', async () => {
  const h = harness({ pending: [row], subscriptions: [] });
  h.deps.enrich = async () => {
    throw new Error('legistar down');
  };
  await processPendingAlerts(h.deps);
  assert.deepEqual(h.sent, []);
});
