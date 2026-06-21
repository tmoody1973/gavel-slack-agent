import assert from 'node:assert/strict';
import { test } from 'node:test';

import { runTranscriptSearch, runVideoMoment } from '../../agent/transcripts/search.js';
import { videoMomentDeepLink } from '../../transcripts/video.js';

const deepLink = videoMomentDeepLink;

const HOPKINS_HIT = {
  text: 'this is just a repurchase back to the former owner... Alderman Jackson moves approval',
  speakers: [0],
  startTime: 787,
  endTime: 840,
  eventId: 13441,
  eventDate: '2026-06-16',
  eventBodyName: 'ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE',
  eventMedia: 5210,
  eventItemId: 491794,
  agendaNumber: '2.',
  score: 0.82,
};

test('runTranscriptSearch formats receipts with speaker, quote, agenda item, and a timestamped deep link', async () => {
  let embedded;
  let searchedWith;
  const result = await runTranscriptSearch(
    { query: 'sale of the West Hopkins Street property', eventId: 13441 },
    {
      embedQuery: async (text) => {
        embedded = text;
        return [0.1, 0.2];
      },
      search: async (args) => {
        searchedWith = args;
        return [HOPKINS_HIT];
      },
      deepLink,
    },
  );
  assert.equal(embedded, 'sale of the West Hopkins Street property');
  assert.equal(searchedWith.eventId, 13441);
  assert.deepEqual(searchedWith.embedding, [0.1, 0.2]);
  assert.match(result, /repurchase back to the former owner/);
  assert.match(result, /2\./); // agenda item
  assert.match(result, /00:13:07/); // 787s as HH:MM:SS
  assert.match(result, /clip_id=5210&starttime=787/); // tier-1 deep link
});

test('runTranscriptSearch names the speaker when a speaker map exists (publishable receipt)', async () => {
  let mappedEventId;
  const result = await runTranscriptSearch(
    { query: 'sale of the West Hopkins Street property', eventId: 13441 },
    {
      embedQuery: async () => [0.1],
      search: async () => [HOPKINS_HIT],
      deepLink,
      getSpeakerMap: async (eventId) => {
        mappedEventId = eventId;
        return { 0: { name: 'Lamont Westmoreland', title: 'Alderman', role: 'member', confidence: 0.9 } };
      },
    },
  );
  assert.equal(mappedEventId, 13441, 'map fetched for the hit event');
  assert.match(result, /Alderman Lamont Westmoreland/);
  assert.doesNotMatch(result, /Speaker 0/);
});

test('runTranscriptSearch degrades to a generic label when no speaker map is wired', async () => {
  const result = await runTranscriptSearch(
    { query: 'q', eventId: 13441 },
    { embedQuery: async () => [0.1], search: async () => [HOPKINS_HIT], deepLink },
  );
  assert.match(result, /repurchase back to the former owner/);
  assert.match(result, /### A speaker ·/); // generic label, no name invented without a map
});

test('runTranscriptSearch passes a committee filter through as eventBodyName', async () => {
  let searchedWith;
  await runTranscriptSearch(
    { query: 'q', committee: 'ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE' },
    {
      embedQuery: async () => [1],
      search: async (a) => {
        searchedWith = a;
        return [];
      },
      deepLink,
    },
  );
  assert.equal(searchedWith.eventBodyName, 'ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE');
});

test('runTranscriptSearch reports information_unavailable when nothing matches', async () => {
  const result = await runTranscriptSearch(
    { query: 'unrelated topic' },
    { embedQuery: async () => [1], search: async () => [], deepLink },
  );
  assert.match(result, /information_unavailable/);
});

test('runVideoMoment resolves an agenda item (scoped to its meeting) to a tier-1 deep link', async () => {
  let scopedWith;
  const result = await runVideoMoment(
    { eventItemId: 491794, eventId: 13441 },
    {
      getEventItem: async (eventId, itemId) => {
        scopedWith = { eventId, itemId };
        return { EventItemId: itemId, EventItemVideoIndex: 770, EventItemAgendaNumber: '2.' };
      },
      getEvent: async (id) => ({ EventId: id, EventMedia: '5210' }),
      deepLink,
    },
  );
  assert.deepEqual(scopedWith, { eventId: 13441, itemId: 491794 }); // item fetched within its event scope
  assert.match(result, /clip_id=5210&starttime=770/);
  assert.match(result, /00:12:50/); // 770s
});

test('runVideoMoment asks for the meeting when no eventId is given (Legistar needs the event scope)', async () => {
  const result = await runVideoMoment(
    { eventItemId: 491794 },
    { getEventItem: async () => ({}), getEvent: async () => ({}), deepLink },
  );
  assert.match(result, /information_unavailable/);
});

test('runVideoMoment reports information_unavailable when the item has no video index', async () => {
  const result = await runVideoMoment(
    { eventItemId: 1, eventId: 13441 },
    {
      getEventItem: async () => ({ EventItemId: 1, EventItemVideoIndex: null }),
      getEvent: async () => ({ EventMedia: '5210' }),
      deepLink,
    },
  );
  assert.match(result, /information_unavailable/);
});
