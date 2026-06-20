import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildPastEventsQuery, createLegistarClient, mapEvent, videoClipId } from '../../poller/legistar.js';

test('videoClipId coerces a string clip id to a positive number (list+single endpoints return strings)', () => {
  assert.equal(videoClipId('5210'), 5210);
  assert.equal(videoClipId(5213), 5213);
});

test('videoClipId rejects no-webcast sentinels (null / 0 / "0" / "" / non-numeric)', () => {
  assert.equal(videoClipId(null), undefined);
  assert.equal(videoClipId(undefined), undefined);
  assert.equal(videoClipId(0), undefined);
  assert.equal(videoClipId('0'), undefined);
  assert.equal(videoClipId(''), undefined);
  assert.equal(videoClipId('not-a-clip'), undefined);
});

test('buildPastEventsQuery is a look-back window of Final agendas, newest first', () => {
  const q = buildPastEventsQuery('2026-06-20T12:00:00.000Z', 30);
  assert.ok(q.startsWith('events?'));
  const decoded = decodeURIComponent(q).replace(/\+/g, ' ');
  assert.ok(decoded.includes("EventDate ge datetime'2026-05-21'"));
  assert.ok(decoded.includes("EventDate lt datetime'2026-06-20'"));
  assert.ok(decoded.includes("EventAgendaStatusName eq 'Final'"));
  assert.ok(decoded.includes('$orderby=EventDate desc'));
});

test('mapEvent carries eventMedia (coerced) only when a real clip id is present', () => {
  const withVideo = mapEvent({
    EventId: 13441,
    EventBodyName: 'ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE',
    EventDate: '2026-06-16T00:00:00',
    EventMedia: '5210',
  });
  assert.equal(withVideo.eventMedia, 5210);

  const noVideo = mapEvent({ EventId: 1, EventBodyName: 'X', EventDate: 'd', EventMedia: 0 });
  assert.ok(!('eventMedia' in noVideo), 'no-webcast events must omit eventMedia entirely');
});

function fakeFetch(routes) {
  const calls = [];
  const fetch = async (url, opts) => {
    calls.push({ url, opts });
    const last = new URL(url).pathname.split('/').pop();
    return { ok: true, status: 200, json: async () => routes[last] ?? [] };
  };
  return { fetch, calls };
}

const makeClient = (fetch) =>
  createLegistarClient({ fetch, client: 'milwaukee', userAgent: 'UA', now: () => '2026-06-20T12:00:00.000Z' });

test('listRecentMeetingsWithVideo keeps only events with a webcast, mapped to the row shape', async () => {
  const { fetch, calls } = fakeFetch({
    events: [
      {
        EventId: 13456,
        EventBodyName: 'FINANCE & PERSONNEL COMMITTEE',
        EventDate: '2026-06-18T00:00:00',
        EventMedia: '5213',
      },
      {
        EventId: 13441,
        EventBodyName: 'ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE',
        EventDate: '2026-06-16T00:00:00',
        EventMedia: '5210',
      },
      { EventId: 99999, EventBodyName: 'NO VIDEO COMMITTEE', EventDate: '2026-06-15T00:00:00', EventMedia: 0 },
    ],
  });
  const meetings = await makeClient(fetch).listRecentMeetingsWithVideo();
  assert.equal(meetings.length, 2);
  assert.deepEqual(meetings[0], {
    eventId: 13456,
    eventBodyName: 'FINANCE & PERSONNEL COMMITTEE',
    eventDate: '2026-06-18T00:00:00',
    eventMedia: 5213,
  });
  assert.ok(calls[0].url.includes('/v1/milwaukee/events?'));
});

test('listRecentMeetingsWithVideo narrows to one committee when asked', async () => {
  const { fetch } = fakeFetch({
    events: [
      {
        EventId: 13456,
        EventBodyName: 'FINANCE & PERSONNEL COMMITTEE',
        EventDate: '2026-06-18T00:00:00',
        EventMedia: '5213',
      },
      {
        EventId: 13441,
        EventBodyName: 'ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE',
        EventDate: '2026-06-16T00:00:00',
        EventMedia: '5210',
      },
    ],
  });
  const meetings = await makeClient(fetch).listRecentMeetingsWithVideo({
    committee: 'ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE',
  });
  assert.equal(meetings.length, 1);
  assert.equal(meetings[0].eventId, 13441);
});
