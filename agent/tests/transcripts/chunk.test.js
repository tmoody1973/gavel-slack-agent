import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assignUtterancesToItems, buildTranscriptChunks } from '../../transcripts/chunk.js';

// Two agenda items with video-index boundaries; item 2 starts at 60s.
const items = [
  { eventItemId: 101, agendaNumber: '1', matterId: 5001, videoIndex: 0 },
  { eventItemId: 102, agendaNumber: '2', matterId: 5002, videoIndex: 60 },
];

// Utterances (Deepgram shape): seconds from meeting start.
const utterances = [
  { speaker: 0, transcript: 'Good morning, item one.', start: 2, end: 6 },
  { speaker: 1, transcript: 'I support this rezoning.', start: 7, end: 12 },
  { speaker: 0, transcript: 'Move approval.', start: 50, end: 52 },
  { speaker: 2, transcript: 'Moving on to item two, the sale-back.', start: 61, end: 66 },
  { speaker: 2, transcript: '2409 West Hopkins in the 7th district.', start: 67, end: 72 },
];

test('assigns each utterance to the agenda item whose video-index window contains it', () => {
  const tagged = assignUtterancesToItems(utterances, items);
  assert.equal(tagged[0].eventItemId, 101); // 2s → item 1
  assert.equal(tagged[2].eventItemId, 101); // 50s → still item 1
  assert.equal(tagged[3].eventItemId, 102); // 61s → item 2
  assert.equal(tagged[4].eventItemId, 102);
});

test('an utterance before the first boundary still lands on the first item', () => {
  const tagged = assignUtterancesToItems([{ speaker: 0, transcript: 'x', start: -1, end: 0 }], items);
  assert.equal(tagged[0].eventItemId, 101);
});

test('chunks carry item metadata (eventItemId, agendaNumber, matterId, eventId, date)', () => {
  const chunks = buildTranscriptChunks(utterances, items, { eventId: 13441, eventDate: '2026-06-16' });
  assert.ok(chunks.length >= 2);
  const item2 = chunks.find((c) => c.eventItemId === 102);
  assert.equal(item2.agendaNumber, '2');
  assert.equal(item2.matterId, 5002);
  assert.equal(item2.eventId, 13441);
  assert.equal(item2.eventDate, '2026-06-16');
});

test('chunk text is the spoken content, with speakers + time span in metadata', () => {
  const chunks = buildTranscriptChunks(utterances, items, { eventId: 13441, eventDate: '2026-06-16' });
  const item2 = chunks.find((c) => c.eventItemId === 102);
  assert.match(item2.text, /2409 West Hopkins/);
  assert.ok(Array.isArray(item2.speakers));
  assert.ok(item2.speakers.includes(2));
  assert.equal(typeof item2.startTime, 'number');
  assert.ok(item2.endTime >= item2.startTime);
});

test('windows respect the max-window cap (never a giant chunk)', () => {
  // 10 utterances over 200s within one item → must split into multiple ≤60s chunks
  const long = Array.from({ length: 10 }, (_, i) => ({
    speaker: i % 2,
    transcript: `line ${i}`,
    start: i * 20,
    end: i * 20 + 5,
  }));
  const oneItem = [{ eventItemId: 1, agendaNumber: '1', matterId: 1, videoIndex: 0 }];
  const chunks = buildTranscriptChunks(long, oneItem, {
    eventId: 1,
    eventDate: '2026-06-16',
    windowSeconds: 45,
    maxWindowSeconds: 60,
  });
  assert.ok(chunks.length > 1, 'should split');
  for (const c of chunks) assert.ok(c.endTime - c.startTime <= 60.001, `chunk ${c.startTime}-${c.endTime} exceeds max`);
});

test('consecutive chunks overlap for context continuity', () => {
  const long = Array.from({ length: 10 }, (_, i) => ({
    speaker: 0,
    transcript: `line ${i}`,
    start: i * 20,
    end: i * 20 + 5,
  }));
  const oneItem = [{ eventItemId: 1, agendaNumber: '1', matterId: 1, videoIndex: 0 }];
  const chunks = buildTranscriptChunks(long, oneItem, {
    eventId: 1,
    eventDate: '2026-06-16',
    windowSeconds: 45,
    maxWindowSeconds: 60,
  });
  // some text from the end of chunk N reappears at the start of chunk N+1
  assert.ok(chunks[1].text.includes(chunks[0].text.trim().split('\n').pop().trim().split(' ').pop()));
});

test('empty input yields no chunks, never throws', () => {
  assert.deepEqual(buildTranscriptChunks([], items, { eventId: 1, eventDate: '2026-06-16' }), []);
});

// Regression: a long utterance following a carried-over one used to break the inner loop
// without consuming anything, so `index` never advanced and windowing spun forever —
// it OOM'd the real 2026-06-29 Plan Commission ingest. Chunking must always terminate.
test('an utterance that busts the window on its own still terminates (no infinite loop)', () => {
  const utterances = [
    { start: 0, end: 50, speaker: 0, transcript: 'short opening' },
    { start: 50, end: 200, speaker: 1, transcript: 'a very long uninterrupted statement' },
    { start: 200, end: 210, speaker: 2, transcript: 'brief reply' },
  ];
  const chunks = buildTranscriptChunks(utterances, items, {
    eventId: 1,
    eventDate: '2026-06-16',
    windowSeconds: 45,
    maxWindowSeconds: 60,
  });
  assert.ok(chunks.length > 0, 'produces chunks');
  assert.ok(chunks.length <= utterances.length * 2, `bounded output, got ${chunks.length}`);
  const all = chunks.map((c) => c.text).join(' ');
  assert.match(all, /very long uninterrupted statement/, 'the long utterance is not dropped');
});
