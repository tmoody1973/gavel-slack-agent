// Pure matching between Legistar sponsor names and the council-member
// directory. Real Milwaukee sponsor formats (verified against the live API):
// "Russell Stamper, II", "Russell Stamper", "ALD. STAMPER", "THE CHAIR".
// Last names are unique across all 15 members, so last-name keys are the join.

const SUFFIX_TOKENS = new Set(['jr', 'sr', 'ii', 'iii', 'iv']);
const HONORIFIC_TOKENS = new Set(['ald', 'alderman', 'alderwoman', 'alderperson', 'president']);

/**
 * Normalize a person name to its last-name key: lowercased, diacritics and
 * punctuation stripped, honorifics and generational suffixes dropped.
 * Returns '' when no name token survives (e.g. empty input).
 * @param {string} [name]
 * @returns {string}
 */
export function lastNameKey(name) {
  const tokens = (name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token && !SUFFIX_TOKENS.has(token) && !HONORIFIC_TOKENS.has(token));
  return tokens.at(-1) ?? '';
}

/**
 * Find the unique directory member whose last name matches the sponsor's.
 * Returns null on no name, no match, or an ambiguous match.
 * @param {string | undefined} sponsorName
 * @param {Array<{name: string}>} members
 * @returns {object | null}
 */
export function findMember(sponsorName, members) {
  const key = lastNameKey(sponsorName);
  if (!key) return null;
  const matches = members.filter((member) => lastNameKey(member.name) === key);
  return matches.length === 1 ? matches[0] : null;
}
