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

const policeLead = (id, title) => ({
  item: { eventItemId: id, title, eventBodyName: 'COMMON COUNCIL', eventDate: '2026-06-23' },
  tags: [{ kind: 'accountability' }],
  score: 5,
  reasons: [],
});

describe('storyLeadsSection — clustered render (MOO-128)', () => {
  const fourPolice = [
    policeLead(1, 'A motion modifying Police use of force SOP'),
    policeLead(2, 'Communication on police pursuit policies'),
    policeLead(3, 'Motion modifying Police SOP 660 pursuits'),
    policeLead(4, 'Fire and Police Commission training communication'),
  ];

  it('collapses the 4 police items into ONE cluster header with the count', () => {
    const text = JSON.stringify(storyLeadsSection(fourPolice, 'en'));
    assert.equal((text.match(/Police & public safety/g) || []).length, 1);
    assert.match(text, /4 items/);
    for (const t of ['use of force', 'pursuit policies', 'SOP 660', 'training']) assert.match(text, new RegExp(t));
  });

  it('shows the shared tag once at the cluster level, not per member', () => {
    const text = JSON.stringify(storyLeadsSection(fourPolice, 'en'));
    assert.equal((text.match(/Power & accountability/g) || []).length, 1);
  });

  it('renders a 📍 District chip when the cluster shares a district', () => {
    const district7 = [
      policeLead(1, 'Police matter (7th Aldermanic District)'),
      policeLead(2, 'Police pursuit (7th Aldermanic District)'),
    ];
    assert.match(JSON.stringify(storyLeadsSection(district7, 'en')), /District 7/);
  });

  it('a singleton still renders title + tags + watch', () => {
    const single = [
      {
        item: { eventItemId: 9, title: 'tavern liquor license', eventBodyName: 'LICENSES' },
        tags: [{ kind: 'conflict' }],
        score: 3,
        reasons: [],
      },
    ];
    const text = JSON.stringify(storyLeadsSection(single, 'en'));
    assert.match(text, /tavern liquor license/);
    assert.match(text, /story_watch/);
  });

  it('caps to the top 3 entries and shows a "ver más" instruction for the rest', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({
      item: {
        eventItemId: i,
        title: `tavern liquor license ${i}`,
        eventBodyName: `LICENSES ${i}`,
        eventDate: '2026-06-2' + i,
      },
      tags: [{ kind: 'conflict' }],
      score: 6 - i,
      reasons: [],
    }));
    const text = JSON.stringify(storyLeadsSection(many, 'en'));
    assert.match(text, /3 (?:more|más)/);
    assert.match(text, /\/gavel stories/);
    // the lower-ranked entries are genuinely withheld, not just counted
    assert.match(text, /tavern liquor license 0/);
    assert.doesNotMatch(text, /tavern liquor license 3/);
  });

  it('bilingual: ES theme label', () => {
    const text = JSON.stringify(storyLeadsSection(fourPolice, 'es'));
    assert.match(text, /Policía y seguridad/);
  });
});
