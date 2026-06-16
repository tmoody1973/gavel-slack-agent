import assert from 'node:assert/strict';
import { test } from 'node:test';

import { shouldSuppress } from '../../civicmail/dedup.js';

const meeting = { category: 'meetings', legistarMeetingId: '1348260' };
const detected = [{ eventId: 1348260 }, { eventId: 999 }];

test('suppresses a meeting the poller already detected (eventId match)', () => {
  assert.equal(shouldSuppress(meeting, detected), true);
});

test('does not suppress a meeting the poller has not seen', () => {
  assert.equal(shouldSuppress({ category: 'meetings', legistarMeetingId: '5555' }, detected), false);
});

test('permits/licenses never dedupe against Legistar (they live in Accela)', () => {
  const permit = { category: 'neighborhood_services', recordNumber: 'COM-ALT-26-00358' };
  assert.equal(shouldSuppress(permit, detected), false);
});

test('a meeting with no legistar link is never suppressed', () => {
  assert.equal(shouldSuppress({ category: 'meetings' }, detected), false);
});

test('handles an empty detected list', () => {
  assert.equal(shouldSuppress(meeting, []), false);
  assert.equal(shouldSuppress(meeting, undefined), false);
});
