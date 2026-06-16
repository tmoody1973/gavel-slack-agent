// Civic notices carry small PDFs (a hearing agenda is ~100KB), but a full agenda
// packet could blow the token budget — so cap count and size. Claude reads PDFs
// natively as `document` content blocks, no pdf-parse dependency.
export const MAX_DOCUMENTS = 2;
export const MAX_PDF_BYTES = 6 * 1024 * 1024; // ~6 MB — generous for notices, safe on budget

/** Approximate decoded byte size of a base64 string without decoding it. */
function base64Bytes(base64) {
  return Math.floor((base64.length * 3) / 4);
}

/**
 * Turn `[{ base64, mediaType }]` into Anthropic `document` content blocks, within
 * the count/size caps. Oversized or malformed entries are skipped (not thrown) so
 * a fat attachment degrades to the text-only summary rather than failing the run.
 *
 * @param {Array<{ base64?: string, mediaType?: string }>} [documents]
 * @returns {{ blocks: object[], skipped: Array<{ reason: string }> }}
 */
export function buildDocumentBlocks(documents) {
  const blocks = [];
  const skipped = [];

  for (const doc of documents ?? []) {
    if (blocks.length >= MAX_DOCUMENTS) {
      skipped.push({ reason: 'over-document-cap' });
      continue;
    }
    if (!doc?.base64) {
      skipped.push({ reason: 'missing-base64' });
      continue;
    }
    if (base64Bytes(doc.base64) > MAX_PDF_BYTES) {
      skipped.push({ reason: 'over-size-cap' });
      continue;
    }
    blocks.push({
      type: 'document',
      source: {
        type: 'base64',
        media_type: doc.mediaType ?? 'application/pdf',
        data: doc.base64,
      },
    });
  }

  return { blocks, skipped };
}
