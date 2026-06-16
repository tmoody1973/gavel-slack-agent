/** A "295-NNN." token followed by whitespace — a heading OR an inline cross-reference. */
const SECTION_TOKEN = /(295-\d+)\.\s/g;

/**
 * Split extracted Ch.295 text into structure-aware chunks. Table sources
 * (`meta.scope === 'table'`) are kept intact as a single chunk. Otherwise each
 * `295-NNN.` heading starts a new chunk that runs until the next heading, so
 * sub-paragraphs (1. PERMITTED USES, 2. DIMENSIONAL STANDARDS) stay with their
 * section.
 *
 * pdfjs concatenates every text item on a page with spaces and only emits a
 * newline between pages, so headings are NOT at line starts and the same
 * "295-NNN." string also appears as a cross-reference inside a section body.
 * We disambiguate by ordinal: real headings ascend through the document, so a
 * "295-NNN" whose number is not greater than the last accepted heading is a
 * cross-reference and is folded into the current section's body. Text before
 * the first heading (page furniture) is dropped.
 * @param {string} text
 * @param {{parent:string, family:string, scope:string, sourceUrl:string}} meta
 * @returns {Array<{section:string, text:string, parent:string, family:string, scope:string, sourceUrl:string}>}
 */
export function chunkSections(text, meta) {
  const base = { parent: meta.parent, family: meta.family, scope: meta.scope, sourceUrl: meta.sourceUrl };
  if (meta.scope === 'table') {
    return [{ section: '295-Table', text: collapse(text), ...base }];
  }
  const headings = [];
  let lastNumber = -1;
  for (const match of text.matchAll(SECTION_TOKEN)) {
    const number = Number(match[1].slice('295-'.length));
    if (number > lastNumber) {
      headings.push({ section: match[1], index: match.index });
      lastNumber = number;
    }
  }
  const chunks = [];
  for (let i = 0; i < headings.length; i++) {
    const end = i + 1 < headings.length ? headings[i + 1].index : text.length;
    const body = collapse(text.slice(headings[i].index, end));
    if (body) chunks.push({ section: headings[i].section, text: body, ...base });
  }
  return chunks;
}

/** Collapse runs of whitespace/newlines to single spaces; trim. */
function collapse(s) {
  return s.replace(/\s+/g, ' ').trim();
}
