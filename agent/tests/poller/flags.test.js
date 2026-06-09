import assert from 'node:assert/strict';
import { test } from 'node:test';

import { computeAlertFlags } from '../../poller/flags.js';

// Legistar EventDate comes as a bare local-midnight timestamp ("2026-06-11T00:00:00").
const NOW = '2026-06-09T12:00:00.000Z';

test('an item detected <48h before the meeting gets the walk-on flag', () => {
  const flags = computeAlertFlags({ eventDate: '2026-06-10T00:00:00', consent: false }, NOW);
  assert.equal(flags.walkOnFlag, true);
});

test('an item detected ≥48h before the meeting is not flagged', () => {
  const flags = computeAlertFlags({ eventDate: '2026-06-15T00:00:00', consent: false }, NOW);
  assert.equal(flags.walkOnFlag, false);
});

test('the 48h boundary is exclusive (exactly 48h is not a walk-on)', () => {
  const flags = computeAlertFlags({ eventDate: '2026-06-11T12:00:00', consent: false }, NOW);
  assert.equal(flags.walkOnFlag, false);
});

test('a missing eventDate never flags (no data, no accusation)', () => {
  const flags = computeAlertFlags({ consent: false }, NOW);
  assert.equal(flags.walkOnFlag, false);
});

test('consent passthrough sets the consent flag independently', () => {
  assert.equal(computeAlertFlags({ eventDate: '2026-06-15T00:00:00', consent: true }, NOW).consentFlag, true);
  assert.equal(computeAlertFlags({ eventDate: '2026-06-15T00:00:00', consent: false }, NOW).consentFlag, false);
});

test('a late-added consent item carries both flags', () => {
  const flags = computeAlertFlags({ eventDate: '2026-06-10T00:00:00', consent: true }, NOW);
  assert.deepEqual(flags, { walkOnFlag: true, consentFlag: true });
});
