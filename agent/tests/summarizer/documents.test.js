import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildDocumentBlocks, MAX_DOCUMENTS } from '../../summarizer/documents.js';

test('builds the Anthropic base64 document block shape', () => {
  const { blocks } = buildDocumentBlocks([{ base64: 'QUJD', mediaType: 'application/pdf' }]);
  assert.deepEqual(blocks, [
    { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'QUJD' } },
  ]);
});

test('defaults media type to application/pdf', () => {
  const { blocks } = buildDocumentBlocks([{ base64: 'QUJD' }]);
  assert.equal(blocks[0].source.media_type, 'application/pdf');
});

test('builds an image block (for OCR via Claude vision) when the media type is an image', () => {
  const { blocks } = buildDocumentBlocks([{ base64: 'QUJD', mediaType: 'image/jpeg' }]);
  assert.deepEqual(blocks, [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' } }]);
});

test('no documents → empty blocks, never throws', () => {
  assert.deepEqual(buildDocumentBlocks().blocks, []);
  assert.deepEqual(buildDocumentBlocks([]).blocks, []);
});

test('skips entries missing base64 instead of throwing', () => {
  const { blocks, skipped } = buildDocumentBlocks([{ mediaType: 'application/pdf' }]);
  assert.equal(blocks.length, 0);
  assert.equal(skipped[0].reason, 'missing-base64');
});

test('enforces the document-count cap', () => {
  const many = Array.from({ length: MAX_DOCUMENTS + 2 }, () => ({ base64: 'QUJD' }));
  const { blocks, skipped } = buildDocumentBlocks(many);
  assert.equal(blocks.length, MAX_DOCUMENTS);
  assert.equal(skipped.filter((s) => s.reason === 'over-document-cap').length, 2);
});

test('skips an oversized document (token-budget guard)', () => {
  const huge = 'A'.repeat(9 * 1024 * 1024); // ~6.75 MB decoded, over the cap
  const { blocks, skipped } = buildDocumentBlocks([{ base64: huge }]);
  assert.equal(blocks.length, 0);
  assert.equal(skipped[0].reason, 'over-size-cap');
});
