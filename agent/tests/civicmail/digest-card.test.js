import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildFromTheCityCard } from '../../civicmail/digest-card.js';

const aggregate = (overrides = {}) => ({
  total: 9,
  suppressed: 1,
  categoryCounts: { neighborhood_services: 4, licenses: 3, meetings: 2 },
  breakdowns: {
    neighborhood_services: [
      { label: 'ROW Excavation Utility', count: 2 },
      { label: 'Code Enforcement', count: 1 },
      { label: 'Commercial Alteration Permit', count: 1 },
    ],
    licenses: [
      { label: 'Food Dealer Retail', count: 2 },
      { label: 'Class B Tavern License', count: 1 },
    ],
  },
  highlights: [
    { category: 'meetings', subject: 'Zoning, Neighborhoods and Development Committee 6/16' },
    {
      category: 'licenses',
      subject: 'APPLICATION Class B Tavern License',
      business: 'COZUMEL III, LLC',
      district: '12',
      detailUrl: 'http://example.gov/lic',
    },
  ],
  recurringEntities: [{ entity: 'COZUMEL III, LLC', count: 2 }],
  ...overrides,
});

const briefing = {
  en: {
    briefing: 'The city logged 4 permit records and 3 license actions this week.',
    pattern: 'Cozumel III LLC filed twice.',
  },
  es: {
    briefing: 'La ciudad registró 4 permisos y 3 licencias esta semana.',
    pattern: 'Cozumel III LLC presentó dos solicitudes.',
  },
};

const text = (card) => JSON.stringify(card.blocks);

describe('buildFromTheCityCard — structure + headline', () => {
  it('leads with a "From the city" header', () => {
    const card = buildFromTheCityCard({ aggregate: aggregate(), briefing, language: 'en' });
    assert.equal(card.blocks[0].type, 'header');
    assert.match(card.blocks[0].text.text, /From the city/i);
  });

  it('shows the category totals headline', () => {
    const card = buildFromTheCityCard({ aggregate: aggregate(), briefing, language: 'en' });
    assert.match(text(card), /4/);
    assert.match(text(card), /3/);
    assert.match(text(card), /licens/i);
  });

  it('renders the EN briefing and the pattern line', () => {
    const card = buildFromTheCityCard({ aggregate: aggregate(), briefing, language: 'en' });
    assert.match(text(card), /4 permit records and 3 license actions/);
    assert.match(text(card), /Cozumel III LLC filed twice/);
  });

  it('folds routine into a counts breakdown (not one line per record)', () => {
    const card = buildFromTheCityCard({ aggregate: aggregate(), briefing, language: 'en' });
    assert.match(text(card), /ROW Excavation Utility/);
    assert.match(text(card), /Food Dealer Retail/);
  });

  it('has a non-empty plain-text fallback', () => {
    const card = buildFromTheCityCard({ aggregate: aggregate(), briefing, language: 'en' });
    assert.ok(typeof card.text === 'string' && card.text.length > 0);
    assert.match(card.text, /From the city/i);
  });
});

describe('buildFromTheCityCard — actionable highlights', () => {
  it('surfaces the meeting and the license highlight', () => {
    const card = buildFromTheCityCard({ aggregate: aggregate(), briefing, language: 'en' });
    assert.match(text(card), /Zoning, Neighborhoods and Development Committee/);
    assert.match(text(card), /COZUMEL III, LLC/);
  });

  it('keeps the "How to be heard" civic-action footer the PRD protects', () => {
    const card = buildFromTheCityCard({ aggregate: aggregate(), briefing, language: 'en' });
    assert.match(text(card), /How to be heard/i);
  });

  it('offers a real, wired affordance (/gavel watch) to follow up on the folded routine', () => {
    // The folded routine is not posted individually, so the card must point at a
    // command that actually exists — /gavel watch is wired; /gavel search is NOT.
    const card = buildFromTheCityCard({ aggregate: aggregate(), briefing, language: 'en' });
    assert.match(text(card), /\/gavel watch/);
    assert.doesNotMatch(text(card), /\/gavel search/);
  });
});

describe('buildFromTheCityCard — bilingual + honesty', () => {
  it('English card does NOT include the Spanish section', () => {
    const card = buildFromTheCityCard({ aggregate: aggregate(), briefing, language: 'en' });
    assert.doesNotMatch(text(card), /En español/);
  });

  it('Spanish card appends the ES briefing + pattern', () => {
    const card = buildFromTheCityCard({ aggregate: aggregate(), briefing, language: 'es' });
    assert.match(text(card), /En español/);
    assert.match(text(card), /La ciudad registró/);
    assert.match(text(card), /presentó dos solicitudes/);
  });

  it('discloses the sample-week provenance (real-vs-cached honesty contract)', () => {
    const card = buildFromTheCityCard({
      aggregate: aggregate(),
      briefing,
      language: 'en',
      snapshotNote: 'sample week of 2026-06-10',
    });
    assert.match(text(card).toLowerCase(), /sample week/);
  });
});
