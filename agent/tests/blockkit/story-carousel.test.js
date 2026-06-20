import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { storyCarousel } from '../../blockkit/story-carousel.js';

const lead = (over = {}) => ({
  item: {
    eventItemId: 7,
    title: 'An ordinance creating a police surveillance oversight board',
    eventBodyName: 'COMMON COUNCIL',
    eventDate: '2026-06-23',
  },
  tags: [{ kind: 'accountability' }, { kind: 'novelty' }],
  score: 10,
  angle: {
    hook: 'A new board would scrutinize how police buy surveillance tech.',
    whyStory: 'First civilian check on a fast-growing budget.',
  },
  ...over,
});

const carouselOf = (blocks) => blocks.find((b) => b.type === 'carousel');

describe('storyCarousel — /gavel stories swipeable cards (MOO-130)', () => {
  it('renders a carousel block of card elements', () => {
    const blocks = storyCarousel([lead()], { label: 'this week', language: 'en' });
    const carousel = carouselOf(blocks);
    assert.ok(carousel, 'carousel block present');
    assert.equal(carousel.elements.length, 1);
    assert.equal(carousel.elements[0].type, 'card');
  });

  it('each card carries title, committee·date subtitle, and the grounded angle as body', () => {
    const card = carouselOf(storyCarousel([lead()], { label: 'this week', language: 'en' })).elements[0];
    assert.match(card.title.text, /surveillance oversight board/);
    assert.match(card.subtitle.text, /COMMON COUNCIL/);
    assert.match(card.subtitle.text, /Jun 23/);
    assert.match(card.body.text, /scrutinize how police buy surveillance/);
  });

  it('each card has a Watch (story_watch) + Ask Gavel (story_ask) action', () => {
    const card = carouselOf(storyCarousel([lead()], { label: 'x', language: 'en' })).elements[0];
    const byId = Object.fromEntries(card.actions.map((a) => [a.action_id, a]));
    assert.ok(byId.story_watch, 'watch button');
    assert.match(byId.story_watch.value, /surveillance oversight board/); // prefill for add-watch modal
    assert.ok(byId.story_ask, 'ask button');
    assert.equal(byId.story_ask.value, '7'); // eventItemId for the primed DM
    assert.ok(card.actions.length <= 3, 'cards allow at most 3 buttons');
  });

  it('clamps title ≤150, subtitle ≤150, body ≤200 (Slack card limits)', () => {
    const longLead = lead({
      item: {
        eventItemId: 1,
        title: 'T'.repeat(300),
        eventBodyName: 'C'.repeat(300),
        eventDate: '2026-06-23',
      },
      angle: { hook: 'H'.repeat(300), whyStory: 'W'.repeat(300) },
    });
    const card = carouselOf(storyCarousel([longLead], { label: 'x', language: 'en' })).elements[0];
    assert.ok(card.title.text.length <= 150, `title ${card.title.text.length}`);
    assert.ok(card.subtitle.text.length <= 150, `subtitle ${card.subtitle.text.length}`);
    assert.ok(card.body.text.length <= 200, `body ${card.body.text.length}`);
  });

  it('caps at 10 cards (carousel max)', () => {
    const many = Array.from({ length: 15 }, (_, i) => lead({ item: { eventItemId: i, title: `lead ${i}`, eventBodyName: 'C', eventDate: '2026-06-23' } }));
    const carousel = carouselOf(storyCarousel(many, { label: 'x', language: 'en' }));
    assert.ok(carousel.elements.length <= 10, `got ${carousel.elements.length}`);
  });

  it('a lead whose angle failed (null) still gets a non-empty card body (tags fallback)', () => {
    const card = carouselOf(storyCarousel([lead({ angle: null })], { label: 'x', language: 'en' })).elements[0];
    assert.ok(card.body.text.length > 0, 'body never blank');
    assert.match(card.body.text, /accountability|Power|Money|First/i);
  });

  it('names the filter label in a header and frames them as leads', () => {
    const blocks = storyCarousel([lead()], { label: 'Bars & licenses', language: 'en' });
    const text = JSON.stringify(blocks);
    assert.match(text, /Bars & licenses/);
    assert.match(text.toLowerCase(), /lead|worth a look/);
  });

  it('bilingual: ES action labels', () => {
    const card = carouselOf(storyCarousel([lead()], { label: 'x', language: 'es' })).elements[0];
    const text = JSON.stringify(card.actions);
    assert.match(text, /Seguir/);
    assert.match(text, /Pregúntale a Gavel|Preguntar/);
  });

  it('empty leads → no carousel block, a friendly line instead', () => {
    const blocks = storyCarousel([], { label: 'this week', language: 'en' });
    assert.equal(carouselOf(blocks), undefined);
    assert.match(JSON.stringify(blocks).toLowerCase(), /quiet|no story leads/);
  });
});
