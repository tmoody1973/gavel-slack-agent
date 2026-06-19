import assert from 'node:assert';
import { describe, it } from 'node:test';

import { pickSampleItem } from '../../alerts/sample.js';

const sub = {
  channelId: 'C1',
  committees: ['PUBLIC SAFETY AND HEALTH COMMITTEE'],
  keywords: ['pothole'],
};

describe('pickSampleItem', () => {
  it('returns the single matching upcoming item (committee hit)', () => {
    const upcoming = [
      { eventItemId: 1, eventBodyName: 'CITY PLAN COMMISSION', title: 'Rezoning', eventDate: '2026-06-20T00:00:00' },
      {
        eventItemId: 2,
        eventBodyName: 'PUBLIC SAFETY AND HEALTH COMMITTEE',
        title: 'Police staffing',
        eventDate: '2026-06-25T00:00:00',
      },
    ];
    assert.equal(pickSampleItem(upcoming, sub)?.eventItemId, 2);
  });

  it('also matches on a keyword substring in the title (match.js parity)', () => {
    const upcoming = [
      {
        eventItemId: 7,
        eventBodyName: 'PUBLIC WORKS COMMITTEE',
        title: 'Pothole repair program',
        eventDate: '2026-06-22T00:00:00',
      },
    ];
    assert.equal(pickSampleItem(upcoming, sub)?.eventItemId, 7);
  });

  it('prefers the soonest matching meeting when several match', () => {
    const upcoming = [
      {
        eventItemId: 10,
        eventBodyName: 'PUBLIC SAFETY AND HEALTH COMMITTEE',
        title: 'Later item',
        eventDate: '2026-06-30T00:00:00',
      },
      {
        eventItemId: 11,
        eventBodyName: 'PUBLIC SAFETY AND HEALTH COMMITTEE',
        title: 'Sooner item',
        eventDate: '2026-06-21T00:00:00',
      },
    ];
    assert.equal(pickSampleItem(upcoming, sub)?.eventItemId, 11);
  });

  it('returns null when nothing matches the subscription', () => {
    const upcoming = [
      {
        eventItemId: 3,
        eventBodyName: 'LICENSES COMMITTEE',
        title: 'Tavern license',
        eventDate: '2026-06-20T00:00:00',
      },
    ];
    assert.equal(pickSampleItem(upcoming, sub), null);
  });

  it('returns null for an empty upcoming list', () => {
    assert.equal(pickSampleItem([], sub), null);
  });

  it('is defensive against missing/garbage input', () => {
    assert.equal(pickSampleItem(undefined, sub), null);
    assert.equal(pickSampleItem([{ title: 'no body' }], sub), null);
  });
});
