import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPoll } from '../../poller/poll.js';

function fakes({ events, itemsByEvent, seenIds = [] }) {
  const seen = new Set(seenIds);
  const enqueued = [];
  return {
    seen,
    enqueued,
    deps: {
      client: 'milwaukee',
      fetchUpcomingFinalEvents: async () => events,
      fetchEventItems: async (eventId) => itemsByEvent[eventId] ?? [],
      readSeenEventItemIds: async () => [...seen],
      enqueueDetected: async (items) => {
        for (const i of items) seen.add(i.eventItemId);
        enqueued.push(...items);
        return items.length;
      },
    },
  };
}

const EVENTS = [
  { eventId: 1, eventBodyName: 'ZONING', eventDate: '2026-06-10T00:00:00', agendaPublishedUTC: '2026-06-08T15:00:00Z' },
];
const ITEMS = { 1: [{ eventItemId: 9, title: 'Rezoning', matterId: 3, agendaNumber: '14' }] };

test('cold run detects and enqueues every live item', async () => {
  const f = fakes({ events: EVENTS, itemsByEvent: ITEMS });
  const result = await runPoll(f.deps);
  assert.equal(result.fetchedCount, 1);
  assert.equal(result.newItems.length, 1);
  assert.equal(f.enqueued.length, 1);
  assert.equal(f.enqueued[0].eventBodyName, 'ZONING');
});

test('second run is idempotent — nothing new, enqueue not called', async () => {
  const f = fakes({ events: EVENTS, itemsByEvent: ITEMS });
  await runPoll(f.deps);
  const before = f.enqueued.length;
  const result = await runPoll(f.deps);
  assert.equal(result.newItems.length, 0);
  assert.equal(f.enqueued.length, before);
});

test('same eventItemId under a different client is still detected (isolation)', async () => {
  const f = fakes({ events: EVENTS, itemsByEvent: ITEMS, seenIds: [9] });
  // seen contains 9 for THIS client; a county poll with the same id must still detect.
  const county = { ...f.deps, client: 'milwaukeecounty', readSeenEventItemIds: async () => [] };
  const result = await runPoll(county);
  assert.equal(result.newItems.length, 1);
});
