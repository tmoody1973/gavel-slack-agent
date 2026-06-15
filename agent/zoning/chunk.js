/**
 * Split extracted Ch.295 text into structure-aware chunks. Table sources
 * (`meta.scope === 'table'`) are kept intact as a single chunk. Otherwise each
 * `295-NNN.` heading starts a new chunk that runs until the next heading, so
 * sub-paragraphs (1. PERMITTED USES, 2. DIMENSIONAL STANDARDS) stay with their
 * section. Text before the first heading (page furniture) is dropped.
 * @param {string} text
 * @param {{parent:string, family:string, scope:string, sourceUrl:string}} meta
 * @returns {Array<{section:string, text:string, parent:string, family:string, scope:string, sourceUrl:string}>}
 */
export function chunkSections(text, meta) {
  const base = { parent: meta.parent, family: meta.family, scope: meta.scope, sourceUrl: meta.sourceUrl };
  if (meta.scope === 'table') {
    return [{ section: '295-Table', text: collapse(text), ...base }];
  }
  // Split on a "295-NNN." heading, capturing the id. parts[0] is the preamble
  // (page furniture, dropped); then alternating [id, body, id, body, ...].
  const parts = text.split(/(?:^|\n)\s*(295-\d+)\.\s/);
  const chunks = [];
  for (let i = 1; i < parts.length; i += 2) {
    const body = collapse(parts[i + 1] ?? '');
    if (body) chunks.push({ section: parts[i], text: body, ...base });
  }
  return chunks;
}

/** Collapse runs of whitespace/newlines to single spaces; trim. */
function collapse(s) {
  return s.replace(/\s+/g, ' ').trim();
}
