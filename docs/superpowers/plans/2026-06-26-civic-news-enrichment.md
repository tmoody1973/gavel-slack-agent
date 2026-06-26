# Civic News Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect external local-news coverage to the specific government item Gavel is already tracking — surfaced on the alert card and as a 5th `news` lane in `/gavel search`.

**Architecture:** A new `agent/news/` module behind a `NewsSource` interface (Google News RSS now, Exa later). Pure helpers (`rss`, `query`, `relevance`, `normalize`) compose into one `createNewsService` factory exposing `enrichForAlert` (cached by file number) and `searchNews` (cached by query). A read-through Convex `newsCache` table (24h TTL) fronts both. Every candidate clears a Claude relevance gate before it shows. News never blocks or breaks an alert — it degrades to no-block on any failure or timeout, exactly like `resolveAttachmentUrls`.

**Tech Stack:** TypeScript/JS (ESM), `node --test` + `node:assert/strict`, Convex (`ConvexHttpClient`), Anthropic via `createClaudeGenerate`, native `fetch` + `AbortController`. Hand-rolled RSS parser (no new dependency). Biome for lint.

## Global Constraints

- **Real links only.** Gavel shows headline · source · date · link. It NEVER writes its own summary of an article. No `snippet` text invented from article bodies.
- **Gated only.** Nothing surfaces unless it clears the Claude "is this about THIS item?" check.
- **External press only.** Do not duplicate the city's own press releases/newsletters/events (those flow through the AgentMail civic-mail pipeline). No national or non-local outlets.
- **News never breaks a surface.** Any fetch/parse/gate/timeout failure → empty result → the alert card and search card render exactly as they do today.
- **Selective + cheap.** Only items with a resolvable address OR a distinctive named entity get fetched. Fetch top ~5 raw → gate → show ≤3 → cache 24h.
- **No file numbers in news queries** (they never appear in press). File number is only the cache key for the alert path.
- **Polite client:** reuse the existing UA string `GavelCivicAgent/0.1 (+https://github.com/tmoody1973/gavel-slack-agent; contact tarik@radiomilwaukee.org)`, a fetch timeout (default 5000ms), no hammering.
- **Tests:** `node --test` green · `npx @biomejs/biome check .` clean. Commands run from `agent/`.
- **Convex codegen before any deploy that adds a table:** `npx convex dev --once` (the `newsCache` table is new; `_generated` is image-baked).

---

## File Structure

**New module `agent/news/`:**
- `news/rss.js` — pure `parseGoogleNewsRss(xml) → RawArticle[]`.
- `news/query.js` — pure `buildNewsQuery(item) → { query, address, terms } | null`.
- `news/relevance.js` — pure `buildGatePrompt(subject, articles)` + `filterRelevant(subject, articles, { generate })`.
- `news/normalize.js` — pure `normalizeNews(article) → federated-card result row`.
- `news/source.js` — `createGoogleNewsSource({ fetch, userAgent, timeoutMs }) → { fetchNews }` (Google News RSS); documents the `NewsSource` seam for a future `exaNewsSource.js`.
- `news/service.js` — `createNewsService({ source, generate, getCached, putCached, now }) → { enrichForAlert, searchNews }`.

**New Convex files:**
- `convex/schema.ts` — add `newsCache` table (MODIFY).
- `convex/newsCache.ts` — `getCached` query + `upsertCache` mutation (CREATE).

**Modified surfaces:**
- `alerts/card.js` — add `newsLinks` param + 📰 context block (MODIFY).
- `alerts/process.js` — call news enrichment, pass `newsLinks` + `addresses`, degrade-safe (MODIFY).
- `scripts/poll-once.mjs` — wire the news service (source + generate + cache) into `processPendingAlerts` (MODIFY).
- `civicmail/federated-card.js` — register `news` in `SOURCE_META` + `SOURCE_ORDER` (MODIFY).
- `listeners/commands/gavel.js` — add the `news` lane to `runSearch` (MODIFY).
- `listeners/commands/index.js` — wire `deps.searchNews` to the news service (MODIFY).

**Shared types (informal JSDoc, used across tasks):**
- `RawArticle = { title: string, url: string, source: string|null, publishedAt: string|null }`
- Federated result row = `{ source: string, headline: string, meta: string|null, snippet: string|null, messageId: string|null }`

---

## Task 1: RSS parser (`news/rss.js`)

**Files:**
- Create: `agent/news/rss.js`
- Test: `agent/tests/news/rss.test.js`

**Interfaces:**
- Produces: `parseGoogleNewsRss(xml: string) → RawArticle[]` where `RawArticle = { title, url, source, publishedAt }`. Never throws on malformed input — returns `[]`.

- [ ] **Step 1: Write the failing test**

```javascript
// agent/tests/news/rss.test.js
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseGoogleNewsRss } from '../../news/rss.js';

const SAMPLE = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Google News</title>
  <item>
    <title>Data center planned for 5825 W Hope Ave - WTMJ</title>
    <link>https://news.google.com/rss/articles/ABC123?oc=5</link>
    <pubDate>Tue, 24 Jun 2026 14:02:00 GMT</pubDate>
    <source url="https://www.tmj4.com">TMJ4</source>
    <description>&lt;a href="x"&gt;Data center planned&lt;/a&gt;</description>
  </item>
  <item>
    <title>Council weighs zoning change - Urban Milwaukee</title>
    <link>https://news.google.com/rss/articles/DEF456</link>
    <pubDate>Mon, 23 Jun 2026 09:00:00 GMT</pubDate>
    <source url="https://urbanmilwaukee.com">Urban Milwaukee</source>
  </item>
</channel></rss>`;

