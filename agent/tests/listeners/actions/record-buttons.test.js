import assert from 'node:assert/strict';
import { test } from 'node:test';

import { makeOpenCivicRecord, makeRecordWatch } from '../../../listeners/actions/record-buttons.js';

function harness({ record = null, attachments = [] } = {}) {
  const calls = { ack: 0, opened: [], watched: [] };
  const ctx = {
    ack: async () => {
      calls.ack += 1;
    },
    body: { actions: [{ value: '<m1@city>' }], trigger_id: 'T1', channel: { id: 'C1' } },
    client: { views: { open: async (args) => calls.opened.push(args) } },
    logger: { error: () => {} },
  };
  const deps = {
    getNotification: async () => record,
    getSubscription: async () => ({ language: 'es' }),
    resolveAttachmentUrls: async () => attachments,
    addWatch: async (w) => calls.watched.push(w),
  };
  return { calls, ctx, deps };
}

test('open civic record acks, fetches the row, and opens a modal in the channel language', async () => {
  const record = {
    messageId: '<m1@city>',
    category: 'licenses',
    subject: 'RENEWAL Class B Tavern License',
    addresses: [],
    attachments: [],
  };
  const h = harness({ record });
  await makeOpenCivicRecord(h.deps)(h.ctx);
  assert.equal(h.calls.ack, 1);
  assert.equal(h.calls.opened.length, 1);
  const { view, trigger_id } = h.calls.opened[0];
  assert.equal(trigger_id, 'T1');
  assert.equal(view.type, 'modal');
  assert.match(JSON.stringify(view.blocks), /Class B Tavern License/);
  assert.match(JSON.stringify(view.blocks).toLowerCase(), /cómo participar|distrito|seguir/); // es localized
});

test('open civic record does nothing (no throw) when the record is missing', async () => {
  const h = harness({ record: null });
  await makeOpenCivicRecord(h.deps)(h.ctx);
  assert.equal(h.calls.ack, 1);
  assert.equal(h.calls.opened.length, 0);
});

test('a failing attachment resolver degrades gracefully — the modal still opens', async () => {
  const record = { messageId: '<m1@city>', category: 'other', subject: 'City notice', addresses: [], attachments: [] };
  const h = harness({ record });
  h.deps.resolveAttachmentUrls = async () => {
    throw new Error('agentmail down');
  };
  await makeOpenCivicRecord(h.deps)(h.ctx);
  assert.equal(h.calls.opened.length, 1);
});

test('record watch adds a watch for the modal entity', async () => {
  const h = harness();
  h.ctx.body.actions = [{ value: 'COZUMEL III, LLC' }];
  await makeRecordWatch(h.deps)(h.ctx);
  assert.deepEqual(h.calls.watched, [{ channelId: 'C1', entity: 'COZUMEL III, LLC' }]);
});
