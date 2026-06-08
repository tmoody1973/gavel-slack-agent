import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLegistarClient } from '../src/legistar.js';

function fakeFetch(routes) {
  const calls = [];
  const fetch = async (url, opts) => {
    calls.push({ url, opts });
    const last = new URL(url).pathname.split('/').pop();
    const body = routes[last] ?? [];
    return { ok: true, status: 200, json: async () => body };
  };
  return { fetch, calls };
}

test('fetchUpcomingFinalEvents hits /events with the window query, UA, mapped result', async () => {
  const { fetch, calls } = fakeFetch({
    events: [
      {
        EventId: 1,
        EventBodyName: 'ZONING',
        EventDate: '2026-06-10T00:00:00',
        EventAgendaLastPublishedUTC: '2026-06-08T15:00:00Z',
      },
    ],
  });
  const client = createLegistarClient({
    fetch,
    client: 'milwaukee',
    userAgent: 'GavelCivicAgent/0.1',
    now: () => '2026-06-08T12:00:00.000Z',
  });
  const events = await client.fetchUpcomingFinalEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].eventId, 1);
  assert.ok(calls[0].url.includes('/v1/milwaukee/events?'));
  assert.equal(calls[0].opts.headers['User-Agent'], 'GavelCivicAgent/0.1');
});

test('fetchEventItems hits /events/{id}/eventitems with Attachments=1, mapped', async () => {
  const { fetch, calls } = fakeFetch({
    eventitems: [{ EventItemId: 9, EventItemTitle: 'Rezoning', EventItemMatterId: 3, EventItemAgendaNumber: '14' }],
  });
  const client = createLegistarClient({
    fetch,
    client: 'milwaukee',
    userAgent: 'UA',
    now: () => '2026-06-08T12:00:00.000Z',
  });
  const items = await client.fetchEventItems(1);
  assert.equal(items[0].eventItemId, 9);
  assert.ok(calls[0].url.includes('/v1/milwaukee/events/1/eventitems'));
  assert.ok(calls[0].url.includes('Attachments=1'));
});

test('throws a clear error on a non-ok response', async () => {
  const fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
  const client = createLegistarClient({
    fetch,
    client: 'milwaukee',
    userAgent: 'UA',
    now: () => '2026-06-08T12:00:00.000Z',
  });
  await assert.rejects(() => client.fetchUpcomingFinalEvents(), /Legistar.*503/);
});