describe('parseGoogleNewsRss', () => {
  it('parses each item into title, url, source, publishedAt', () => {
    const out = parseGoogleNewsRss(SAMPLE);
    assert.equal(out.length, 2);
    assert.equal(out[0].title, 'Data center planned for 5825 W Hope Ave - WTMJ');
    assert.equal(out[0].url, 'https://news.google.com/rss/articles/ABC123?oc=5');
    assert.equal(out[0].source, 'TMJ4');
    assert.equal(out[0].publishedAt, 'Tue, 24 Jun 2026 14:02:00 GMT');
    assert.equal(out[1].source, 'Urban Milwaukee');
  });

  it('returns [] for empty or malformed input instead of throwing', () => {
    assert.deepEqual(parseGoogleNewsRss(''), []);
    assert.deepEqual(parseGoogleNewsRss('not xml at all'), []);
    assert.deepEqual(parseGoogleNewsRss(undefined), []);
  });

  it('decodes HTML entities in the title and tolerates a missing source', () => {
    const xml = `<rss><channel><item>
      <title>Parks &amp; Rec budget vote</title>
      <link>https://news.google.com/x</link>
      <pubDate>Wed, 25 Jun 2026 00:00:00 GMT</pubDate>
    </item></channel></rss>`;
    const out = parseGoogleNewsRss(xml);
    assert.equal(out[0].title, 'Parks & Rec budget vote');
    assert.equal(out[0].source, null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/news/rss.test.js`
Expected: FAIL — `Cannot find module '../../news/rss.js'`.

- [ ] **Step 3: Write minimal implementation**

```javascript
// agent/news/rss.js
// Pure parser for Google News RSS. Hand-rolled (no XML dependency): Google News RSS is a
// stable, flat <item> list. Never throws — returns [] on malformed input so a bad feed can
// never break an alert or a search.

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'" };

const decode = (text) =>
  String(text ?? '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&[a-z]+;|&#\d+;/gi, (entity) => ENTITIES[entity] ?? entity)
    .trim();

const tag = (block, name) => {
  const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return match ? decode(match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')) : null;
};

/**
 * @param {string} xml
 * @returns {Array<{ title: string, url: string, source: string|null, publishedAt: string|null }>}
 */
export function parseGoogleNewsRss(xml) {
  const text = String(xml ?? '');
  const items = text.match(/<item[^>]*>[\s\S]*?<\/item>/gi) ?? [];
  return items
    .map((block) => ({
      title: tag(block, 'title') ?? '',
      url: tag(block, 'link') ?? '',
      source: tag(block, 'source'),
      publishedAt: tag(block, 'pubDate'),
    }))
    .filter((article) => article.title && article.url);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/news/rss.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add agent/news/rss.js agent/tests/news/rss.test.js
git commit -m "feat(news): hand-rolled Google News RSS parser (degrade-safe)"
```

---

## Task 2: Query builder (`news/query.js`)

**Files:**
- Create: `agent/news/query.js`
- Test: `agent/tests/news/query.test.js`

**Interfaces:**
- Consumes: an `item = { title: string, addresses?: string[] }`.
- Produces: `buildNewsQuery(item) → { query: string, address: string|null, terms: string[] } | null`. Returns `null` when the item has neither a usable address nor a distinctive title term (so routine personnel items fetch nothing). `query` is a plain search string scoped to Milwaukee; never contains a file number.

- [ ] **Step 1: Write the failing test**

```javascript
// agent/tests/news/query.test.js
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildNewsQuery } from '../../news/query.js';

describe('buildNewsQuery', () => {
  it('uses the address plus a distinctive term, scoped to Milwaukee', () => {
    const q = buildNewsQuery({
      title: 'Conditional use for a data center at 5825 W Hope Ave',
      addresses: ['5825 W Hope Ave'],
    });
    assert.ok(q);
    assert.equal(q.address, '5825 W Hope Ave');
    assert.match(q.query, /5825 W Hope Ave/);
    assert.match(q.query, /Milwaukee/);
    assert.ok(q.terms.includes('data center'));
  });

  it('returns a query from a distinctive entity even with no address', () => {
    const q = buildNewsQuery({ title: 'Liquor license for Punta Cana Restaurant', addresses: [] });
    assert.ok(q);
    assert.equal(q.address, null);
    assert.match(q.query, /Punta Cana/);
  });

  it('returns null for a routine item with no address and no distinctive entity', () => {
    assert.equal(buildNewsQuery({ title: 'Appointment of a member to the board', addresses: [] }), null);
    assert.equal(buildNewsQuery({ title: 'Communication relating to claims', addresses: [] }), null);
  });

  it('returns null for an empty/garbage item', () => {
    assert.equal(buildNewsQuery({ title: '', addresses: [] }), null);
    assert.equal(buildNewsQuery({}), null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/news/query.test.js`
Expected: FAIL — `Cannot find module '../../news/query.js'`.

- [ ] **Step 3: Write minimal implementation**

```javascript
// agent/news/query.js
// Pure: turn a tracked item into a tight, Milwaukee-scoped news search — or null when there's
// nothing distinctive enough to search (routine personnel/claims items). File numbers are never
// used: they don't appear in press coverage.

const CITY_SCOPE = 'Milwaukee';

// Generic civic verbs/nouns that are NOT distinctive enough to drive a news search on their own.
const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'to', 'for', 'and', 'or', 'in', 'on', 'at', 'by', 'with', 'from', 'relating',
  'communication', 'resolution', 'ordinance', 'appointment', 'reappointment', 'member', 'board', 'claim',
  'claims', 'substitute', 'amending', 'various', 'matters', 'directing', 'authorizing', 'approving',
]);

const ADDRESS_RE = /\b\d{2,6}\s+[NSEW]?\.?\s*[A-Za-z0-9.\- ]+?\b(?:Ave|Avenue|St|Street|Blvd|Boulevard|Rd|Road|Dr|Drive|Ln|Lane|Way|Pl|Place|Ct|Court|Ter|Terrace|Hwy|Highway)\b/;

// Distinctive multi-word phrases worth searching even without an address.
const ENTITY_PHRASES = [
  'data center', 'data centre', 'stadium', 'arena', 'casino', 'apartments', 'development', 'rezoning',
  'tax incremental', 'streetcar', 'liquor license', 'demolition', 'historic', 'brewery', 'hotel',
];

function distinctiveTerms(title) {
  const lower = title.toLowerCase();
  const phrases = ENTITY_PHRASES.filter((phrase) => lower.includes(phrase));
  // Proper nouns: capitalized runs of 1-3 words not starting the title-generic vocabulary.
  const proper = (title.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g) ?? [])
    .map((run) => run.trim())
    .filter((run) => !STOPWORDS.has(run.toLowerCase()) && run.length > 3);
  return [...new Set([...phrases, ...proper])].slice(0, 2);
}

/**
 * @param {{ title?: string, addresses?: string[] }} item
 * @returns {{ query: string, address: string|null, terms: string[] } | null}
 */
export function buildNewsQuery(item = {}) {
  const title = String(item.title ?? '').trim();
  if (!title) return null;

  const fromList = (item.addresses ?? []).find((a) => a && a.trim());
  const address = fromList ?? (title.match(ADDRESS_RE)?.[0] ?? null);
  const terms = distinctiveTerms(title);

  if (!address && terms.length === 0) return null;

  const parts = [address, ...terms, CITY_SCOPE].filter(Boolean);
  return { query: parts.join(' '), address: address ?? null, terms };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/news/query.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add agent/news/query.js agent/tests/news/query.test.js
git commit -m "feat(news): buildNewsQuery — address+entity query or null for routine items"
```

---

## Task 3: Relevance gate (`news/relevance.js`)

**Files:**
- Create: `agent/news/relevance.js`
- Test: `agent/tests/news/relevance.test.js`

**Interfaces:**
- Consumes: an injected `generate({ system, prompt }) → Promise<{ relevant: number[] }>` (a `createClaudeGenerate` instance configured with `NEWS_GATE_SCHEMA`, defined here and exported).
- Produces:
  - `NEWS_GATE_SCHEMA` (JSON schema object) for the gate's `generate`.
  - `buildGatePrompt(subject: string, articles: RawArticle[]) → { system, prompt }` (pure).
  - `filterRelevant(subject: string, articles: RawArticle[], { generate }) → Promise<RawArticle[]>` — returns only the articles whose index the model marks relevant. Degrade-safe: on any error or malformed response, returns `[]`.

- [ ] **Step 1: Write the failing test**

```javascript
// agent/tests/news/relevance.test.js
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildGatePrompt, filterRelevant, NEWS_GATE_SCHEMA } from '../../news/relevance.js';

const ARTICLES = [
  { title: 'Data center planned for 5825 W Hope Ave', url: 'https://a', source: 'TMJ4', publishedAt: 'x' },
  { title: 'Best brunch spots in Milwaukee', url: 'https://b', source: 'OnMKE', publishedAt: 'y' },
];

describe('news relevance gate', () => {
  it('buildGatePrompt lists each article with its index and the subject', () => {
    const { system, prompt } = buildGatePrompt('data center at 5825 W Hope Ave', ARTICLES);
    assert.match(system.toLowerCase(), /only|about this/);
    assert.match(prompt, /5825 W Hope Ave/);
    assert.match(prompt, /\[0\]/);
    assert.match(prompt, /\[1\]/);
  });

  it('keeps only the indices the model marks relevant', async () => {
    const generate = async () => ({ relevant: [0] });
    const out = await filterRelevant('data center at 5825 W Hope Ave', ARTICLES, { generate });
    assert.equal(out.length, 1);
    assert.equal(out[0].url, 'https://a');
  });

  it('degrades to [] when the gate throws or returns garbage', async () => {
    const boom = async () => {
      throw new Error('claude down');
    };
    assert.deepEqual(await filterRelevant('x', ARTICLES, { generate: boom }), []);
    const garbage = async () => ({ nope: true });
    assert.deepEqual(await filterRelevant('x', ARTICLES, { generate: garbage }), []);
  });

  it('returns [] for no articles without calling the model', async () => {
    let called = false;
    const generate = async () => {
      called = true;
      return { relevant: [0] };
    };
    assert.deepEqual(await filterRelevant('x', [], { generate }), []);
    assert.equal(called, false);
    assert.ok(NEWS_GATE_SCHEMA);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/news/relevance.test.js`
Expected: FAIL — `Cannot find module '../../news/relevance.js'`.

- [ ] **Step 3: Write minimal implementation**

```javascript
// agent/news/relevance.js
// The Claude relevance gate. On a civic-trust product a wrong match is worse than no match, so
// nothing surfaces unless the model confirms the article is about THIS item. Pure prompt builder +
// a degrade-safe filter over an injected generate boundary.

export const NEWS_GATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['relevant'],
  properties: {
    relevant: {
      type: 'array',
      items: { type: 'integer' },
      description: 'Indices of articles that are specifically about the subject.',
    },
  },
};

const SYSTEM =
  'You decide which news headlines are specifically about a given local government matter. ' +
  'Return ONLY the indices of headlines that are clearly about THIS matter (same project, place, ' +
  'or decision). Exclude generic city news, listicles, and anything you are unsure about.';

/**
 * @param {string} subject  what the articles must be about (item title + address, or a search term)
 * @param {Array<{ title: string }>} articles
 * @returns {{ system: string, prompt: string }}
 */
export function buildGatePrompt(subject, articles) {
  const list = articles.map((a, i) => `[${i}] ${a.title}`).join('\n');
  const prompt = `Subject: ${subject}\n\nHeadlines:\n${list}\n\nReturn the indices that are about the subject.`;
  return { system: SYSTEM, prompt };
}

/**
 * @param {string} subject
 * @param {Array<object>} articles
 * @param {{ generate: (input: { system: string, prompt: string }) => Promise<{ relevant: number[] }> }} deps
 * @returns {Promise<Array<object>>}
 */
export async function filterRelevant(subject, articles, { generate }) {
  if (!Array.isArray(articles) || articles.length === 0) return [];
  try {
    const { system, prompt } = buildGatePrompt(subject, articles);
    const result = await generate({ system, prompt });
    const indices = result?.relevant;
    if (!Array.isArray(indices)) return [];
    const keep = new Set(indices.filter((i) => Number.isInteger(i)));
    return articles.filter((_, i) => keep.has(i));
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/news/relevance.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add agent/news/relevance.js agent/tests/news/relevance.test.js
git commit -m "feat(news): Claude relevance gate (degrade-safe, schema-constrained)"
```

---

## Task 4: Normalizer (`news/normalize.js`)

**Files:**
- Create: `agent/news/normalize.js`
- Test: `agent/tests/news/normalize.test.js`

**Interfaces:**
- Consumes: a `RawArticle = { title, url, source, publishedAt }`.
- Produces: `normalizeNews(article) → { source: 'news', headline, meta, snippet, messageId }` — the federated-card result-row shape. `headline` is a Slack mrkdwn link `<url|title>` (matches `normalizeZoning`). `snippet` is always `null` (real links only — never a Gavel-written article summary). `meta` is `source · date`.

- [ ] **Step 1: Write the failing test**

```javascript
// agent/tests/news/normalize.test.js
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeNews } from '../../news/normalize.js';

describe('normalizeNews', () => {
  it('renders the headline as a Slack link and source · date as meta, no snippet', () => {
    const row = normalizeNews({
      title: 'Data center planned for 5825 W Hope Ave',
      url: 'https://www.tmj4.com/story',
      source: 'TMJ4',
      publishedAt: 'Tue, 24 Jun 2026 14:02:00 GMT',
    });
    assert.equal(row.source, 'news');
    assert.equal(row.headline, '<https://www.tmj4.com/story|Data center planned for 5825 W Hope Ave>');
    assert.match(row.meta, /TMJ4/);
    assert.equal(row.snippet, null);
    assert.equal(row.messageId, null);
  });

  it('tolerates a missing source/date', () => {
    const row = normalizeNews({ title: 'X', url: 'https://x', source: null, publishedAt: null });
    assert.equal(row.headline, '<https://x|X>');
    assert.equal(row.meta, null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/news/normalize.test.js`
Expected: FAIL — `Cannot find module '../../news/normalize.js'`.

- [ ] **Step 3: Write minimal implementation**

```javascript
// agent/news/normalize.js
// Shape a RawArticle into the federated /gavel search result row (same contract as
// civicmail/federated-card.js normalizers). headline is a Slack link; snippet is always null —
// Gavel shows the reporter's headline and a link, never its own summary of their work.

/** Format an RFC-822 pubDate (or any date string) as a short YYYY-MM-DD, or null. */
function shortDate(value) {
  if (!value) return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * @param {{ title: string, url: string, source?: string|null, publishedAt?: string|null }} article
 * @returns {{ source: 'news', headline: string, meta: string|null, snippet: null, messageId: null }}
 */
export function normalizeNews(article) {
  const meta = [article.source, shortDate(article.publishedAt)].filter(Boolean).join(' · ') || null;
  return {
    source: 'news',
    headline: `<${article.url}|${article.title}>`,
    meta,
    snippet: null,
    messageId: null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/news/normalize.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add agent/news/normalize.js agent/tests/news/normalize.test.js
git commit -m "feat(news): normalizeNews → federated-card result row (linked headline, no snippet)"
```

---

## Task 5: Google News source (`news/source.js`)

**Files:**
- Create: `agent/news/source.js`
- Test: `agent/tests/news/source.test.js`

**Interfaces:**
- Consumes: `parseGoogleNewsRss` (Task 1); an injected `fetch`, a `userAgent` string, an optional `timeoutMs`.
- Produces: `createGoogleNewsSource({ fetch, userAgent, timeoutMs }) → { fetchNews }` where `fetchNews({ query, sinceDays }) → Promise<RawArticle[]>`. This IS the `NewsSource` interface (a future `exaNewsSource.js` exports the same `{ fetchNews }`). Degrade-safe: any non-200, abort, or thrown error → `[]`.

- [ ] **Step 1: Write the failing test**

```javascript
// agent/tests/news/source.test.js
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createGoogleNewsSource } from '../../news/source.js';

const RSS = `<rss><channel><item>
  <title>Data center planned - TMJ4</title>
  <link>https://news.google.com/x</link>
  <pubDate>Tue, 24 Jun 2026 14:02:00 GMT</pubDate>
  <source url="https://tmj4.com">TMJ4</source>
</item></channel></rss>`;

describe('createGoogleNewsSource', () => {
  it('builds a Google News RSS URL with the query and UA, returns parsed articles', async () => {
    const calls = [];
    const fetch = async (url, opts) => {
      calls.push({ url, opts });
      return { ok: true, status: 200, text: async () => RSS };
    };
    const source = createGoogleNewsSource({ fetch, userAgent: 'GavelTest/1.0' });
    const out = await source.fetchNews({ query: '5825 W Hope Ave data center Milwaukee' });
    assert.equal(out.length, 1);
    assert.equal(out[0].source, 'TMJ4');
    assert.match(calls[0].url, /news\.google\.com\/rss\/search/);
    assert.match(calls[0].url, /5825/);
    assert.equal(calls[0].opts.headers['User-Agent'], 'GavelTest/1.0');
  });

  it('degrades to [] on a non-200 response', async () => {
    const fetch = async () => ({ ok: false, status: 503, text: async () => '' });
    const source = createGoogleNewsSource({ fetch, userAgent: 'GavelTest/1.0' });
    assert.deepEqual(await source.fetchNews({ query: 'x' }), []);
  });

  it('degrades to [] when fetch throws (timeout/abort)', async () => {
    const fetch = async () => {
      throw new Error('aborted');
    };
    const source = createGoogleNewsSource({ fetch, userAgent: 'GavelTest/1.0' });
    assert.deepEqual(await source.fetchNews({ query: 'x' }), []);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/news/source.test.js`
Expected: FAIL — `Cannot find module '../../news/source.js'`.

- [ ] **Step 3: Write minimal implementation**

```javascript
// agent/news/source.js
// The NewsSource interface + its first implementation: Google News RSS search (free, no key,
// hyperlocal, real article links). A future exaNewsSource.js exports the same { fetchNews } shape.
// Degrade-safe at the boundary: any failure returns [] so news can never break a caller.

import { parseGoogleNewsRss } from './rss.js';

const DEFAULT_TIMEOUT_MS = 5000;
const ENDPOINT = 'https://news.google.com/rss/search';

/**
 * @param {{ fetch: typeof fetch, userAgent: string, timeoutMs?: number }} deps
 * @returns {{ fetchNews: (input: { query: string, sinceDays?: number }) => Promise<Array<object>> }}
 */
export function createGoogleNewsSource({ fetch, userAgent, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  async function fetchNews({ query, sinceDays = 30 }) {
    if (!query || !query.trim()) return [];
    const q = `${query} when:${sinceDays}d`;
    const url = `${ENDPOINT}?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': userAgent, Accept: 'application/rss+xml, application/xml' },
        signal: controller.signal,
      });
      if (!res.ok) return [];
      return parseGoogleNewsRss(await res.text());
    } catch {
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  return { fetchNews };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/news/source.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add agent/news/source.js agent/tests/news/source.test.js
git commit -m "feat(news): Google News RSS source behind the NewsSource interface"
```

---

## Task 6: Convex `newsCache` table + accessors

**Files:**
- Modify: `agent/convex/schema.ts` (add the `newsCache` table)
- Create: `agent/convex/newsCache.ts` (`getCached` query + `upsertCache` mutation)
- Test: `agent/tests/news/cache-shape.test.js` (a lightweight guard — Convex functions run in the Convex runtime, so this test asserts the article validator shape the service relies on, not the DB itself)

**Interfaces:**
- Produces (Convex, called from node via `ConvexHttpClient`):
  - `api.newsCache.getCached({ key: string }) → Promise<Article[] | null>` (null when missing or expired).
  - `api.newsCache.upsertCache({ key: string, articles: Article[] }) → Promise<Id>` (sets `fetchedAt` + `expiresAt = now + 24h`).
  - `Article = { title: string, url: string, source?: string, publishedAt?: string }`.

- [ ] **Step 1: Write the failing test**

```javascript
// agent/tests/news/cache-shape.test.js
// Guards the Article shape the news service caches. Convex handlers run in the Convex runtime and
// are integration-verified live (Task 9/10 verification); here we lock the field contract so the
// service and the validator can't drift.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ARTICLE_FIELDS } from '../../news/article-shape.js';

describe('cached article shape', () => {
  it('is exactly title/url/source/publishedAt', () => {
    assert.deepEqual([...ARTICLE_FIELDS].sort(), ['publishedAt', 'source', 'title', 'url']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/news/cache-shape.test.js`
Expected: FAIL — `Cannot find module '../../news/article-shape.js'`.

- [ ] **Step 3: Write minimal implementation**

Create the shared shape constant:

```javascript
// agent/news/article-shape.js
// Single source of truth for the cached/surfaced article fields — imported by the service and
// mirrored by the Convex validator so the two can't drift.
export const ARTICLE_FIELDS = Object.freeze(['title', 'url', 'source', 'publishedAt']);
```

Add the table to `convex/schema.ts` (insert alongside the other `defineTable` entries, e.g. right after the `civicComments` table):

```typescript
  newsCache: defineTable({
    key: v.string(),
    articles: v.array(
      v.object({
        title: v.string(),
        url: v.string(),
        source: v.optional(v.string()),
        publishedAt: v.optional(v.string()),
      }),
    ),
    fetchedAt: v.number(),
    expiresAt: v.number(),
  }).index('by_key', ['key']),
```

Create the accessors:

```typescript
// agent/convex/newsCache.ts
// Read-through cache for civic news. Keyed by file number (alert path) or normalized query
// (search path). 24h TTL — a stale row reads as a miss so the caller refetches.
import { v } from 'convex/values';

import { mutation, query } from './_generated/server';

const TTL_MS = 24 * 60 * 60 * 1000;

const articleValidator = v.object({
  title: v.string(),
  url: v.string(),
  source: v.optional(v.string()),
  publishedAt: v.optional(v.string()),
});

export const getCached = query({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const row = await ctx.db
      .query('newsCache')
      .withIndex('by_key', (q) => q.eq('key', key))
      .unique();
    if (!row) return null;
    if (row.expiresAt < Date.now()) return null;
    return row.articles;
  },
});

export const upsertCache = mutation({
  args: { key: v.string(), articles: v.array(articleValidator) },
  handler: async (ctx, { key, articles }) => {
    const now = Date.now();
    const patch = { key, articles, fetchedAt: now, expiresAt: now + TTL_MS };
    const existing = await ctx.db
      .query('newsCache')
      .withIndex('by_key', (q) => q.eq('key', key))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    return ctx.db.insert('newsCache', patch);
  },
});
```

- [ ] **Step 4: Run test + regenerate Convex types**

Run: `node --test tests/news/cache-shape.test.js`
Expected: PASS (1 test).

Run: `npx convex dev --once`
Expected: codegen succeeds; `api.newsCache.getCached` / `upsertCache` appear in `convex/_generated/api`. (This also validates the schema change compiles.)

- [ ] **Step 5: Commit**

```bash
git add agent/news/article-shape.js agent/convex/schema.ts agent/convex/newsCache.ts agent/tests/news/cache-shape.test.js
git commit -m "feat(news): newsCache Convex table + read-through getCached/upsertCache (24h TTL)"
```

---

## Task 7: News service factory (`news/service.js`)

**Files:**
- Create: `agent/news/service.js`
- Test: `agent/tests/news/service.test.js`

**Interfaces:**
- Consumes:
  - `source` — `{ fetchNews }` (Task 5).
  - `generate` — a `createClaudeGenerate({ schema: NEWS_GATE_SCHEMA })` instance (Task 3).
  - `getCached(key) → Promise<Article[]|null>` and `putCached(key, articles) → Promise<unknown>` (node wrappers around Task 6's Convex calls).
  - `now` — `() => number` (default `Date.now`); `maxShown` (default 3); `rawLimit` (default 5).
  - `buildNewsQuery` (Task 2), `filterRelevant` (Task 3) imported directly.
- Produces: `createNewsService(deps) → { enrichForAlert, searchNews }`:
  - `enrichForAlert({ fileNumber, title, addresses }) → Promise<Article[]>` — cache key = `alert:<fileNumber>`; returns `[]` (skips fetch) when `buildNewsQuery` is null; ≤`maxShown` gated articles. Never throws.
  - `searchNews({ term, limit }) → Promise<Article[]>` — cache key = `search:<normalized term>`; gates against the term; ≤`limit` articles. Never throws.

- [ ] **Step 1: Write the failing test**

```javascript
// agent/tests/news/service.test.js
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createNewsService } from '../../news/service.js';

function harness({ fetched = [], gateKeepAll = true, cached = null } = {}) {
  const calls = { fetchNews: 0, generate: 0, put: [] };
  const source = {
    fetchNews: async () => {
      calls.fetchNews++;
      return fetched;
    },
  };
  const generate = async () => {
    calls.generate++;
    return { relevant: gateKeepAll ? fetched.map((_, i) => i) : [] };
  };
  const store = new Map();
  if (cached) store.set(cached.key, cached.articles);
  const deps = {
    source,
    generate,
    getCached: async (key) => store.get(key) ?? null,
    putCached: async (key, articles) => {
      calls.put.push({ key, articles });
      store.set(key, articles);
    },
    now: () => 1_700_000_000_000,
  };
  return { calls, deps };
}

const ART = (n) => ({ title: `Data center story ${n}`, url: `https://a/${n}`, source: 'TMJ4', publishedAt: 'x' });

describe('createNewsService.enrichForAlert', () => {
  it('skips fetch entirely for an item with no query (returns [])', async () => {
    const h = harness({ fetched: [ART(1)] });
    const out = await createNewsService(h.deps).enrichForAlert({
      fileNumber: '260030',
      title: 'Appointment of a member to the board',
      addresses: [],
    });
    assert.deepEqual(out, []);
    assert.equal(h.calls.fetchNews, 0);
  });

  it('fetches, gates, caps to 3, and writes the cache on a miss', async () => {
    const h = harness({ fetched: [ART(1), ART(2), ART(3), ART(4)] });
    const out = await createNewsService(h.deps).enrichForAlert({
      fileNumber: '260030',
      title: 'Data center at 5825 W Hope Ave',
      addresses: ['5825 W Hope Ave'],
    });
    assert.equal(out.length, 3);
    assert.equal(h.calls.fetchNews, 1);
    assert.equal(h.calls.put[0].key, 'alert:260030');
  });

  it('serves from cache without fetching or gating on a hit', async () => {
    const h = harness({ fetched: [ART(9)], cached: { key: 'alert:260030', articles: [ART(1)] } });
    const out = await createNewsService(h.deps).enrichForAlert({
      fileNumber: '260030',
      title: 'Data center at 5825 W Hope Ave',
      addresses: ['5825 W Hope Ave'],
    });
    assert.equal(out.length, 1);
    assert.equal(out[0].url, 'https://a/1');
    assert.equal(h.calls.fetchNews, 0);
    assert.equal(h.calls.generate, 0);
  });

  it('returns [] (never throws) when the source explodes', async () => {
    const h = harness({ fetched: [ART(1)] });
    h.deps.source.fetchNews = async () => {
      throw new Error('network');
    };
    const out = await createNewsService(h.deps).enrichForAlert({
      fileNumber: '260030',
      title: 'Data center at 5825 W Hope Ave',
      addresses: ['5825 W Hope Ave'],
    });
    assert.deepEqual(out, []);
  });
});

describe('createNewsService.searchNews', () => {
  it('gates against the term, caps to limit, caches by normalized query', async () => {
    const h = harness({ fetched: [ART(1), ART(2)] });
    const out = await createNewsService(h.deps).searchNews({ term: '  Data Center ', limit: 5 });
    assert.equal(out.length, 2);
    assert.equal(h.calls.put[0].key, 'search:data center');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/news/service.test.js`
Expected: FAIL — `Cannot find module '../../news/service.js'`.

- [ ] **Step 3: Write minimal implementation**

```javascript
// agent/news/service.js
// Ties the news pieces together for both surfaces: cache-first → fetch → Claude gate → cap.
// Every public method is degrade-safe (returns [] on any failure) so news can never break an
// alert or a search.
import { buildNewsQuery } from './query.js';
import { filterRelevant } from './relevance.js';

const DEFAULT_RAW_LIMIT = 5;
const DEFAULT_MAX_SHOWN = 3;

const normalizeTerm = (term) => String(term ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * @param {{
 *   source: { fetchNews: (input: { query: string }) => Promise<object[]> },
 *   generate: (input: { system: string, prompt: string }) => Promise<{ relevant: number[] }>,
 *   getCached: (key: string) => Promise<object[]|null>,
 *   putCached: (key: string, articles: object[]) => Promise<unknown>,
 *   now?: () => number,
 *   rawLimit?: number,
 *   maxShown?: number,
 * }} deps
 */
export function createNewsService(deps) {
  const { source, generate, getCached, putCached, rawLimit = DEFAULT_RAW_LIMIT, maxShown = DEFAULT_MAX_SHOWN } = deps;

  async function resolve(key, query, subject, cap) {
    try {
      const cached = await getCached(key).catch(() => null);
      if (cached) return cached.slice(0, cap);
      const raw = (await source.fetchNews({ query })).slice(0, rawLimit);
      const gated = (await filterRelevant(subject, raw, { generate })).slice(0, cap);
      await putCached(key, gated).catch(() => {});
      return gated;
    } catch {
      return [];
    }
  }

  async function enrichForAlert({ fileNumber, title, addresses }) {
    const built = buildNewsQuery({ title, addresses });
    if (!built) return [];
    const subject = [title, built.address].filter(Boolean).join(' — ');
    return resolve(`alert:${fileNumber}`, built.query, subject, maxShown);
  }

  async function searchNews({ term, limit = DEFAULT_RAW_LIMIT }) {
    const normalized = normalizeTerm(term);
    if (!normalized) return [];
    return resolve(`search:${normalized}`, `${term} Milwaukee`, term, limit);
  }

  return { enrichForAlert, searchNews };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/news/service.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add agent/news/service.js agent/tests/news/service.test.js
git commit -m "feat(news): createNewsService — cache-first fetch+gate for alert & search surfaces"
```

---

## Task 8: Alert card news block (`alerts/card.js`)

**Files:**
- Modify: `agent/alerts/card.js` (add `newsLinks` param + 📰 context block)
- Test: `agent/tests/alerts/card.test.js` (existing file — add cases)

**Interfaces:**
- Consumes: `newsLinks: Article[]` (`{ title, url, source, publishedAt }`), default `[]`.
- Produces: `buildAlertCard({ ...existing, newsLinks })` — when `newsLinks.length > 0`, appends one `context` block titled `📰 *In the local news*` with up to 3 lines `• <url|title> · source`. When empty, the card is byte-identical to today.

- [ ] **Step 1: Write the failing test (add to `agent/tests/alerts/card.test.js`)**

```javascript
// Add inside agent/tests/alerts/card.test.js
import { buildAlertCard } from '../../alerts/card.js'; // already imported in this file — do not duplicate

describe('buildAlertCard — local news enrichment', () => {
  const baseArgs = {
    row: { title: 'Data center at 5825 W Hope Ave', eventBodyName: 'CITY PLAN COMMISSION' },
    matter: { fileNumber: '260030' },
    event: { date: '2026-06-29' },
    summary: { en: 'Summary.', es: 'Resumen.' },
    footer: { text: 'How to be heard…' },
    language: 'en',
  };

  it('adds a 📰 In the local news block with linked headlines when articles pass', () => {
    const card = buildAlertCard({
      ...baseArgs,
      newsLinks: [
        { title: 'Data center planned', url: 'https://tmj4.com/x', source: 'TMJ4', publishedAt: 'x' },
      ],
    });
    const json = JSON.stringify(card.blocks);
    assert.match(json, /In the local news/);
    assert.match(json, /<https:\/\/tmj4\.com\/x\|Data center planned>/);
  });

  it('omits the news block entirely when there are no articles (card unchanged)', () => {
    const withNews = buildAlertCard({ ...baseArgs, newsLinks: [] });
    const withoutParam = buildAlertCard({ ...baseArgs });
    assert.equal(JSON.stringify(withNews.blocks), JSON.stringify(withoutParam.blocks));
    assert.doesNotMatch(JSON.stringify(withNews.blocks), /In the local news/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/alerts/card.test.js`
Expected: FAIL — assertion: `/In the local news/` not found (param ignored).

- [ ] **Step 3: Write minimal implementation**

In `agent/alerts/card.js`, add `newsLinks = []` to the destructured params of `buildAlertCard`, and append the block immediately before the `return`/action-buttons assembly (after the footer section). Use the existing block array (`blocks`):

```javascript
// In buildAlertCard signature — add the param:
export function buildAlertCard({ row, matter, event, summary, footer, language = 'en', member = null, newsLinks = [] }) {
  // ... existing block construction unchanged ...

  // 📰 Local news enrichment — only when ≥1 gated article. Real links only, no Gavel summary.
  if (Array.isArray(newsLinks) && newsLinks.length > 0) {
    const lines = newsLinks
      .slice(0, 3)
      .map((a) => `• <${a.url}|${a.title}>${a.source ? ` · ${a.source}` : ''}`)
      .join('\n');
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `📰 *In the local news*\n${lines}` }],
    });
  }

  // ... existing return ...
}
```

(Place the `blocks.push` after the footer section is pushed and before the action-button block, so news sits above the buttons. Keep all existing lines exactly as they are.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/alerts/card.test.js`
Expected: PASS (existing card tests + 2 new).

- [ ] **Step 5: Commit**

```bash
git add agent/alerts/card.js agent/tests/alerts/card.test.js
git commit -m "feat(news): 📰 In the local news block on alert cards (omitted when empty)"
```

---

## Task 9: Alert path wiring (`alerts/process.js` + `scripts/poll-once.mjs`)

**Files:**
- Modify: `agent/alerts/process.js` (call news enrichment, thread `newsLinks` into the card)
- Modify: `agent/scripts/poll-once.mjs` (construct the news service, pass `enrichNews`)
- Test: `agent/tests/alerts/process.test.js` (existing file — add a degrade + enrich case)

**Interfaces:**
- Consumes: a new optional dep on `processPendingAlerts`: `enrichNews: ({ fileNumber, title, addresses }) => Promise<Article[]>` (default `async () => []`).
- Produces: each posted card includes `newsLinks` from `enrichNews`; if `enrichNews` rejects, the alert still posts with no news block.

- [ ] **Step 1: Write the failing test (add to `agent/tests/alerts/process.test.js`)**

```javascript
// Add a focused test using the file's existing harness/mocks. The key assertions:
it('passes enriched news links into the posted card', async () => {
  const posted = [];
  await processPendingAlerts({
    ...baseDeps, // the existing test's dependency bundle
    enrichNews: async () => [{ title: 'Data center planned', url: 'https://x', source: 'TMJ4', publishedAt: 'x' }],
    postCard: (channel, card) => posted.push(card),
  });
  assert.match(JSON.stringify(posted.at(-1)?.blocks ?? []), /In the local news/);
});

it('still posts the alert when news enrichment rejects', async () => {
  const posted = [];
  await processPendingAlerts({
    ...baseDeps,
    enrichNews: async () => {
      throw new Error('news down');
    },
    postCard: (channel, card) => posted.push(card),
  });
  assert.ok(posted.length > 0, 'alert posted despite news failure');
  assert.doesNotMatch(JSON.stringify(posted.at(-1).blocks), /In the local news/);
});
```

> Implementer note: reuse this test file's existing setup for `baseDeps`/mocks (listPending returning one row, subscriptions matching one channel, etc.). If the file lacks a reusable `baseDeps`, extract one from an existing passing test in the same file first, then add these two cases.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/alerts/process.test.js`
Expected: FAIL — news block not present (no `enrichNews` wired) / or `enrichNews` not consumed.

- [ ] **Step 3: Write minimal implementation**

In `agent/alerts/process.js`:
1. Destructure the new dep with a safe default: `enrichNews = async () => []`.
2. After the bilingual summary is produced (where `summary` exists, before the card is built), resolve news degrade-safely and pass it to `buildAlertCard`:

```javascript
// inside the per-row loop, after: const summary = await generateBilingual(matter);
const addresses = Array.isArray(summary?.addresses) ? summary.addresses : [];
const newsLinks = await enrichNews({ fileNumber: ctx.matter.fileNumber, title: row.title, addresses }).catch(
  () => [],
);

// then add newsLinks to each buildAlertCard(...) call, e.g.:
const cardFor = (language) =>
  buildAlertCard({ row, matter: ctx.matter, event: ctx.event, summary, footer, language, member, newsLinks });
```

> Implementer note: match the file's actual `buildAlertCard(...)` call site(s) — add `newsLinks` to the existing args object; change nothing else. Confirm `summary.addresses` exists by reading `summarizer/summarize.js` (the bilingual schema includes `addresses`); if the bilingual result nests language variants, read `addresses` from the top level of the result (it is shared, not per-language).

In `agent/scripts/poll-once.mjs`:
1. Import and build the service near the existing `generate`/`convex`/`USER_AGENT` setup:

```javascript
import { createGoogleNewsSource } from '../news/source.js';
import { createNewsService } from '../news/service.js';
import { createClaudeGenerate } from '../summarizer/client.js';
import { NEWS_GATE_SCHEMA } from '../news/relevance.js';

const newsSource = createGoogleNewsSource({ fetch, userAgent: USER_AGENT });
const newsGate = createClaudeGenerate({ schema: NEWS_GATE_SCHEMA });
const newsService = createNewsService({
  source: newsSource,
  generate: newsGate,
  getCached: (key) => convex.query(api.newsCache.getCached, { key }),
  putCached: (key, articles) => convex.mutation(api.newsCache.upsertCache, { key, articles }),
});
```

2. Pass it into the `processPendingAlerts({ ... })` call:

```javascript
enrich: (row) => enrichForAlert(row, legistar),
enrichNews: (input) => newsService.enrichForAlert(input),
generateBilingual: (matter) => summarizeMatterBilingual(matter, { generate }),
```

- [ ] **Step 4: Run test + full suite**

Run: `node --test tests/alerts/process.test.js`
Expected: PASS (existing + 2 new).

Run: `node --test`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add agent/alerts/process.js agent/scripts/poll-once.mjs agent/tests/alerts/process.test.js
git commit -m "feat(news): wire news enrichment into the alert path (degrade-safe)"
```

---

## Task 10: Search lane (`federated-card.js` + `gavel.js` + `commands/index.js`)

**Files:**
- Modify: `agent/civicmail/federated-card.js` (register `news` in `SOURCE_META` + `SOURCE_ORDER`)
- Modify: `agent/listeners/commands/gavel.js` (add the `news` group to `runSearch`)
- Modify: `agent/listeners/commands/index.js` (wire `deps.searchNews` to the news service)
- Test: `agent/tests/civicmail/federated-card.test.js` (existing — add a news-group render case) and `agent/tests/listeners/commands/gavel.test.js` (existing — add a news-lane case)

**Interfaces:**
- Consumes: `deps.searchNews({ term, limit }) → Promise<Article[]>` (Task 7), and `normalizeNews` (Task 4).
- Produces: `/gavel search` renders a `📰 Local news` group (5th lane) of linked headlines. When `searchNews` is absent or returns `[]`, no news group renders (card unchanged).

- [ ] **Step 1: Write the failing tests**

Federated card render (add to `agent/tests/civicmail/federated-card.test.js`):

```javascript
it('renders a 📰 Local news group from news results', () => {
  const card = buildFederatedResultsCard({
    term: 'data center',
    language: 'en',
    groups: [
      {
        source: 'news',
        results: [
          { source: 'news', headline: '<https://x|Data center planned>', meta: 'TMJ4 · 2026-06-24', snippet: null, messageId: null },
        ],
      },
    ],
  });
  const json = JSON.stringify(card.blocks);
  assert.match(json, /Local news/);
  assert.match(json, /<https:\/\/x\|Data center planned>/);
});
```

Search lane wiring (add to `agent/tests/listeners/commands/gavel.test.js`, mirroring an existing `runSearch` test's harness):

```javascript
it('includes a news group when searchNews returns gated articles', async () => {
  const card = await runSearch(
    { /* parsed ctx as the existing tests build it */ },
    {
      ...searchDeps, // the existing test's deps bundle
      searchNews: async () => [{ title: 'Data center planned', url: 'https://x', source: 'TMJ4', publishedAt: 'x' }],
    },
  );
  assert.match(JSON.stringify(card.blocks), /Local news/);
});
```

> Implementer note: reuse the existing test harness in each file for `buildFederatedResultsCard` imports and the `runSearch` deps/ctx shape. If `runSearch` isn't exported, follow the existing tests' invocation path (they already exercise it).

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/civicmail/federated-card.test.js tests/listeners/commands/gavel.test.js`
Expected: FAIL — `Local news` not rendered (source not registered / lane not added).

- [ ] **Step 3: Write minimal implementation**

In `agent/civicmail/federated-card.js`:

```javascript
const SOURCE_META = {
  mail: { emoji: '📬', label: { en: 'Civic mail', es: 'Correo cívico' } },
  agenda: { emoji: '🏛️', label: { en: 'Upcoming agendas', es: 'Agendas próximas' } },
  minutes: { emoji: '🎙️', label: { en: 'Meeting minutes', es: 'Actas de reuniones' } },
  zoning: { emoji: '📖', label: { en: 'Zoning code', es: 'Código de zonificación' } },
  news: { emoji: '📰', label: { en: 'Local news', es: 'Noticias locales' } },
};
const SOURCE_ORDER = ['mail', 'agenda', 'minutes', 'zoning', 'news'];
```

In `agent/listeners/commands/gavel.js` `runSearch`:
1. Add the news fetch to the parallel block (mirror the `safe(...)` pattern), unconditional on `vector` (news is keyword, not vector):

```javascript
const newsHits = await safe(deps.searchNews?.({ term: parsed.display, limit: 5 })) ?? [];
```

2. Import `normalizeNews` and append the group:

```javascript
import { normalizeNews } from '../../news/normalize.js';
// ...
const groups = [
  { source: 'mail', results: mail.slice(0, PER_SOURCE_LIMIT).map(normalizeMail) },
  { source: 'agenda', results: agendas.slice(0, PER_SOURCE_LIMIT).map(normalizeAgenda) },
  { source: 'minutes', results: minutesHits.slice(0, PER_SOURCE_LIMIT).map(normalizeMinutes) },
  { source: 'zoning', results: zoningHits.slice(0, PER_SOURCE_LIMIT).map(normalizeZoning) },
  { source: 'news', results: newsHits.slice(0, PER_SOURCE_LIMIT).map(normalizeNews) },
];
```

> Implementer note: place the `newsHits` fetch with the other lane fetches (whether inside or just after the existing `Promise.all`); match the file's `safe(...)` helper and `PER_SOURCE_LIMIT` constant exactly.

In `agent/listeners/commands/index.js`, build the news service (same construction as `poll-once.mjs`) and wire the dep:

```javascript
import { createGoogleNewsSource } from '../../news/source.js';
import { createNewsService } from '../../news/service.js';
import { createClaudeGenerate } from '../../summarizer/client.js';
import { NEWS_GATE_SCHEMA } from '../../news/relevance.js';

const USER_AGENT = 'GavelCivicAgent/0.1 (+https://github.com/tmoody1973/gavel-slack-agent; contact tarik@radiomilwaukee.org)';
const newsService = createNewsService({
  source: createGoogleNewsSource({ fetch, userAgent: USER_AGENT }),
  generate: createClaudeGenerate({ schema: NEWS_GATE_SCHEMA }),
  getCached: (key) => requireConvex(convex).query(api.newsCache.getCached, { key }),
  putCached: (key, articles) => requireConvex(convex).mutation(api.newsCache.upsertCache, { key, articles }),
});

// add to the deps object passed to the command handler:
searchNews: (input) => newsService.searchNews(input),
```

> Implementer note: match the file's existing Convex accessor (`requireConvex(convex)` vs a bare `convex`) and the `deps` assembly. If a shared `USER_AGENT` already exists in scope, import/reuse it instead of redefining.

- [ ] **Step 4: Run tests + full suite + lint**

Run: `node --test tests/civicmail/federated-card.test.js tests/listeners/commands/gavel.test.js`
Expected: PASS.

Run: `node --test`
Expected: all green.

Run: `npx @biomejs/biome check .`
Expected: clean (fix any formatting it flags).

- [ ] **Step 5: Commit**

```bash
git add agent/civicmail/federated-card.js agent/listeners/commands/gavel.js agent/listeners/commands/index.js agent/tests/civicmail/federated-card.test.js agent/tests/listeners/commands/gavel.test.js
git commit -m "feat(news): add the 📰 news lane to /gavel search"
```

---

## Final verification (after all tasks)

- [ ] `node --test` → all green (new: rss, query, relevance, normalize, source, cache-shape, service, + card/process/federated/gavel additions).
- [ ] `npx @biomejs/biome check .` → clean.
- [ ] `npx convex dev --once` → `newsCache` table + functions deployed to `vivid-weasel-903`.
- [ ] **Live (alert):** run `node scripts/poll-once.mjs` (or trigger an alert) for the Midtown data center (File #260030, 5825 W Hope Ave) → the card shows real WTMJ/NNS links under 📰 In the local news, gated. An item with no coverage shows NO news block.
- [ ] **Live (search):** `/gavel search data center` → a 📰 Local news group with real, on-topic links. `/gavel search` for a term with no coverage shows the other lanes only, no empty news noise.
- [ ] **Degrade:** temporarily point the source at an unreachable URL → alerts and search still render, just without news (no errors surfaced to users).
- [ ] **Deploy:** redeploy BOTH Fly apps (`gavel-app` interactive search lane + `gavel-poller` alert enrichment) — shared `news/` code changes both. `cd agent && fly deploy --remote-only` (poller) and `fly deploy -c fly.app.toml --remote-only` from root (app).

---

## Self-review notes (author)

- **Spec coverage:** NewsSource interface + Google RSS (T5) ✔ · buildNewsQuery incl. null cases (T2) ✔ · filterRelevant gate (T3) ✔ · alert 📰 block, omitted when empty, never breaks alert (T8/T9) ✔ · `/gavel search` news lane (T10) ✔ · newsCache keyed by file# (alert) / query (search) + 24h TTL read-through (T6/T7) ✔ · real links only / no Gavel summaries (T4 `snippet:null`, global constraint) ✔ · Exa seam documented, not built (T5 doc) ✔ · external-press-only (global constraint; relevance gate excludes city's own) ✔.
- **Simplification vs spec:** the spec's separate `normalize.js → { title, url, source, date }` is reconciled to the real federated-card result-row shape (linked headline) so it renders with zero card-builder changes. Address comes from the existing summarizer `addresses` output — no new extraction step.
- **Type consistency:** `RawArticle {title,url,source,publishedAt}` flows rss→source→service→card; `normalizeNews` converts to the federated row only at the search surface. `NEWS_GATE_SCHEMA` is defined in T3 and consumed in T9/T10. Cache `Article` fields are pinned by `ARTICLE_FIELDS` (T6) and the Convex validator.
- **Known implementer reads (not placeholders — explicit instructions):** confirm the exact `buildAlertCard` call site args in `process.js`; confirm `summary.addresses` top-level field in `summarizer/summarize.js`; reuse existing test harnesses in `process.test.js` / `gavel.test.js` / `federated-card.test.js`.
