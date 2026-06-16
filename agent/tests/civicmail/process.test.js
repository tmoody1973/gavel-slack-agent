import assert from 'node:assert/strict';
import { test } from 'node:test';

import { processCivicNotifications } from '../../civicmail/process.js';

const SUMMARY = {
  en: { summary: 'A tavern license renewal.', whyItMatters: 'Neighbors can weigh in.' },
  es: { summary: 'Una renovación de licencia.', whyItMatters: 'Los vecinos pueden opinar.' },
  addresses: [],
};

function harness(overrides = {}) {
  const posted = [];
  const processed = [];
  const deps = {
    listPending: async () => overrides.pending ?? [],
    listSubscriptions: async () => overrides.subscriptions ?? [],
    listLegistarItems: async () => overrides.legistar ?? [],
    fetchDocuments: overrides.fetchDocuments ?? (async () => []),
    generateBilingual: overrides.generateBilingual ?? (async () => SUMMARY),
    postCard: async (channel, card) => posted.push({ channel, card }),
    markProcessed: async (messageId, summary) => processed.push({ messageId, summary }),
    logger: { error: () => {} },
  };
  return { deps, posted, processed };
}

const licenseInD3 = {
  messageId: '<lic@x>',
  category: 'licenses',
  subject: 'RENEWAL Class B Tavern License',
  district: '3',
  bodyText: 'license body',
};

test('routes a notification to a district-3 channel and posts a card', async () => {
  const { deps, posted, processed } = harness({
    pending: [licenseInD3],
    subscriptions: [
      { channelId: 'C3', committees: [], keywords: [], language: 'en', boundary: { type: 'district', value: '3' } },
    ],
  });
  const results = await processCivicNotifications(deps);
  assert.equal(posted.length, 1);
  assert.equal(posted[0].channel, 'C3');
  assert.equal(results[0].posted, 1);
  assert.equal(processed[0].messageId, '<lic@x>');
  assert.ok(processed[0].summary, 'summary is cached on markProcessed');
});

test('posts the Spanish card to an es channel', async () => {
  const { deps, posted } = harness({
    pending: [licenseInD3],
    subscriptions: [{ channelId: 'CES', committees: [], keywords: ['tavern'], language: 'es' }],
  });
  await processCivicNotifications(deps);
  assert.match(JSON.stringify(posted[0].card.blocks), /En español/);
});

test('no matching channel → still marked processed, nothing posted', async () => {
  const { deps, posted, processed } = harness({
    pending: [licenseInD3],
    subscriptions: [{ channelId: 'CX', committees: [], keywords: ['demolition'], language: 'en' }],
  });
  const results = await processCivicNotifications(deps);
  assert.equal(posted.length, 0);
  assert.equal(processed.length, 1);
  assert.equal(results[0].posted, 0);
});

test('suppresses a meeting the Legistar poller already detected (no double-alert)', async () => {
  const meeting = {
    messageId: '<mtg@x>',
    category: 'meetings',
    subject: 'ZND Committee Meeting',
    legistarMeetingId: '1348260',
  };
  const { deps, posted, processed } = harness({
    pending: [meeting],
    subscriptions: [{ channelId: 'C3', committees: [], keywords: ['committee'], language: 'en' }],
    legistar: [{ eventId: 1348260 }],
  });
  const results = await processCivicNotifications(deps);
  assert.equal(posted.length, 0, 'must NOT double-alert');
  assert.equal(results[0].suppressed, true);
  assert.equal(processed[0].messageId, '<mtg@x>');
});

test('fetches PDF documents and passes them to the summarizer', async () => {
  let receivedDocs;
  const { deps } = harness({
    pending: [{ messageId: '<mtg2@x>', category: 'meetings', subject: 'ZND Committee Meeting', bodyText: 'thin' }],
    subscriptions: [{ channelId: 'C3', committees: [], keywords: ['committee'], language: 'en' }],
    fetchDocuments: async () => [{ base64: 'QUJD', mediaType: 'application/pdf' }],
    generateBilingual: async (_matter, documents) => {
      receivedDocs = documents;
      return SUMMARY;
    },
  });
  await processCivicNotifications(deps);
  assert.deepEqual(receivedDocs, [{ base64: 'QUJD', mediaType: 'application/pdf' }]);
});

test('a failure leaves the row pending (not marked processed) for retry', async () => {
  const { deps, processed } = harness({
    pending: [licenseInD3],
    subscriptions: [{ channelId: 'C3', committees: [], keywords: ['tavern'], language: 'en' }],
    generateBilingual: async () => {
      throw new Error('summarizer down');
    },
  });
  const results = await processCivicNotifications(deps);
  assert.equal(results[0].error, 'summarizer down');
  assert.equal(processed.length, 0, 'not marked processed → retried next run');
});
