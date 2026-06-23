import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { exceedsDailyCap } from '../../civicmail/comment-cap.js';

const HOUR = 60 * 60 * 1000;
const now = 1_700_000_000_000;

describe('exceedsDailyCap — one comment per user per file per day (anti-spam)', () => {
  it('allows when there are no prior submissions', () => {
    assert.equal(exceedsDailyCap([], now), false);
    assert.equal(exceedsDailyCap(undefined, now), false);
  });

  it('blocks a second submission within 24h', () => {
    assert.equal(exceedsDailyCap([now - HOUR], now), true);
    assert.equal(exceedsDailyCap([now], now), true);
  });

  it('allows again once the prior submission is older than 24h', () => {
    assert.equal(exceedsDailyCap([now - 25 * HOUR], now), false);
  });

  it('blocks if ANY prior submission is within the window', () => {
    assert.equal(exceedsDailyCap([now - 40 * HOUR, now - 2 * HOUR], now), true);
  });
});
