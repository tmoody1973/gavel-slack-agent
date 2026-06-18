import assert from 'node:assert';
import { describe, it } from 'node:test';

import { growAreasBlocks, growAreasModal, growWatchlistCard, growWatchlistPrompt } from '../../blockkit/grow.js';

describe('growWatchlistPrompt', () => {
  it('proposes a #gavel-watchlist with a How → button (EN)', () => {
    const card = growWatchlistPrompt('en');
    const json = JSON.stringify(card);
    assert.match(json, /#gavel-watchlist/);
    const button = card.blocks.find((b) => b.type === 'actions').elements[0];
    assert.equal(button.action_id, 'grow_watchlist_how');
    assert.equal(button.value, 'en');
    assert.match(button.text.text, /How/);
  });

  it('localizes to Spanish and carries the language on the button', () => {
    const card = growWatchlistPrompt('es');
    assert.match(JSON.stringify(card), /#gavel-watchlist/);
    assert.equal(card.blocks.find((b) => b.type === 'actions').elements[0].value, 'es');
    assert.match(JSON.stringify(card), /Cómo/);
  });
});

describe('growWatchlistCard', () => {
  it('reveals the create · invite · done checklist in both languages', () => {
    assert.match(JSON.stringify(growWatchlistCard('en')), /\/invite @Gavel/);
    assert.match(JSON.stringify(growWatchlistCard('es')), /\/invite @Gavel/);
    assert.match(JSON.stringify(growWatchlistCard('es')), /Listo/);
  });
});

describe('growAreas (per-area proposal)', () => {
  it('proposes per-area channels with example names + invite steps', () => {
    const json = JSON.stringify(growAreasBlocks('en'));
    assert.match(json, /#civic-/); // example area channel names
    assert.match(json, /\/invite @Gavel/);
  });

  it('localizes the per-area proposal', () => {
    assert.match(JSON.stringify(growAreasBlocks('es')), /barrio/);
  });

  it('wraps the proposal in a modal for the App Home entry point', () => {
    const view = growAreasModal('en');
    assert.equal(view.type, 'modal');
    assert.equal(view.callback_id, 'grow_areas_modal');
    assert.match(JSON.stringify(view.blocks), /#civic-/);
  });
});
