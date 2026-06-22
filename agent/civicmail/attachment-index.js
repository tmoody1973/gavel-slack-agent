// Attachment text indexing (MOO-153). E-Notify PDFs (agendas, meeting packets,
// statements, event advisories) carry the real substance, but the search index only
// covers subject + body. This module folds extracted attachment text into the
// searchText field so `/gavel search` reaches inside the documents.
//
// Extraction reuses the summarizer's Claude document-block path (no pdf-parse
// dependency) — the impure call is injected as `generate`; the prompt/schema/fold
// stay pure and testable.

const PER_ATTACHMENT_CAP = 8000;
const TOTAL_SEARCHTEXT_CAP = 24000;

/** Hard-cap a string to `max` characters (Convex document + search-index budget). */
function truncate(text, max) {
  return text.length > max ? text.slice(0, max) : text;
}

/**
 * Compose the full-text search field from the email parts. Without attachment text
 * this is exactly the original `subject + body` (behavior preserved); with it, the
 * (capped) attachment text is appended so the PDF contents become searchable.
 *
 * @param {{ subject?: string, bodyText?: string, attachmentText?: string }} parts
 * @param {{ perAttachmentCap?: number, totalCap?: number }} [opts]
 * @returns {string}
 */
export function composeSearchText({ subject = '', bodyText = '', attachmentText = '' }, opts = {}) {
  const perCap = opts.perAttachmentCap ?? PER_ATTACHMENT_CAP;
  const totalCap = opts.totalCap ?? TOTAL_SEARCHTEXT_CAP;
  const attachment = attachmentText ? truncate(attachmentText, perCap) : '';
  const composed = [subject, bodyText, attachment].filter(Boolean).join(' ').trim();
  return truncate(composed, totalCap);
}

/** JSON Schema for the extraction boundary — a single searchable-text field. */
export const ATTACHMENT_TEXT_SCHEMA = {
  type: 'object',
  properties: { text: { type: 'string' } },
  required: ['text'],
  additionalProperties: false,
};

/**
 * System prompt for attachment extraction: transcription for search, not a summary.
 * @param {string[]} [filenames]
 * @returns {string}
 */
export function buildAttachmentExtractionPrompt(filenames = []) {
  const names = filenames.length ? filenames.join(', ') : 'the attached document(s)';
  return `Transcribe the substantive, searchable text from ${names} for a full-text search index. \
Capture proper names, organizations, addresses, file/record numbers, agenda item titles, dollar \
amounts, dates, and key topics — as continuous plain text. Do NOT summarize, editorialize, or omit \
names; this is for search recall, so transcribe the real content verbatim where practical. \
Output AT MOST ~1200 words; for a long packet, prioritize the names, addresses, item titles, and \
key topics over boilerplate. If a document is a scanned image with no readable text, return an \
empty string.`;
}

/**
 * Extract searchable text from PDF attachments via the injected Claude generator
 * (built with createClaudeGenerate({ schema: ATTACHMENT_TEXT_SCHEMA })). Returns ''
 * when there are no readable document blocks, so a no-attachment row is a no-op.
 *
 * @param {{
 *   documents: Array<{ base64: string, mediaType: string }>,
 *   filenames?: string[],
 *   generate: (input: {system: string, prompt: string, documents: object[]}) => Promise<{text: string}>,
 * }} input
 * @returns {Promise<string>}
 */
export async function extractAttachmentText({ documents, filenames = [], generate }) {
  if (!documents || documents.length === 0) return '';
  const system = buildAttachmentExtractionPrompt(filenames);
  const result = await generate({ system, prompt: 'Transcribe the document text for search.', documents });
  return typeof result?.text === 'string' ? result.text.trim() : '';
}
