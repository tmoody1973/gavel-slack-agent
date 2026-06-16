import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildMatterOutcome, buildMatterOutcomes } from '../../transcripts/outcomes.js';

// A real ZND item shape (EventId 13441, item 491794) — Milwaukee committee votes
// are voice votes, so Seconder/Tally come back null.
const ADOPTED_ITEM = {
  EventItemId: 491794,
  EventItemMatterId: 74048,
  EventItemMatterFile: '260176',
  EventItemAgendaNumber: '2.',
  EventItemActionName: 'RECOMMENDED FOR  ADOPTION', // note the double space Legistar returns
  EventItemActionText: 'A motion was made by ALD. JACKSON that this Resolution be RECOMMENDED FOR ADOPTION.',
  EventItemPassedFlagName: 'Pass',
  EventItemMover: 'ALD. JACKSON',
  EventItemSeconder: null,
  EventItemTally: null,
};

const ctx = { eventId: 13441, eventDate: '2026-06-16', eventMinutesFile: 'https://example/minutes.pdf' };

test('buildMatterOutcome maps a voted item to a structured outcome record', () => {
  const out = buildMatterOutcome(ADOPTED_ITEM, ctx);
  assert.equal(out.eventItemId, 491794);
  assert.equal(out.eventId, 13441);
  assert.equal(out.matterId, 74048);
  assert.equal(out.matterFile, '260176');
  assert.equal(out.agendaNumber, '2.');
  assert.equal(out.actionName, 'RECOMMENDED FOR ADOPTION'); // internal whitespace collapsed
  assert.equal(out.passedFlag, 'Pass');
  assert.equal(out.mover, 'ALD. JACKSON');
  assert.equal(out.eventDate, '2026-06-16');
  assert.equal(out.minutesFile, 'https://example/minutes.pdf');
});

test('buildMatterOutcome omits empty optional fields rather than storing null', () => {
  const out = buildMatterOutcome(ADOPTED_ITEM, ctx);
  assert.equal('seconder' in out, false); // null Seconder dropped
  assert.equal('tally' in out, false); // null Tally dropped
});

test('buildMatterOutcome coerces a present numeric tally to a string', () => {
  const out = buildMatterOutcome({ ...ADOPTED_ITEM, EventItemTally: 5 }, ctx);
  assert.equal(out.tally, '5');
});

test('buildMatterOutcomes keeps only items that actually have a recorded action', () => {
  const items = [
    ADOPTED_ITEM,
    { EventItemId: 2, EventItemActionName: null }, // not yet acted on
    { EventItemId: 3, EventItemActionName: '' }, // header/placeholder line
  ];
  const outcomes = buildMatterOutcomes(items, ctx);
  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0].eventItemId, 491794);
});
