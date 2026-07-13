// agent/news/query.js
// Pure: turn a tracked item into a tight, Milwaukee-scoped news search — or null when there's
// nothing distinctive enough to search (routine personnel/claims items). File numbers are never
// used: they don't appear in press coverage.

const CITY_SCOPE = 'Milwaukee';

// Generic civic verbs/nouns that are NOT distinctive enough to drive a news search on their own.
const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'of',
  'to',
  'for',
  'and',
  'or',
  'in',
  'on',
  'at',
  'by',
  'with',
  'from',
  'relating',
  'communication',
  'resolution',
  'ordinance',
  'appointment',
  'reappointment',
  'member',
  'board',
  'claim',
  'claims',
  'substitute',
  'amending',
  'various',
  'matters',
  'directing',
  'authorizing',
  'approving',
  // Sentence-start capitals the proper-noun regex mistakes for entities. Civic titles open with
  // these constantly, and one of them is not harmless: "Conditional" alone took a real query from
  // 10 articles to 0, hiding the coverage that the data center had been dropped.
  'conditional',
  'proposed',
  'former',
  'existing',
  'certain',
  'changes',
  'request',
  'use',
]);

const ADDRESS_RE =
  /\b\d{2,6}\s+[NSEW]?\.?\s*[A-Za-z0-9.\- ]+?\b(?:Ave|Avenue|St|Street|Blvd|Boulevard|Rd|Road|Dr|Drive|Ln|Lane|Way|Pl|Place|Ct|Court|Ter|Terrace|Hwy|Highway)\b/;

// Distinctive multi-word phrases worth searching even without an address.
const ENTITY_PHRASES = [
  'data center',
  'data centre',
  'stadium',
  'arena',
  'casino',
  'apartments',
  'development',
  'rezoning',
  'tax incremental',
  'streetcar',
  'liquor license',
  'demolition',
  'historic',
  'brewery',
  'hotel',
];

// Words that appear inside entity phrases — not distinctive on their own as proper nouns.
const PHRASE_WORDS = new Set(ENTITY_PHRASES.flatMap((p) => p.split(' ')));

function distinctiveTerms(title) {
  const lower = title.toLowerCase();
  const phrases = ENTITY_PHRASES.filter((phrase) => lower.includes(phrase));
  // Proper nouns: capitalized runs of 1-3 words not in stopword or entity-phrase vocabulary.
  const proper = (title.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g) ?? [])
    .map((run) => run.trim())
    .filter((run) => {
      const lc = run.toLowerCase();
      return !STOPWORDS.has(lc) && !PHRASE_WORDS.has(lc) && run.length > 3;
    });
  return [...new Set([...phrases, ...proper])].slice(0, 2);
}

/**
 * @param {{ title?: string, addresses?: string[] }} item
 * @returns {{ query: string, address: string|null, terms: string[] } | null}
 */
export function buildNewsQuery(item = {}) {
  const title = String(item.title ?? '').trim();
  if (!title) return null;

  const fromList = (item.addresses ?? []).find((a) => a?.trim());
  const address = fromList ?? title.match(ADDRESS_RE)?.[0] ?? null;
  const terms = distinctiveTerms(title);

  if (!address && terms.length === 0) return null;

  const parts = [address, ...terms, CITY_SCOPE].filter(Boolean);
  return { query: parts.join(' '), address: address ?? null, terms };
}
