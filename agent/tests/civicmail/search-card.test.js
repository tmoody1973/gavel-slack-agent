import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildSearchResultsCard } from '../../civicmail/search-card.js';

const result = (over = {}) => ({
  category: 'licenses',
  subject: 'RENEWAL Class B Tavern License',
  district: '12',
  recordNumber: undefined,
  business: 'COZUMEL III, LLC',
  detailUrl: 'http://example.gov/lic',
  receivedAt: '2026-06-10T10:00:00Z',
  ...over,
});

const text = (card) => JSON.stringify(card.blocks);

describe('buildSearchResultsCard', () => {
  it('leads with the search term', () => {
    const card = buildSearchResultsCard({ term: 'cozumel', results: [result()] });
    assert.match(text(card), /cozumel/i);
  });

  it('renders each matching record (subject + entity + district)', () => {
    const card = buildSearchResultsCard({ term: 'cozumel', results: [result()] });
    assert.match(text(card), /Class B Tavern License/);
    assert.match(text(card), /COZUMEL III, LLC/);
    assert.match(text(card), /District 12/);
  });

  it('shows a helpful empty state when nothing matches', () => {
    const card = buildSearchResultsCard({ term: 'nothinghere', results: [] });
    assert.match(text(card).toLowerCase(), /no records|nothing/);
    assert.match(text(card), /nothinghere/);
  });

  it('caps the rendered results and notes how many more matched', () => {
    const many = Array.from({ length: 12 }, (_, i) => result({ subject: `Record ${i}`, business: undefined }));
    const card = buildSearchResultsCard({ term: 'permit', results: many, max: 5 });
    assert.match(text(card), /\+7 more/);
  });

  it('gives each result a Read button that opens the record modal', () => {
    const card = buildSearchResultsCard({ term: 'cozumel', results: [result({ messageId: '<m9@city>' })] });
    const button = card.blocks
      .flatMap((b) => (b.accessory ? [b.accessory] : []))
      .find((el) => el.action_id === 'open_civic_record');
    assert.ok(button, 'a result section carries an open_civic_record button');
    assert.equal(button.value, '<m9@city>');
  });

  it('has a non-empty plain-text fallback', () => {
    const card = buildSearchResultsCard({ term: 'cozumel', results: [result()] });
    assert.ok(card.text.length > 0);
  });

  it('localizes the empty state to Spanish', () => {
    const card = buildSearchResultsCard({ term: 'x', results: [], language: 'es' });
    assert.match(text(card).toLowerCase(), /ningún|no se encontr|sin resultados/);
  });
});
