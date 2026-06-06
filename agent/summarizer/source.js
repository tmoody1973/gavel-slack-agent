/**
 * Assemble the text a summarizer should read from a civic matter.
 *
 * Legistar titles are terse; the real substance lives in MatterTexts and
 * attachment PDFs. This builds a labeled context block from whatever is
 * present, in priority order (title → MatterText → first attachment), and
 * reports which sources contributed so callers can log provenance.
 *
 * @typedef {Object} MatterAttachment
 * @property {string} [name]
 * @property {string} [text]
 *
 * @typedef {Object} Matter
 * @property {string} [fileNumber]
 * @property {string} title
 * @property {string} [matterText]
 * @property {MatterAttachment[]} [attachments]
 *
 * @param {Matter} matter
 * @returns {{ contextText: string, sourcesUsed: string[] }}
 */
export function buildSourceContext(matter) {
  const sections = [];
  const sourcesUsed = [];

  const title = (matter.title ?? '').trim();
  const titleHeader = matter.fileNumber ? `File ${matter.fileNumber}: ${title}` : title;
  sections.push(`TITLE: ${titleHeader}`);
  sourcesUsed.push('title');

  const matterText = (matter.matterText ?? '').trim();
  if (matterText) {
    sections.push(`TEXT: ${matterText}`);
    sourcesUsed.push('matterText');
  }

  const attachmentText = (matter.attachments?.[0]?.text ?? '').trim();
  if (attachmentText) {
    sections.push(`ATTACHMENT: ${attachmentText}`);
    sourcesUsed.push('attachment');
  }

  return { contextText: sections.join('\n\n'), sourcesUsed };
}
