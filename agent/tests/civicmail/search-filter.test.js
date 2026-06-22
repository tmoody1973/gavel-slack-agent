import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { matchesQuery, mergeSearchResults, parseSearchTerm, refineResults } from '../../civicmail/search-filter.js';

describe('parseSearchTerm', () => {
  it('strips surrounding quotes and marks the query exact (a phrase)', () => {
    const p = parseSearchTerm('"data center"');
    assert.equal(p.display, 'data center');
    assert.equal(p.exact, true);
    assert.equal(p.phrase, 'data center');
  });

  it('handles smart/curly quotes too', () => {
    assert.equal(parseSearchTerm('“data center”').exact, true);
    assert.equal(parseSearchTerm('“data center”').display, 'data center');
  });

  it('splits an unquoted multi-word query into tokens', () => {
    const p = parseSearchTerm('food tavern');
    assert.equal(p.exact, false);
    assert.deepEqual(p.tokens, ['food', 'tavern']);
  });
});

describe('matchesQuery', () => {
  it('exact query requires the contiguous phrase', () => {
    const p = parseSearchTerm('"data center"');
    assert.equal(matchesQuery('a proposed data center on the north side', p), true);
    assert.equal(matchesQuery('health data from the assessment center', p), false);
  });

  it('unquoted multi-word requires ALL tokens (AND), not any', () => {
    const p = parseSearchTerm('food tavern');
    assert.equal(matchesQuery('Class B Tavern serving food', p), true);
    assert.equal(matchesQuery('Class B Tavern License', p), false); // missing "food"
  });
});

describe('refineResults — tighten multi-word/quoted, keep single-word typo-tolerant', () => {
  const rows = [
    { searchText: 'Mental Health Board Finance Committee at the Coggs Center' },
    { searchText: 'A proposed data center rezoning' },
  ];

  it('drops loose OR-matches for a quoted phrase that no row actually contains', () => {
    const p = parseSearchTerm('"data center"');
    const refined = refineResults([rows[0]], p);
    assert.equal(refined.length, 0, 'a row with only "center" is not a data-center match');
  });

  it('keeps a row that does contain the phrase', () => {
    const p = parseSearchTerm('"data center"');
    assert.equal(refineResults(rows, p).length, 1);
  });

  it('passes single-word queries through untouched (Convex stays typo-tolerant)', () => {
    const p = parseSearchTerm('tavern');
    const candidates = [{ searchText: 'unrelated' }];
    assert.equal(refineResults(candidates, p).length, 1, 'single word is not post-filtered');
  });
});

describe('mergeSearchResults — hybrid keyword + semantic', () => {
  const kw = [{ messageId: 'a' }, { messageId: 'b' }];
  const sem = [{ messageId: 'b' }, { messageId: 'c' }, { messageId: 'd' }];

  it('puts keyword (precise) matches first, then semantic neighbors', () => {
    const merged = mergeSearchResults(kw, sem);
    assert.deepEqual(
      merged.map((r) => r.messageId),
      ['a', 'b', 'c', 'd'],
    );
  });

  it('dedups a row that appears in both lanes (keeps the keyword position)', () => {
    const merged = mergeSearchResults(kw, sem);
    assert.equal(merged.filter((r) => r.messageId === 'b').length, 1);
  });

  it('respects the display limit', () => {
    const merged = mergeSearchResults(kw, sem, { limit: 3 });
    assert.deepEqual(
      merged.map((r) => r.messageId),
      ['a', 'b', 'c'],
    );
  });
});
