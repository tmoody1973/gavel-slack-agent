import assert from 'node:assert';
import { describe, it } from 'node:test';

import { makeCoverMultipleAreas, makeWatchlistHow } from '../../../listeners/onboarding/grow.js';

const logger = { error: () => {}, info: () => {} };

describe('makeWatchlistHow', () => {
  it('reveals the watchlist checklist in the button language', async () => {
    let responded;
    await makeWatchlistHow()({
      ack: async () => {},
      action: { value: 'es' },
      respond: async (msg) => {
        responded = msg;
      },
      logger,
    });
    assert.equal(responded.response_type, 'ephemeral');
    assert.match(JSON.stringify(responded.blocks), /\/invite @Gavel/);
    assert.match(JSON.stringify(responded.blocks), /Listo/); // ES checklist
  });
});

describe('makeCoverMultipleAreas', () => {
  it('opens the per-area proposal modal with the trigger id', async () => {
    let opened;
    await makeCoverMultipleAreas()({
      ack: async () => {},
      body: { trigger_id: 'T9' },
      action: { value: 'en' },
      client: {
        views: {
          open: async (args) => {
            opened = args;
          },
        },
      },
      logger,
    });
    assert.equal(opened.trigger_id, 'T9');
    assert.equal(opened.view.callback_id, 'grow_areas_modal');
    assert.match(JSON.stringify(opened.view.blocks), /#civic-/);
  });
});
