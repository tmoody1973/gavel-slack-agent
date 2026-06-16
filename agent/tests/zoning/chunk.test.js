import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chunkSections } from '../../zoning/chunk.js';

const meta = {
  parent: 'Subchapter 5 — Residential Districts',
  family: 'residential',
  scope: 'district',
  sourceUrl: 'https://city.milwaukee.gov/x/CH295-sub5.pdf',
};

const text = [
  '295-501. Purpose. The residential districts are established to...',
  'protect neighborhood character.',
  '295-505. RT4 Two-Family Residential. 1. PERMITTED USES. Two-family dwellings are permitted.',
  '2. DIMENSIONAL STANDARDS. Minimum lot area is 4000 square feet.',
  '295-509. RM Districts. Multi-family dwellings are permitted.',
].join('\n');

test('splits into one chunk per 295-NNN section, carrying the section id', () => {
  const chunks = chunkSections(text, meta);
  assert.deepEqual(
    chunks.map((c) => c.section),
    ['295-501', '295-505', '295-509'],
  );
});

test('each chunk carries family, scope, parent, sourceUrl and the section text', () => {
  const rt4 = chunkSections(text, meta).find((c) => c.section === '295-505');
  assert.equal(rt4.family, 'residential');
  assert.equal(rt4.scope, 'district');
  assert.equal(rt4.parent, meta.parent);
  assert.equal(rt4.sourceUrl, meta.sourceUrl);
  assert.match(rt4.text, /PERMITTED USES/);
  assert.match(rt4.text, /4000 square feet/);
});

test('a table source becomes one intact chunk, never split on 295-NNN', () => {
  const tableMeta = { ...meta, parent: 'Chapter 295 — Zoning Table', scope: 'table', family: 'general' };
  const tableText = '295-Table. RT4 | min lot 4000 | 295-505 ref | RM | min lot 2000';
  const chunks = chunkSections(tableText, tableMeta);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].section, '295-Table');
  assert.match(chunks[0].text, /RM \| min lot 2000/);
});

test('text before the first section is ignored (page headers/footers)', () => {
  const chunks = chunkSections('Zoning 295-501 -771- 4/22/2025\n295-501. Purpose. Body.', meta);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].section, '295-501');
});
