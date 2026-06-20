import assert from 'node:assert/strict';
import { test } from 'node:test';

import { makeVideoBrowse, makeVideoFilter } from '../../../listeners/actions/video-buttons.js';

const meeting = (over = {}) => ({
  eventId: 13441,
  eventBodyName: 'ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE',
  eventDate: '2026-06-16T00:00:00',
  eventMedia: 5210,
  ...over,
});
const finance = meeting({ eventId: 13456, eventBodyName: 'FINANCE & PERSONNEL COMMITTEE', eventMedia: 5213 });

function makeDeps(overrides = {}) {
  return {
    listRecentMeetingsWithVideo: async () => [meeting(), finance],
    listIngestedEventIds: async () => [13441],
    listSubscriptions: async () => [{ channelId: 'C1', role: 'reporter', language: 'en' }],
    ...overrides,
  };
}

function client() {
  const opened = [];
  const updated = [];
  return {
    calls: { opened, updated },
    views: { open: async (v) => opened.push(v), update: async (v) => updated.push(v) },
  };
}

const logger = { error: () => {} };

test('makeVideoBrowse opens the video modal via trigger_id, tagging the ingested meeting searchable', async () => {
  const c = client();
  await makeVideoBrowse(makeDeps())({ ack: async () => {}, body: { trigger_id: 'T1' }, client: c, logger });
  assert.equal(c.calls.opened.length, 1);
  assert.equal(c.calls.opened[0].trigger_id, 'T1');
  assert.equal(c.calls.opened[0].view.callback_id, 'video_browse_modal');
  const blocks = JSON.stringify(c.calls.opened[0].view.blocks);
  assert.match(blocks, /🔍 Searchable/);
  assert.match(blocks, /🎥 Video only/);
});

test('makeVideoFilter re-renders the modal narrowed to the selected committee via views.update', async () => {
  const c = client();
  await makeVideoFilter(makeDeps())({
    ack: async () => {},
    body: {
      view: { id: 'V1', private_metadata: JSON.stringify({ language: 'en', committee: null }) },
      actions: [{ selected_option: { value: 'c::FINANCE & PERSONNEL COMMITTEE' } }],
    },
    client: c,
    logger,
  });
  assert.equal(c.calls.updated.length, 1);
  assert.equal(c.calls.updated[0].view_id, 'V1');
  const blocks = JSON.stringify(c.calls.updated[0].view.blocks);
  assert.match(blocks, /clip_id=5213/);
  assert.doesNotMatch(blocks, /clip_id=5210/);
});

test('makeVideoFilter keeps the dropdown options as the full committee set (not narrowed to one)', async () => {
  const c = client();
  await makeVideoFilter(makeDeps())({
    ack: async () => {},
    body: {
      view: { id: 'V1', private_metadata: JSON.stringify({ language: 'en', committee: null }) },
      actions: [{ selected_option: { value: 'c::FINANCE & PERSONNEL COMMITTEE' } }],
    },
    client: c,
    logger,
  });
  const blocks = JSON.stringify(c.calls.updated[0].view.blocks);
  // Both committees still appear as dropdown options even though rows are filtered.
  assert.match(blocks, /ZONING/);
});

test('makeVideoBrowse renders Spanish when every subscription is Spanish', async () => {
  const c = client();
  const deps = makeDeps({ listSubscriptions: async () => [{ channelId: 'C1', role: 'reporter', language: 'es' }] });
  await makeVideoBrowse(deps)({ ack: async () => {}, body: { trigger_id: 'T1' }, client: c, logger });
  assert.match(JSON.stringify(c.calls.opened[0].view.blocks), /Ver en Granicus|Solo video|Con búsqueda/);
});
