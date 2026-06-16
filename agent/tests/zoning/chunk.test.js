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

test('splits an oversized section into multiple chunks under the embedding limit, same section id', () => {
  const huge = `295-505. RT4 District. ${'word '.repeat(12000)}END`; // ~60k chars
  const chunks = chunkSections(huge, meta);
  assert.ok(chunks.length > 1, 'expected the oversized section to split into parts');
  assert.ok(
    chunks.every((c) => c.section === '295-505'),
    'all parts keep the section id for citation',
  );
  assert.ok(
    chunks.every((c) => c.text.length <= 24000),
    'every part is under the size limit',
  );
  assert.match(chunks.at(-1).text, /END/); // no content dropped
});

test('parses headings in space-joined pdfjs output and ignores cross-references', () => {
  // pdfjs joins every text item on a page with spaces — there are NO line breaks
  // to anchor a heading on, and section numbers also appear as cross-references
  // inside a section's body. Headings ascend; a non-ascending 295-NNN is a ref.
  const pdfish =
    'Zoning 295-501 -771- 4/22/2025 SUBCHAPTER 5 RESIDENTIAL ' +
    '295-501. Purpose. Protects neighborhood character as provided in 295-501. ' +
    '295-505. RT4 Two-Family Residential. 1. PERMITTED USES. Two-family dwellings permitted. See also 295-501. ' +
    '2. DIMENSIONAL STANDARDS. Minimum lot area is 4000 square feet. ' +
    '295-509. RM Districts. Multi-family dwellings permitted.';
  const chunks = chunkSections(pdfish, meta);
  assert.deepEqual(
    chunks.map((c) => c.section),
    ['295-501', '295-505', '295-509'],
  );
  const rt4 = chunks.find((c) => c.section === '295-505');
  assert.match(rt4.text, /PERMITTED USES/);
  assert.match(rt4.text, /4000 square feet/); // sub-paragraphs stay with their section
  assert.match(rt4.text, /See also 295-501/); // an embedded cross-reference is kept, not split out
});
