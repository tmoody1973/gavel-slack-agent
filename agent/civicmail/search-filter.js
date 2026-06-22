// Search precision over the Convex full-text index (MOO-153). Convex search is the
// recall layer: it's typo-tolerant and prefix-matching, but it uses OR semantics and
// has no phrase operator — so "data center" returns anything containing "data" OR
// "center", and quotes are ignored. This module restores the user's intent:
//   - surrounding quotes  → exact phrase (must appear contiguously)
//   - multiple words      → AND (every word must appear)
//   - a single word       → left to Convex (keeps typo tolerance)
// Pure; the handler runs it over the Convex candidates before building the card.

/**
 * Parse a raw `/gavel search` argument into a query intent.
 * @param {string} raw
 * @returns {{ display: string, exact: boolean, phrase: string, tokens: string[] }}
 */
export function parseSearchTerm(raw) {
  const trimmed = (raw ?? '').trim();
  const quoted = /^["“”'](.+)["“”']$/.exec(trimmed);
  if (quoted) {
    const phrase = quoted[1].trim();
    return { display: phrase, exact: true, phrase: phrase.toLowerCase(), tokens: [] };
  }
  return {
    display: trimmed,
    exact: false,
    phrase: trimmed.toLowerCase(),
    tokens: trimmed.toLowerCase().split(/\s+/).filter(Boolean),
  };
}

/**
 * Does a row's search text satisfy the parsed query? Exact → the contiguous phrase;
 * otherwise every token (AND).
 * @param {string} searchText
 * @param {ReturnType<typeof parseSearchTerm>} parsed
 * @returns {boolean}
 */
export function matchesQuery(searchText, parsed) {
  const haystack = (searchText ?? '').toLowerCase();
  if (parsed.exact) return haystack.includes(parsed.phrase);
  return parsed.tokens.every((token) => haystack.includes(token));
}

/**
 * Tighten the Convex candidates: filter quoted/multi-word queries down to true
 * matches; pass single-word queries through untouched so Convex's typo tolerance and
 * prefix matching still work for the common case.
 * @param {Array<{ searchText?: string }>} results
 * @param {ReturnType<typeof parseSearchTerm>} parsed
 * @returns {Array<{ searchText?: string }>}
 */
export function refineResults(results, parsed, getText = (row) => row.searchText) {
  if (!parsed.exact && parsed.tokens.length <= 1) return results;
  return results.filter((row) => matchesQuery(getText(row), parsed));
}

/**
 * Merge the keyword lane (precise) and the semantic lane (conceptual) for hybrid
 * search: keyword matches first, then semantic neighbors, deduped by messageId,
 * capped at `limit`. The two lanes complement — keyword nails literal queries,
 * semantic catches "free summer activities" → the safe-summer flyer.
 *
 * @param {Array<{messageId?: string}>} keyword
 * @param {Array<{messageId?: string}>} semantic
 * @param {{ limit?: number }} [opts]
 * @returns {Array<object>}
 */
export function mergeSearchResults(keyword, semantic, { limit = 12 } = {}) {
  const seen = new Set();
  const merged = [];
  for (const row of [...keyword, ...semantic]) {
    if (row.messageId && seen.has(row.messageId)) continue;
    if (row.messageId) seen.add(row.messageId);
    merged.push(row);
    if (merged.length >= limit) break;
  }
  return merged;
}
