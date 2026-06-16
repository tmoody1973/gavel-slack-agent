/**
 * Parse a Milwaukee E-Notify email into structured civic fields.
 *
 * E-Notify bodies follow a stable city template that *states its own category*
 * ("You have a Milwaukee.Gov E-Notification for X") and carries address, taxkey,
 * record number, district, and (for meetings) a direct Legistar link. So the
 * derived fields are deterministic regex extraction — Claude is reserved for the
 * plain-English summary, not classification. Every field degrades to null/[] so
 * an unrecognized email never throws.
 */

// Curated buckets, driven by the real mail. The city states a category in every
// body ("E-Notification for X"), but the phrasing varies (e.g. "Common Council"
// and "Redevelopment Authority Agenda" are both meetings), so we classify by
// keyword over the stated label + subject rather than matching an exact string.
// Order matters: the first rule that hits wins.
const CATEGORY_RULES = [
  { bucket: 'neighborhood_services', test: /neighborhood services/i },
  { bucket: 'licenses', test: /\blicense/i },
  { bucket: 'meetings', test: /\bagenda\b|common council|\bcommittee\b|\bauthority\b/i },
  { bucket: 'newsletter', test: /\bnewsletter\b/i },
];

const ADDRESS_SUFFIXES = 'ST|AVE|AV|BLVD|RD|DR|LN|CT|PL|WAY|PKWY|TER|CIR|HWY|CV|PT|SQ';

const PATTERNS = {
  categoryLabel: /E-Notification for ([A-Za-z][A-Za-z ]+?)(?: Activity| Applied| There| The | \w+ #|\.|,| in )/,
  district: /Aldermanic District #(\d+)/,
  bid: /BID\(s\)\s*\[(\d+)\]/,
  address: new RegExp(String.raw`\bAt (\d+ [A-Z0-9 ]+?(?:${ADDRESS_SUFFIXES}))\b`, 'g'),
  taxkey: /taxkey\s*#?\s*(\d{8,})/g,
  recordNumber: /#([A-Z]+(?:-[A-Z]+)*-\d{2,4}-\d+)/,
  legistarMeetingId: /MeetingDetail\.aspx\?ID=(\d+)/,
  // Licensee entity: the "for <Name>, <LLC>" clause. Anchored on a capitalized
  // name so the earlier "applied for on Tuesday..." date clause is skipped.
  business: /\bfor ([A-Z][^.]*?(?:LLC|INC|CORP|LLP))\b/,
  description: /Description:\s*(.+?)\.\s/,
  detailUrl: /(https?:\/\/[^\s|]+)/,
  // license type is the whole subject minus the APPLICATION/RENEWAL verb
  licenseType: /^(?:APPLICATION|RENEWAL)\s+(.+)$/i,
};

/** Collapse raw email HTML into plain text (no markup, decoded entities). */
export function htmlToText(html) {
  return (html ?? '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstMatch(pattern, text) {
  const match = text.match(pattern);
  return match ? match[1].trim() : null;
}

function allMatches(pattern, text) {
  const found = [];
  for (const match of text.matchAll(pattern)) {
    found.push(match[1].trim());
  }
  return found;
}

function deriveCategory(categoryRaw, subject) {
  const haystack = `${categoryRaw ?? ''} ${subject ?? ''}`;
  return CATEGORY_RULES.find((rule) => rule.test.test(haystack))?.bucket ?? 'other';
}

/** Record prefix (COM-ALT, ENF) for NS records; license type for licenses. */
function deriveSubType(category, subject, recordNumber) {
  if (category === 'licenses') return firstMatch(PATTERNS.licenseType, subject ?? '');
  if (recordNumber) return recordNumber.replace(/-\d{2,4}-\d+$/, '');
  return null;
}

/**
 * @param {{ subject?: string, bodyText?: string }} message
 * @returns {{
 *   category: string, categoryRaw: string|null, subType: string|null,
 *   district: string|null, bid: string|null, addresses: string[], taxkeys: string[],
 *   recordNumber: string|null, legistarMeetingId: string|null, business: string|null,
 *   detailUrl: string|null, description: string|null,
 * }}
 */
export function extractCivicFields(message) {
  const subject = message.subject ?? '';
  const body = message.bodyText ?? '';

  const categoryRaw = firstMatch(PATTERNS.categoryLabel, body);
  const category = deriveCategory(categoryRaw, subject);
  const recordNumber = firstMatch(PATTERNS.recordNumber, subject) ?? firstMatch(PATTERNS.recordNumber, body);

  return {
    category,
    categoryRaw,
    subType: deriveSubType(category, subject, recordNumber),
    district: firstMatch(PATTERNS.district, body),
    bid: firstMatch(PATTERNS.bid, body),
    addresses: allMatches(PATTERNS.address, body),
    taxkeys: allMatches(PATTERNS.taxkey, body),
    recordNumber,
    legistarMeetingId: firstMatch(PATTERNS.legistarMeetingId, body),
    business: category === 'licenses' ? firstMatch(PATTERNS.business, body) : null,
    detailUrl: firstMatch(PATTERNS.detailUrl, body),
    description: firstMatch(PATTERNS.description, body),
  };
}
