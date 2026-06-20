import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { storyLeadCards, storyLeadsSection } from '../../blockkit/story-leads.js';

const lead = (overrides = {}) => ({
  item: {
    eventItemId: 2,
    title: 'An ordinance creating a police surveillance oversight board',
    eventBodyName: 'Common Council',
    eventDate: '2026-06-25',
    walkOnFlag: true,
  },
  tags: [{ kind: 'accountability' }, { kind: 'novelty' }, { kind: 'anomaly', detail: 'walkOn' }],
  score: 10,
  reasons: [{ kind: 'walkOn' }],
  ...overrides,
});

describe('storyLeadsSection — App Home reporter feed (tags-only, LLM-free)', () => {
  it('renders the heading + each lead title + its newsworthiness tags', () => {
    const blocks = storyLeadsSection([lead()], 'en');
    const text = JSON.stringify(blocks);
    assert.match(text, /Story leads this week/);
    assert.match(text, /police surveillance oversight board/);
    assert.match(text, /Power & accountability/);
    assert.match(text, /Added late/); // anomaly:walkOn label
  });

  it('every lead carries a story_watch button pre-filled with the title', () => {
    const blocks = storyLeadsSection([lead()], 'en');
    const watch = blocks.find((b) => b.accessory?.action_id === 'story_watch');
    assert.ok(watch, 'story_watch button present');
    assert.match(watch.accessory.value, /surveillance oversight board/);
  });

  it('frames them as leads, not conclusions (the safety line)', () => {
    const text = JSON.stringify(storyLeadsSection([lead()], 'en'));
    assert.match(text, /worth a look|Leads, not/i);
  });

  it('empty → a friendly quiet-week line, no crash', () => {
    const text = JSON.stringify(storyLeadsSection([], 'en'));
    assert.match(text, /Story leads this week/);
    assert.match(text.toLowerCase(), /quiet/);
  });

  it('bilingual: ES labels when the channel is Spanish', () => {
    const text = JSON.stringify(storyLeadsSection([lead()], 'es'));
    assert.match(text, /Reportajes|Pistas|Añadido tarde/);
    // committee + proper names stay English
    assert.match(text, /Common Council|surveillance oversight board/);
  });
});

describe('storyLeadCards — /gavel stories response (with grounded angle + starting points)', () => {
  const enriched = () =>
    lead({
      angle: {
        hook: 'A new board would scrutinize how police buy surveillance tech.',
        whyStory: 'First civilian check on a fast-growing budget.',
      },
      member: {
        name: 'José G. Pérez',
        title: 'Alderman, District 12',
        imageUrl: 'http://img/p.png',
        email: 'p@milwaukee.gov',
        phone: '414-555-0100',
      },
      fileNumber: '230001',
      hasTranscript: true,
    });

  it('shows the grounded hook and why-it-is-a-story', () => {
    const text = JSON.stringify(storyLeadCards([enriched()], { label: 'this week', language: 'en' }));
    assert.match(text, /scrutinize how police buy surveillance/);
    assert.match(text, /First civilian check/);
  });

  it('links the reporting starting points: sponsor contact, file number, transcript hint', () => {
    const text = JSON.stringify(storyLeadCards([enriched()], { label: 'this week', language: 'en' }));
    assert.match(text, /José G\. Pérez/);
    assert.match(text, /p@milwaukee\.gov/);
    assert.match(text, /230001/);
    assert.match(text.toLowerCase(), /transcript/);
  });

  it('omits the transcript hint when none is available', () => {
    const noTx = { ...enriched(), hasTranscript: false };
    const text = JSON.stringify(storyLeadCards([noTx], { label: 'this week', language: 'en' }));
    assert.doesNotMatch(text.toLowerCase(), /search transcripts|transcript memory/);
  });

  it('a lead whose angle failed (null) still renders title + tags (degraded, never blank)', () => {
    const degraded = { ...enriched(), angle: null };
    const text = JSON.stringify(storyLeadCards([degraded], { label: 'this week', language: 'en' }));
    assert.match(text, /surveillance oversight board/);
    assert.match(text, /Power & accountability/);
  });

  it('header names the filter label and frames it as leads', () => {
    const text = JSON.stringify(storyLeadCards([enriched()], { label: 'Bars & licenses', language: 'en' }));
    assert.match(text, /Bars & licenses/);
    assert.match(text.toLowerCase(), /lead|worth a look/);
  });
});
