import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runZoningAnswer } from '../../agent/zoning/search.js';

const deps = {
  resolveZoning: async () => ({ zoning: 'RT4', district: '12' }),
  classToFamily: () => 'residential',
  embedQuery: async () => Array(1536).fill(0.1),
  search: async ({ family }) => [
    {
      section: '295-505',
      parent: 'Subchapter 5 — Residential Districts',
      text: 'Two-family dwellings are permitted in RT4.',
      sourceUrl: 'https://city.milwaukee.gov/x/CH295-sub5.pdf',
      _family: family,
    },
  ],
};

test('returns formatted chunks with section ids and a cite instruction', async () => {
  const text = await runZoningAnswer({ address: '2000 S 13th St', question: 'can I build a duplex?' }, deps);
  assert.match(text, /295-505/);
  assert.match(text, /RT4/);
  assert.match(text, /cite/i);
  assert.match(text, /city\.milwaukee\.gov/);
});

test('passes the resolved family into search', async () => {
  let seen;
  await runZoningAnswer(
    { address: 'x', question: 'y' },
    {
      ...deps,
      search: async (a) => {
        seen = a.family;
        return deps.search(a);
      },
    },
  );
  assert.equal(seen, 'residential');
});

test('address with no parcel → information-unavailable text, no embed/search call', async () => {
  let embedded = false;
  const text = await runZoningAnswer(
    { address: 'nowhere', question: 'q' },
    {
      ...deps,
      resolveZoning: async () => null,
      embedQuery: async () => {
        embedded = true;
        return [];
      },
    },
  );
  assert.match(text, /couldn.t|unavailable|no .*parcel/i);
  assert.equal(embedded, false);
});

test('unmapped zoning class → general-scope only, discloses the class was not mapped', async () => {
  const text = await runZoningAnswer(
    { address: 'x', question: 'q' },
    {
      ...deps,
      resolveZoning: async () => ({ zoning: 'ZZ9', district: '1' }),
      classToFamily: () => null,
    },
  );
  assert.match(text, /ZZ9/);
  assert.match(text, /general/i);
});

test('no chunks found → tells the agent to fall back to prose', async () => {
  const text = await runZoningAnswer({ address: 'x', question: 'q' }, { ...deps, search: async () => [] });
  assert.match(text, /no .*zoning|fall back|prose/i);
});
