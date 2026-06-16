/**
 * A section heading: "295-NNN." followed by a Title-cased section name, and NOT
 * the Wisconsin cross-reference form "s. 295-NNN" / "ss. 295-NNN". pdfjs
 * space-joins page text (newlines only between pages), so headings sit mid-line
 * and the same number recurs as references — the capital-letter lookahead plus
 * the "s. " negative lookbehind distinguish a real heading from a citation.
 */
const HEADING = /(?<!s\.\s)(295-\d+)\.\s+(?=[A-Z])/g;

/** Max chars per chunk — stays well under text-embedding-3-small's ~8191-token input limit. */
const MAX_CHARS = 24000;

/**
 * Split extracted Ch.295 text into structure-aware chunks. Table sources
 * (`meta.scope === 'table'`) are kept intact as a single chunk. Otherwise each
 * `295-NNN.` heading starts a new chunk that runs until the next heading, so
 * sub-paragraphs (1. INTRODUCTION, 2. NUMBER OF SPACES, ...) stay with their
 * section. A section number is recorded once (first heading-shaped occurrence
 * wins); later recurrences are cross-references folded into the body. Text
 * before the first heading (page furniture) is dropped.
 * @param {string} text
 * @param {{parent:string, family:string, scope:string, sourceUrl:string}} meta
 * @returns {Array<{section:string, text:string, parent:string, family:string, scope:string, sourceUrl:string}>}
 */
export function chunkSections(text, meta) {
  const base = { parent: meta.parent, family: meta.family, scope: meta.scope, sourceUrl: meta.sourceUrl };
  if (meta.scope === 'table') {
    return [{ section: '295-Table', text: collapse(text), ...base }];
  }
  const seen = new Set();
  const headings = [];
  for (const match of text.matchAll(HEADING)) {
    if (seen.has(match[1])) continue;
    seen.add(match[1]);
    headings.push({ section: match[1], index: match.index });
  }
  const chunks = [];
  for (let i = 0; i < headings.length; i++) {
    const end = i + 1 < headings.length ? headings[i + 1].index : text.length;
    const body = collapse(text.slice(headings[i].index, end));
    for (const part of splitOnLimit(body)) {
      chunks.push({ section: headings[i].section, text: part, ...base });
    }
  }
  return chunks;
}

/** Collapse runs of whitespace/newlines to single spaces; trim. */
function collapse(s) {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Break a section body that exceeds MAX_CHARS into word-boundary parts so each
 * embeds within the model's token limit. Parts keep the section id (citations
 * still resolve); no content is dropped. Empty input yields no parts.
 */
function splitOnLimit(body) {
  if (!body) return [];
  if (body.length <= MAX_CHARS) return [body];
  const parts = [];
  let start = 0;
  while (start < body.length) {
    let end = Math.min(start + MAX_CHARS, body.length);
    if (end < body.length) {
      const lastSpace = body.lastIndexOf(' ', end);
      if (lastSpace > start) end = lastSpace;
    }
    parts.push(body.slice(start, end).trim());
    start = end;
  }
  return parts.filter(Boolean);
}
