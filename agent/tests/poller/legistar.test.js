import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDaysIso,
  buildEventsQuery,
  mapEvent,
  mapEventItem,
  toDetectedItem,
} from '../../poller/legistar.js';

test('addDaysIso advances the date in UTC', () => {
  assert.equal(addDaysIso('2026-06-08T00:00:00.000Z', 7).slice(0, 10), '2026-06-15');
});

test('buildEventsQuery filters a 7-day window of Final agendas', () => {
  const q = buildEventsQuery('2026-06-08T12:00:00.000Z', 7);
  assert.ok(q.startsWith('events?'));
  // Legistar accepts `+` for spaces (data reference cookbook); normalize back to
  // spaces to assert the filter semantics it receives.
  const decoded = decodeURIComponent(q).replace(/\+/g, ' ');
  assert.ok(decoded.includes("EventDate ge datetime'2026-06-08'"));
  assert.ok(decoded.includes("EventDate lt datetime'2026-06-15'"));
  assert.ok(decoded.includes("EventAgendaStatusName eq 'Final'"));
});

test('mapEvent picks the spine fields and the agenda-published timestamp', () => {
  const e = mapEvent({
    EventId: 100,
    EventBodyName: 'ZONING COMMITTEE',
    EventDate: '2026-06-10T00:00:00',
    EventAgendaStatusName: 'Final',
    EventAgendaLastPublishedUTC: '2026-06-08T15:00:00Z',
  });
  assert.deepEqual(e, {
    eventId: 100,
    eventBodyName: 'ZONING COMMITTEE',
    eventDate: '2026-06-10T00:00:00',
    agendaPublishedUTC: '2026-06-08T15:00:00Z',
  });
});

test('mapEventItem normalizes id, matter, title, agenda number', () => {
  const it = mapEventItem({
    EventItemId: 555,
    EventItemMatterId: 999,
    EventItemTitle: 'A resolution relating to rezoning',
    EventItemAgendaNumber: '14',
  });
  assert.deepEqual(it, {
    eventItemId: 555,
    matterId: 999,
    title: 'A resolution relating to rezoning',
    agendaNumber: '14',
  });
});

test('toDetectedItem joins event + item into the queue row and omits undefined', () => {
  const event = {
    eventId: 100,
    eventBodyName: 'ZONING',
    eventDate: '2026-06-10T00:00:00',
    agendaPublishedUTC: undefined,
  };
  const item = { eventItemId: 555, matterId: undefined, title: 'Rezoning', agendaNumber: '14' };
  const row = toDetectedItem('milwaukee', event, item);
  assert.deepEqual(row, {
    client: 'milwaukee',
    eventItemId: 555,
    eventId: 100,
    title: 'Rezoning',
    agendaNumber: '14',
    eventBodyName: 'ZONING',
    eventDate: '2026-06-10T00:00:00',
  });
  assert.ok(!('matterId' in row));
  assert.ok(!('agendaPublishedUTC' in row));
});
