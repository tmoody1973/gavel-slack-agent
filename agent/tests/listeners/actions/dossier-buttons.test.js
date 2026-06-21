import assert from 'node:assert/strict';
import { test } from 'node:test';

import { makeDossierSend, makeDossierWatch, openDossier } from '../../../listeners/actions/dossier-buttons.js';

const row = (over = {}) => ({
  eventItemId: 7,
  eventId: 100,
  matterId: 555,
  title: 'A resolution authorizing the sale of 2409-11 West Hopkins Street',
  eventBodyName: 'ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE',
  eventDate: '2026-06-25',
  ...over,
});

function makeDeps(over = {}) {
  return {
    getDetectedItem: async () => row(),
    getMatter: async () => ({ fileNumber: '260176' }),
    listSubscriptions: async () => [{ channelId: 'C1', language: 'en' }],
    getChannelName: async () => 'general',
    enrich: async () => ({ matter: { fileNumber: '260176' }, event: {}, person: { name: 'Russell Stamper' } }),
    listMembers: async () => [],
    getMatterHistory: async () => [{ date: '2026-05-01', action: 'ASSIGNED TO' }],
    getOutcomes: async () => [],
    searchMoment: async () => null,
    generate: async () => ({ hook: 'h', whyStory: 'w' }),
    ...over,
  };
}

function client() {
  const pushed = [];
  const dms = [];
  const posted = [];
  const ephemerals = [];
  return {
    calls: { pushed, dms, posted, ephemerals },
    views: { push: async (v) => pushed.push(v) },
    conversations: {
      open: async (a) => {
        dms.push(a);
        return { channel: { id: 'D1' } };
      },
    },
    chat: { postMessage: async (m) => posted.push(m), postEphemeral: async (m) => ephemerals.push(m) },
  };
}

const logger = { error: () => {} };

test('openDossier pushes the dossier modal stacked on the story modal', async () => {
  const c = client();
  await openDossier({ body: { trigger_id: 'T1' }, client: c, eventItemId: 7, deps: makeDeps(), logger });
  assert.equal(c.calls.pushed.length, 1);
  assert.equal(c.calls.pushed[0].trigger_id, 'T1');
  assert.equal(c.calls.pushed[0].view.callback_id, 'story_dossier_modal');
  assert.match(JSON.stringify(c.calls.pushed[0].view.blocks), /West Hopkins/);
});

test('makeDossierWatch pushes the channel-picker prefilled with the File number', async () => {
  const c = client();
  await makeDossierWatch(makeDeps())({
    ack: async () => {},
    body: { trigger_id: 'T1', actions: [{ value: '7' }] },
    client: c,
    logger,
  });
  assert.equal(c.calls.pushed.length, 1);
  assert.match(JSON.stringify(c.calls.pushed[0].view), /File #260176/);
});

test('makeDossierSend DMs the brief (no action row) and nudges the channel', async () => {
  const c = client();
  await makeDossierSend(makeDeps())({
    ack: async () => {},
    body: { user: { id: 'U1' }, channel: { id: 'C1' }, actions: [{ value: '7' }] },
    context: {},
    client: c,
    logger,
  });
  assert.equal(c.calls.dms.length, 1);
  assert.equal(c.calls.posted.length, 1);
  assert.ok(!c.calls.posted[0].blocks.some((b) => b.type === 'actions'), 'the DM omits the action row');
  assert.match(JSON.stringify(c.calls.posted[0].blocks), /West Hopkins/);
  assert.equal(c.calls.ephemerals.length, 1);
});
