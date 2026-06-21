import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildBridgeCard } from '../../blockkit/bridge-card.js';

const match = (over = {}) => ({
  item: {
    eventItemId: 7,
    title: 'A resolution relating to the rezoning of the property at 2000 S 13th St',
    eventBodyName: 'ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE',
    eventDate: '2026-06-25',
  },
  entity: '2000 S 13th St',
  language: 'en',
  ...over,
});

describe('buildBridgeCard — the community↔agenda proposal (MOO-125)', () => {
  it('returns {text, blocks} naming the entity + committee, with a Watch action on the item', () => {
    const { text, blocks } = buildBridgeCard(match());
    const all = JSON.stringify(blocks);
    assert.match(all, /2000 S 13th St/);
    assert.match(all, /ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE/);
    const watch = blocks.flatMap((b) => b.elements ?? []).find((e) => e.action_id === 'alert_watch');
    assert.ok(watch, 'reuses the alert_watch action');
    assert.equal(watch.value, '7', 'watch carries the eventItemId');
    assert.match(text, /2000 S 13th St/);
  });

  it('always carries the privacy note (queried live, never stored)', () => {
    const all = JSON.stringify(buildBridgeCard(match()).blocks);
    assert.match(all.toLowerCase(), /never stored|searched.*live/);
  });

  it('never embeds any community message content — only agenda-derived data', () => {
    // The builder is given no message content; assert the output is purely agenda/entity.
    const all = JSON.stringify(buildBridgeCard(match()).blocks);
    assert.doesNotMatch(all, /corner store|my neighbor|slumlord/i);
  });

  it('renders a Spanish section + Spanish privacy note for an ES channel', () => {
    const all = JSON.stringify(buildBridgeCard(match({ language: 'es' })).blocks);
    assert.match(all, /espa|aviso|guardan|En español/i);
    // entity + committee stay English even in the ES card
    assert.match(all, /2000 S 13th St/);
  });

  it('omits the date phrase gracefully when the item has no date', () => {
    const { blocks } = buildBridgeCard(
      match({ item: { eventItemId: 9, title: 'x', eventBodyName: 'COMMON COUNCIL' } }),
    );
    assert.ok(blocks.length > 0);
    const watch = blocks.flatMap((b) => b.elements ?? []).find((e) => e.action_id === 'alert_watch');
    assert.equal(watch.value, '9');
  });
});
