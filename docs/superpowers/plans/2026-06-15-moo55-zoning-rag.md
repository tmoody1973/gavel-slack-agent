# MOO-55 Zoning-code RAG Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Index the Milwaukee zoning code (Chapter 295) into a Convex vector namespace and add an `ask_zoning_code(address, question)` agent tool that resolves an address to its zoning class, retrieves only the code governing that class, and answers with verifiable `295-NNN` citations.

**Architecture:** Three units — (1) an offline ingest script that downloads the Ch.295 PDFs, structure-aware-chunks them by section, embeds with OpenAI, and upserts to Convex; (2) a Convex `zoningChunks` table with a vector index filtered by code-family; (3) an in-process agent tool that does address→class→family resolution, embeds the question, runs the filtered vector search, and hands cited sections to Claude.

**Tech Stack:** Node ESM, `node --test`, Convex vector search, OpenAI `text-embedding-3-small` (via injected `fetch`), `pdfjs-dist` (Node legacy build), `@anthropic-ai/claude-agent-sdk` (`createSdkMcpServer`/`tool`).

**Run all commands from `agent/`.** Spec: `docs/superpowers/specs/2026-06-15-moo55-zoning-rag-design.md`.

---

### Task 1: Dependencies + Convex `zoningChunks` schema

**Files:**
- Modify: `agent/package.json` (add `pdfjs-dist`)
- Modify: `agent/convex/schema.ts` (append `zoningChunks` table)

- [ ] **Step 1: Add the PDF dependency**

Run: `npm install pdfjs-dist`
Expected: `pdfjs-dist` added to `dependencies`.

- [ ] **Step 2: Add the `zoningChunks` table + vector index**

In `agent/convex/schema.ts`, add this table inside the `defineSchema({ ... })` object (after `detectedAgendaItems`):

```ts
  // Zoning-code semantic layer (MOO-55). One row per Ch.295 code section (or an
  // intact district/use table). PUBLIC RECORD ONLY — the city's published zoning
  // code; no Slack content. `family` groups zoning classes the way the code's own
  // subchapters do (residential/commercial/...); `scope` separates district-
  // specific sections from general/definitions that apply everywhere.
  zoningChunks: defineTable({
    section: v.string(), // "295-505" or "295-Table"
    text: v.string(),
    embedding: v.array(v.float64()), // text-embedding-3-small → 1536
    family: v.string(), // "residential" | "commercial" | "downtown" | "industrial" | "special" | "overlay" | "general"
    scope: v.string(), // "district" | "general"
    parent: v.string(), // "Subchapter 5 — Residential Districts"
    sourceUrl: v.string(),
  })
    .index('by_section', ['section'])
    .vectorIndex('by_embedding', {
      vectorField: 'embedding',
      dimensions: 1536,
      filterFields: ['family', 'scope'],
    }),
```

- [ ] **Step 3: Regenerate Convex types**

Run: `npx convex dev --once`
Expected: `✔ Convex functions ready!` and `convex/_generated` updated (the new table appears in `dataModel`).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json convex/schema.ts convex/_generated
git commit -m "feat(zoning): zoningChunks vector table + pdfjs dep (MOO-55)"
```

---

### Task 2: `zoningClassToFamily` map (pure)

Maps an MPROP zoning class (e.g. `RT4`) to the Ch.295 code family. Unknown classes return `null` (the tool then serves general-scope chunks only and discloses the class was unmapped).

**Files:**
- Create: `agent/zoning/family.js`
- Test: `agent/tests/zoning/family.test.js`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { zoningClassToFamily } from '../../zoning/family.js';

test('residential classes map to residential', () => {
  for (const c of ['RT4', 'RT3', 'RS6', 'RM7', 'RO2']) {
    assert.equal(zoningClassToFamily(c), 'residential', c);
  }
});

test('commercial / downtown / industrial / special families', () => {
  assert.equal(zoningClassToFamily('LB2'), 'commercial');
  assert.equal(zoningClassToFamily('NS1'), 'commercial');
  assert.equal(zoningClassToFamily('C9A'), 'downtown');
  assert.equal(zoningClassToFamily('IL2'), 'industrial');
  assert.equal(zoningClassToFamily('IM'), 'industrial');
  assert.equal(zoningClassToFamily('PD'), 'special');
});

test('case-insensitive and tolerant of whitespace', () => {
  assert.equal(zoningClassToFamily(' rt4 '), 'residential');
});

test('unknown or empty class returns null', () => {
  assert.equal(zoningClassToFamily('ZZ9'), null);
  assert.equal(zoningClassToFamily(''), null);
  assert.equal(zoningClassToFamily(null), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/zoning/family.test.js`
Expected: FAIL — cannot find module `../../zoning/family.js`.

- [ ] **Step 3: Write minimal implementation**

```js
/**
 * Map an MPROP zoning class to its Milwaukee Ch.295 code family. The code's
 * subchapters are organized by these families, so the family is the retrieval
 * filter key — NOT the aldermanic district. Unknown classes → null.
 * @param {string|null|undefined} zoningClass e.g. "RT4"
 * @returns {string|null}
 */
export function zoningClassToFamily(zoningClass) {
  const code = String(zoningClass ?? '')
    .trim()
    .toUpperCase();
  if (!code) return null;
  // Prefix rules, longest-first where it matters. Residential: RT/RS/RM/RO.
  if (/^R[TSMO]/.test(code)) return 'residential';
  // Commercial: LB (local business), NS (neighborhood shopping), CS, RB, TB.
  if (/^(LB|NS|CS|RB|TB)/.test(code)) return 'commercial';
  // Downtown: C9 districts.
  if (/^C9/.test(code)) return 'downtown';
  // Industrial: IL/IM/IH/IO/IB.
  if (/^I[LMHOB]/.test(code)) return 'industrial';
  // Special / planned: PD (planned development), TL, T (transitional).
  if (/^(PD|TL|T\d)/.test(code)) return 'special';
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/zoning/family.test.js`
Expected: PASS (4 tests).

> NOTE: the prefix rules are a first pass. Task 10's live verification validates them against the real distinct `ZONING` values in MPROP; tune the regexes there if a real class is misfiled.

- [ ] **Step 5: Commit**

```bash
git add zoning/family.js tests/zoning/family.test.js
git commit -m "feat(zoning): zoningClassToFamily map (MOO-55)"
```

---

### Task 3: Ch.295 source manifest (pure)

The canonical list of subchapter PDFs to ingest, each tagged with its `family` and `scope`, plus the dimensional/use table.

**Files:**
- Create: `agent/zoning/sources.js`
- Test: `agent/tests/zoning/sources.test.js`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CH295_SOURCES } from '../../zoning/sources.js';

test('every source has a url, parent, family, scope', () => {
  assert.ok(CH295_SOURCES.length >= 8);
  for (const s of CH295_SOURCES) {
    assert.match(s.url, /^https:\/\/city\.milwaukee\.gov\/.*\.pdf$/);
    assert.ok(s.parent && s.family && s.scope);
    assert.ok(['district', 'general', 'table'].includes(s.scope));
  }
});

test('subchapters 1-4 are general scope; residential is district scope', () => {
  const general = CH295_SOURCES.filter((s) => s.scope === 'general');
  assert.ok(general.some((s) => /Definitions/i.test(s.parent)));
  const residential = CH295_SOURCES.find((s) => s.family === 'residential');
  assert.equal(residential.scope, 'district');
});

test('includes the intact zoning table source', () => {
  const table = CH295_SOURCES.find((s) => s.scope === 'table');
  assert.ok(table);
  assert.match(table.url, /CH295table\.pdf$/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/zoning/sources.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
/** Authoritative Ch.295 ZONING PDFs (city.milwaukee.gov, Volume 2). Each entry
 * is one subchapter; `family`/`scope` classify its chunks for parcel-conditioned
 * retrieval. The TABLE is ingested whole (scope "table"). */
const BASE = 'https://city.milwaukee.gov/ImageLibrary/Groups/ccClerk/Ordinances/Volume-2';

export const CH295_SOURCES = [
  { file: 'CH295-sub1.pdf', parent: 'Subchapter 1 — Introduction', family: 'general', scope: 'general' },
  { file: 'CH295-sub2.pdf', parent: 'Subchapter 2 — Definitions and Rules of Measurement', family: 'general', scope: 'general' },
  { file: 'CH295-sub3.pdf', parent: 'Subchapter 3 — Administration, Enforcement and Appeals', family: 'general', scope: 'general' },
  { file: 'CH295-sub4.pdf', parent: 'Subchapter 4 — General Provisions', family: 'general', scope: 'general' },
  { file: 'CH295-sub5.pdf', parent: 'Subchapter 5 — Residential Districts', family: 'residential', scope: 'district' },
  { file: 'CH295-sub6.pdf', parent: 'Subchapter 6 — Commercial Districts', family: 'commercial', scope: 'district' },
  { file: 'CH295-sub7.pdf', parent: 'Subchapter 7 — Downtown Districts', family: 'downtown', scope: 'district' },
  { file: 'CH295-sub8.pdf', parent: 'Subchapter 8 — Industrial Districts', family: 'industrial', scope: 'district' },
  { file: 'CH295-sub9.pdf', parent: 'Subchapter 9 — Special Districts', family: 'special', scope: 'district' },
  { file: 'CH295-sub10.pdf', parent: 'Subchapter 10 — Overlay Zones', family: 'overlay', scope: 'district' },
  { file: 'CH295table.pdf', parent: 'Chapter 295 — Zoning Table', family: 'general', scope: 'table' },
].map((s) => ({ ...s, url: `${BASE}/${s.file}` }));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/zoning/sources.test.js`
Expected: PASS (3 tests).

> NOTE: subchapter filenames are validated live in Task 9 (a 404 logs and skips that source — no silent drop). Subchapter 11 (Floodplain) is intentionally omitted as out-of-demo-scope; add it later if needed.

- [ ] **Step 5: Commit**

```bash
git add zoning/sources.js tests/zoning/sources.test.js
git commit -m "feat(zoning): Ch.295 PDF source manifest (MOO-55)"
```

---

### Task 4: Structure-aware chunker (pure)

Splits extracted page text into per-section chunks on the `295-NNN` numbering, attaching the parent breadcrumb. Table sources are returned as one intact chunk.

**Files:**
- Create: `agent/zoning/chunk.js`
- Test: `agent/tests/zoning/chunk.test.js`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chunkSections } from '../../zoning/chunk.js';

const meta = { parent: 'Subchapter 5 — Residential Districts', family: 'residential', scope: 'district', sourceUrl: 'https://city.milwaukee.gov/x/CH295-sub5.pdf' };

const text = [
  '295-501. Purpose. The residential districts are established to...',
  'protect neighborhood character.',
  '295-505. RT4 Two-Family Residential. 1. PERMITTED USES. Two-family dwellings are permitted.',
  '2. DIMENSIONAL STANDARDS. Minimum lot area is 4000 square feet.',
  '295-509. RM Districts. Multi-family dwellings are permitted.',
].join('\n');

test('splits into one chunk per 295-NNN section, carrying the section id', () => {
  const chunks = chunkSections(text, meta);
  const sections = chunks.map((c) => c.section);
  assert.deepEqual(sections, ['295-501', '295-505', '295-509']);
});

test('each chunk carries family, scope, parent, sourceUrl and the section text', () => {
  const rt4 = chunkSections(text, meta).find((c) => c.section === '295-505');
  assert.equal(rt4.family, 'residential');
  assert.equal(rt4.scope, 'district');
  assert.equal(rt4.parent, meta.parent);
  assert.equal(rt4.sourceUrl, meta.sourceUrl);
  assert.match(rt4.text, /PERMITTED USES/);
  assert.match(rt4.text, /4000 square feet/); // sub-paragraphs stay with their section
});

test('a table source becomes one intact chunk, never split on 295-NNN', () => {
  const tableMeta = { ...meta, parent: 'Chapter 295 — Zoning Table', scope: 'table', family: 'general' };
  const tableText = '295-Table. RT4 | min lot 4000 | 295-505 ref | RM | min lot 2000';
  const chunks = chunkSections(tableText, tableMeta);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].section, '295-Table');
  assert.match(chunks[0].text, /RM \| min lot 2000/);
});

test('text before the first section is ignored (page headers/footers)', () => {
  const chunks = chunkSections('Zoning 295-501 -771- 4/22/2025\n295-501. Purpose. Body.', meta);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].section, '295-501');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/zoning/chunk.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
/** Matches a section heading like "295-505." at the start of a line. The
 * trailing dot disambiguates headings from cross-references ("see 295-505"). */
const SECTION_HEADING = /(?:^|\n)\s*(295-\d+)\.\s/g;

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
  const matches = [...text.matchAll(SECTION_HEADING)];
  const chunks = [];
  for (let i = 0; i < matches.length; i++) {
    const section = matches[i][1];
    const start = matches[i].index + matches[i][0].length - (matches[i][0].length - matches[i][0].indexOf(section));
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const body = collapse(text.slice(start, end));
    if (body) chunks.push({ section, text: body, ...base });
  }
  return chunks;
}

/** Collapse runs of whitespace/newlines to single spaces; trim. */
function collapse(s) {
  return s.replace(/\s+/g, ' ').trim();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/zoning/chunk.test.js`
Expected: PASS (4 tests). If the `start` slice mis-includes the heading id, simplify: split the text on `SECTION_HEADING` capturing the id, then pair id→body. Acceptable equivalent implementation:

```js
const parts = text.split(/(?:^|\n)\s*(295-\d+)\.\s/);
// parts[0] = preamble; then alternating [id, body, id, body...]
const chunks = [];
for (let i = 1; i < parts.length; i += 2) {
  const body = collapse(parts[i + 1] ?? '');
  if (body) chunks.push({ section: parts[i], text: body, ...base });
}
return chunks;
```

Prefer whichever passes the tests; keep only one.

- [ ] **Step 5: Commit**

```bash
git add zoning/chunk.js tests/zoning/chunk.test.js
git commit -m "feat(zoning): structure-aware 295-NNN chunker, tables intact (MOO-55)"
```

---

### Task 5: OpenAI embeddings helper (pure, injected fetch)

**Files:**
- Create: `agent/zoning/embed.js`
- Test: `agent/tests/zoning/embed.test.js`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { embedTexts } from '../../zoning/embed.js';

function fakeFetch(captured) {
  return async (url, init) => {
    captured.url = url;
    captured.body = JSON.parse(init.body);
    captured.auth = init.headers.Authorization;
    const data = captured.body.input.map((_, i) => ({ embedding: Array(1536).fill(i / 10) }));
    return { ok: true, json: async () => ({ data }) };
  };
}

test('embeds a batch and returns one vector per input, in order', async () => {
  const captured = {};
  const vectors = await embedTexts(['a', 'b', 'c'], { apiKey: 'sk-test', fetchFn: fakeFetch(captured) });
  assert.equal(vectors.length, 3);
  assert.equal(vectors[0].length, 1536);
  assert.equal(captured.body.model, 'text-embedding-3-small');
  assert.deepEqual(captured.body.input, ['a', 'b', 'c']);
  assert.equal(captured.auth, 'Bearer sk-test');
});

test('throws a clear error on a non-ok response', async () => {
  const fetchFn = async () => ({ ok: false, status: 429, text: async () => 'rate limited' });
  await assert.rejects(() => embedTexts(['a'], { apiKey: 'sk', fetchFn }), /embeddings request failed: 429/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/zoning/embed.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
const ENDPOINT = 'https://api.openai.com/v1/embeddings';
const MODEL = 'text-embedding-3-small';

/**
 * Embed a batch of strings with OpenAI text-embedding-3-small. `fetchFn` and
 * `apiKey` are injected so the chunker/ingest pipeline is unit-tested and only
 * the ingest script touches the network. Returns vectors in input order.
 * @param {string[]} texts
 * @param {{apiKey:string, fetchFn?:typeof fetch}} options
 * @returns {Promise<number[][]>}
 */
export async function embedTexts(texts, { apiKey, fetchFn = fetch }) {
  if (texts.length === 0) return [];
  const res = await fetchFn(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: MODEL, input: texts }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`embeddings request failed: ${res.status} ${detail}`);
  }
  const body = await res.json();
  return body.data.map((d) => d.embedding);
}

/** Single-string convenience used by the live tool. */
export async function embedQuery(text, options) {
  const [vector] = await embedTexts([text], options);
  return vector;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/zoning/embed.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add zoning/embed.js tests/zoning/embed.test.js
git commit -m "feat(zoning): OpenAI embeddings helper (injected fetch) (MOO-55)"
```

---

### Task 6: Convex `zoning.ts` — upsert, fetch, vector search

Convex functions are verified by codegen + Task 10 live run (they need the Convex runtime, not `node --test`). Keep them thin; all testable logic lives in the pure helpers above.

**Files:**
- Create: `agent/convex/zoning.ts`

- [ ] **Step 1: Write the Convex functions**

```ts
import { v } from 'convex/values';

import { action, internalMutation, internalQuery, mutation, query } from './_generated/server';
import { internal } from './_generated/api';

const chunkFields = {
  section: v.string(),
  text: v.string(),
  embedding: v.array(v.float64()),
  family: v.string(),
  scope: v.string(),
  parent: v.string(),
  sourceUrl: v.string(),
};

/** Idempotent ingest: replace any existing chunk with the same section. */
export const upsertChunk = mutation({
  args: chunkFields,
  handler: async (ctx, chunk) => {
    const existing = await ctx.db
      .query('zoningChunks')
      .withIndex('by_section', (q) => q.eq('section', chunk.section))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, chunk);
      return existing._id;
    }
    return ctx.db.insert('zoningChunks', chunk);
  },
});

/** Count rows — the ingest script's sanity check. */
export const count = query({
  args: {},
  handler: async (ctx) => (await ctx.db.query('zoningChunks').collect()).length,
});

/** Load chunk docs by id (vector search returns ids only, from an action). */
export const fetchChunks = internalQuery({
  args: { ids: v.array(v.id('zoningChunks')) },
  handler: async (ctx, { ids }) => {
    const docs = await Promise.all(ids.map((id) => ctx.db.get(id)));
    return docs
      .filter((d) => d !== null)
      .map((d) => ({ section: d.section, text: d.text, parent: d.parent, sourceUrl: d.sourceUrl }));
  },
});

/**
 * Parcel-conditioned vector search: top-k chunks where family = the parcel's
 * family OR family = "general". Both the citywide subchapters (1-4) AND the
 * dimensional/use table carry family "general", so this single-field OR pulls
 * district-specific sections + general provisions + the table in one filter
 * (overlay zones are excluded by design — they apply by location, not base
 * zoning). Runs in an action (the only place ctx.vectorSearch is available),
 * then hydrates docs.
 */
export const search = action({
  args: { embedding: v.array(v.float64()), family: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { embedding, family, limit }) => {
    const results = await ctx.vectorSearch('zoningChunks', 'by_embedding', {
      vector: embedding,
      limit: limit ?? 8,
      filter: (q) => q.or(q.eq('family', family), q.eq('family', 'general')),
    });
    const ids = results.map((r) => r._id);
    return ctx.runQuery(internal.zoning.fetchChunks, { ids });
  },
});
```

- [ ] **Step 2: Regenerate + typecheck**

Run: `npx convex dev --once`
Expected: `✔ Convex functions ready!` (no type errors; `api.zoning.search` / `api.zoning.upsertChunk` now exist).

> The filter is a same-field OR (`family` twice), which Convex supports directly. `family` must be in the index `filterFields` (it is, from Task 1).

- [ ] **Step 3: Commit**

```bash
git add convex/zoning.ts convex/_generated
git commit -m "feat(zoning): Convex upsert + family-filtered vector search (MOO-55)"
```

---

### Task 7: `runZoningAnswer` orchestrator (pure, injected deps)

The testable core of the tool: resolve → family → embed → search → format-for-agent, with disclosed failure modes. No network/Convex here — all injected.

**Files:**
- Create: `agent/agent/zoning/search.js`
- Test: `agent/tests/zoning/search.test.js`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runZoningAnswer } from '../../agent/zoning/search.js';

const deps = {
  resolveZoning: async () => ({ zoning: 'RT4', district: '12' }),
  classToFamily: () => 'residential',
  embedQuery: async () => Array(1536).fill(0.1),
  search: async ({ family }) => [
    { section: '295-505', parent: 'Subchapter 5 — Residential Districts', text: 'Two-family dwellings are permitted in RT4.', sourceUrl: 'https://city.milwaukee.gov/x/CH295-sub5.pdf', _family: family },
  ],
};

test('returns formatted chunks with section ids and a cite instruction', async () => {
  const text = await runZoningAnswer({ address: '2000 S 13th St', question: 'can I build a duplex?' }, deps);
  assert.match(text, /295-505/);
  assert.match(text, /RT4/);
  assert.match(text, /cite/i);
  assert.match(text, /city\.milwaukee\.gov/);
});

test('passes the resolved family into search', async () => {
  let seen;
  await runZoningAnswer({ address: 'x', question: 'y' }, { ...deps, search: async (a) => { seen = a.family; return deps.search(a); } });
  assert.equal(seen, 'residential');
});

test('address with no parcel → information-unavailable text, no embed/search call', async () => {
  let embedded = false;
  const text = await runZoningAnswer({ address: 'nowhere', question: 'q' }, {
    ...deps,
    resolveZoning: async () => null,
    embedQuery: async () => { embedded = true; return []; },
  });
  assert.match(text, /couldn.t|unavailable|no .*parcel/i);
  assert.equal(embedded, false);
});

test('unmapped zoning class → general-scope only, discloses the class was not mapped', async () => {
  const text = await runZoningAnswer({ address: 'x', question: 'q' }, {
    ...deps,
    resolveZoning: async () => ({ zoning: 'ZZ9', district: '1' }),
    classToFamily: () => null,
  });
  assert.match(text, /ZZ9/);
  assert.match(text, /general/i);
});

test('no chunks found → tells the agent to fall back to prose', async () => {
  const text = await runZoningAnswer({ address: 'x', question: 'q' }, { ...deps, search: async () => [] });
  assert.match(text, /no .*zoning|fall back|prose/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/zoning/search.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
/**
 * Parcel-conditioned zoning retrieval, formatted for Claude to compose a cited
 * answer. Pure: all I/O (parcel lookup, embeddings, Convex search) is injected.
 * @param {{address:string, question:string}} input
 * @param {{
 *   resolveZoning: (address:string) => Promise<{zoning:string, district:string}|null>,
 *   classToFamily: (zoningClass:string) => string|null,
 *   embedQuery: (text:string) => Promise<number[]>,
 *   search: (q:{embedding:number[], family:string}) => Promise<Array<{section:string,parent:string,text:string,sourceUrl:string}>>,
 * }} deps
 * @returns {Promise<string>}
 */
export async function runZoningAnswer({ address, question }, deps) {
  const parcel = await deps.resolveZoning(address);
  if (!parcel?.zoning) {
    return `information_unavailable: couldn't find a Milwaukee parcel for "${address}", so I can't look up its zoning. Ask the user to check the address.`;
  }
  const zoningClass = parcel.zoning;
  const family = deps.classToFamily(zoningClass);
  const note =
    family === null
      ? `NOTE: zoning class ${zoningClass} isn't mapped to a code family, so only general/citywide provisions were retrieved — say so.`
      : '';
  // family null → search general scope only (pass a family that matches nothing real;
  // the scope=general OR-clause still returns the citywide sections).
  const embedding = await deps.embedQuery(question);
  const chunks = await deps.search({ embedding, family: family ?? '__none__' });
  if (chunks.length === 0) {
    return `No zoning-code sections matched for ${zoningClass}. Fall back to prose: explain you don't have the specific code text and point to milwaukee.gov, don't invent sections.`;
  }
  const header = [
    `Zoning for ${address}: class ${zoningClass}${family ? ` (${family})` : ''}.`,
    note,
    'Answer the question using ONLY these code sections. CITE the section numbers (e.g. §295-505) you rely on; never invent a section. Keep citations in English even when answering in Spanish.',
  ]
    .filter(Boolean)
    .join('\n');
  const body = chunks
    .map((c) => `### §${c.section} — ${c.parent}\n${c.text}\n(source: ${c.sourceUrl})`)
    .join('\n\n');
  return `${header}\n\n${body}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/zoning/search.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add agent/zoning/search.js tests/zoning/search.test.js
git commit -m "feat(zoning): runZoningAnswer orchestrator with disclosed failure modes (MOO-55)"
```

---

### Task 8: `ask_zoning_code` tool + agent-loop wiring

Wrap `runZoningAnswer` in an in-process MCP server (the `createCommunityMemoryServer` pattern) and register it in `buildAgentOptions` with a citation/ES system-prompt block.

**Files:**
- Create: `agent/agent/zoning/tool.js`
- Modify: `agent/agent/agent.js` (import, `ZONING_PROMPT`, register server)
- Test: `agent/tests/agent/zoning-options.test.js`

- [ ] **Step 1: Write the failing test (wiring)**

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildAgentOptions } from '../../agent/agent.js';

test('zoning tool is registered when CONVEX_URL + OPENAI_API_KEY are set', () => {
  const env = { CONVEX_URL: 'https://x.convex.cloud', OPENAI_API_KEY: 'sk-x' };
  const { mcpServers, allowedTools, systemPrompt } = buildAgentOptions(undefined, env);
  assert.ok(mcpServers.zoning, 'expected a zoning MCP server');
  assert.ok(allowedTools.includes('mcp__zoning__*'));
  assert.match(systemPrompt, /ask_zoning_code/);
});

test('zoning tool is omitted when its env is missing (no crash)', () => {
  const { mcpServers, allowedTools } = buildAgentOptions(undefined, {});
  assert.equal(mcpServers.zoning, undefined);
  assert.ok(!allowedTools.includes('mcp__zoning__*'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/agent/zoning-options.test.js`
Expected: FAIL — `mcpServers.zoning` is undefined.

- [ ] **Step 3a: Create the tool**

`agent/agent/zoning/tool.js`:

```js
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { ConvexHttpClient } from 'convex/browser';
import { z } from 'zod';

import { api } from '../../convex/_generated/api.js';
import { createParcelClient } from '../../../mcp-server/src/parcel.js';
import { embedQuery } from '../../zoning/embed.js';
import { zoningClassToFamily } from '../../zoning/family.js';
import { runZoningAnswer } from './search.js';

const TOOL_DESCRIPTION = `\
Answer "what could be built / is allowed at this address?" from the Milwaukee zoning \
code (Chapter 295). Give the property ADDRESS and the user's QUESTION. The tool resolves \
the address to its zoning class, retrieves only the code sections that govern that class \
(plus citywide provisions), and returns them for you to answer FROM — cite the §295-NNN \
sections you use, and never invent one. Translate a Spanish question to English for \
retrieval; you still answer in the user's language with English section citations.`;

/**
 * In-process MCP server exposing ask_zoning_code. Real boundaries wired here;
 * the pure orchestrator (runZoningAnswer) is unit-tested with fakes.
 * @param {{convexUrl:string, openaiApiKey:string, userAgent?:string, fetchFn?:typeof fetch}} options
 */
export function createZoningServer({ convexUrl, openaiApiKey, userAgent = 'gavel-slack-agent', fetchFn = fetch }) {
  const convex = new ConvexHttpClient(convexUrl);
  const parcel = createParcelClient({ fetch: fetchFn, userAgent });
  const deps = {
    resolveZoning: (address) => parcel.checkZoning(address),
    classToFamily: zoningClassToFamily,
    embedQuery: (text) => embedQuery(text, { apiKey: openaiApiKey, fetchFn }),
    search: ({ embedding, family }) => convex.action(api.zoning.search, { embedding, family }),
  };
  const askTool = tool(
    'ask_zoning_code',
    TOOL_DESCRIPTION,
    { address: z.string().describe('Street address, e.g. "2000 S 13th St"'), question: z.string().describe("The user's zoning question") },
    async ({ address, question }) => {
      const text = await runZoningAnswer({ address, question }, deps);
      return { content: [{ type: 'text', text }] };
    },
  );
  return createSdkMcpServer({ name: 'zoning', version: '0.1.0', tools: [askTool] });
}
```

- [ ] **Step 3b: Wire it into `agent/agent/agent.js`**

Add the import near the others:

```js
import { createZoningServer } from './zoning/tool.js';
```

Add the prompt block (after `RECEIPTS_PROMPT`):

```js
const ZONING_PROMPT = `\
## ZONING CODE (ask_zoning_code)
When a user asks what can be built, used, or changed at a specific ADDRESS — duplex, \
ADU, corner store, height, setbacks, parking, permitted uses, rezoning effects — call \
ask_zoning_code with the address and their question. It returns the governing Chapter 295 \
sections; answer ONLY from them and cite the §295-NNN sections. If it returns \
information_unavailable or no sections, say so plainly and point to milwaukee.gov — never \
invent code text or section numbers.`;
```

In `buildAgentOptions`, before the `return`, register the server when its env is present:

```js
  if (env.CONVEX_URL && env.OPENAI_API_KEY) {
    mcpServers.zoning = createZoningServer({ convexUrl: env.CONVEX_URL, openaiApiKey: env.OPENAI_API_KEY });
    allowedTools.push('mcp__zoning__*');
    systemPrompt = `${systemPrompt}\n\n${ZONING_PROMPT}`;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/agent/zoning-options.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Full suite + lint, then commit**

Run: `node --test` → Expected: all green (existing 252 + new zoning tests).
Run: `npx @biomejs/biome check agent/zoning agent/zoning/tool.js agent/agent.js` → Expected: no errors.

```bash
git add agent/zoning/tool.js agent/agent.js tests/agent/zoning-options.test.js
git commit -m "feat(zoning): ask_zoning_code tool wired into the agent loop (MOO-55)"
```

---

### Task 9: Offline ingest script

The network-touching runner. Not unit-tested (it orchestrates the tested pure helpers); proven by Task 10's live run.

**Files:**
- Create: `agent/scripts/ingest-zoning.mjs`
- Create (only if a table extracts garbled): `agent/data/zoning/ch295-table.md`
- Modify: `agent/.env.local` (add `OPENAI_API_KEY=...` — gitignored)

- [ ] **Step 1: Write the ingest script**

```js
// MOO-55 zoning ingest (run-once, idempotent). Download Ch.295 PDFs → extract
// text (pdfjs) → structure-aware chunk → OpenAI embed → upsert to Convex.
// Run: node scripts/ingest-zoning.mjs
import { readFile } from 'node:fs/promises';
import { ConvexHttpClient } from 'convex/browser';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

import { api } from '../convex/_generated/api.js';
import { CH295_SOURCES } from '../zoning/sources.js';
import { chunkSections } from '../zoning/chunk.js';
import { embedTexts } from '../zoning/embed.js';

const UA = 'gavel-slack-agent (tarik@radiomilwaukee.org)';
const TABLE_FALLBACK = new URL('../data/zoning/ch295-table.md', import.meta.url);

async function extractPdfText(buffer) {
  const doc = await getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((it) => it.str).join(' '));
  }
  return pages.join('\n');
}

async function loadSourceText(source) {
  const res = await fetch(source.url, { headers: { 'User-Agent': UA } });
  if (!res.ok) {
    console.warn(`SKIP ${source.file}: HTTP ${res.status}`);
    return null;
  }
  const text = await extractPdfText(await res.arrayBuffer());
  // Table fallback: if the table PDF extracted with too little text, use the
  // hand-captured markdown (one artifact). Heuristic: tables collapse to little.
  if (source.scope === 'table' && text.replace(/\s+/g, '').length < 400) {
    console.warn(`Table ${source.file} extracted thin — using ch295-table.md fallback`);
    return readFile(TABLE_FALLBACK, 'utf8');
  }
  return text;
}

async function main() {
  const convexUrl = process.env.CONVEX_URL;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!convexUrl || !apiKey) throw new Error('CONVEX_URL and OPENAI_API_KEY are required');
  const convex = new ConvexHttpClient(convexUrl);

  let total = 0;
  for (const source of CH295_SOURCES) {
    const text = await loadSourceText(source);
    if (!text) continue;
    const chunks = chunkSections(text, { parent: source.parent, family: source.family, scope: source.scope, sourceUrl: source.url });
    if (chunks.length === 0) {
      console.warn(`SKIP ${source.file}: no sections parsed`);
      continue;
    }
    const vectors = await embedTexts(chunks.map((c) => c.text), { apiKey });
    for (let i = 0; i < chunks.length; i++) {
      await convex.mutation(api.zoning.upsertChunk, { ...chunks[i], embedding: vectors[i] });
    }
    total += chunks.length;
    console.log(`${source.file}: ${chunks.length} chunks`);
  }
  const count = await convex.query(api.zoning.count, {});
  console.log(`\nDone. Upserted ${total} chunks this run; ${count} total in zoningChunks.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Add the OpenAI key**

Add `OPENAI_API_KEY=sk-...` to `agent/.env.local` (gitignored). Confirm `CONVEX_URL` is already present.

- [ ] **Step 3: Commit (script only — never the key)**

```bash
git add scripts/ingest-zoning.mjs
git commit -m "feat(zoning): Ch.295 ingest script — download/extract/chunk/embed/upsert (MOO-55)"
```

---

### Task 10: Live verification (the issue's Verification checklist)

Prove it against reality. This is where retrieval quality and the family map get validated and tuned.

- [ ] **Step 1: Run the ingest**

Run: `node scripts/ingest-zoning.mjs`
Expected: per-file chunk counts, a final total (hundreds of chunks), no unhandled error. Note any `SKIP` lines (404s / thin tables) and resolve them (fix filename in `sources.js`, or author `data/zoning/ch295-table.md`).

- [ ] **Step 2: Validate the family map against real MPROP values**

Run:
```bash
node -e "import('../mcp-server/src/parcel.js').then(async ({createParcelClient})=>{const p=createParcelClient({fetch,userAgent:'gavel'});for(const a of ['2000 S 13th St']){console.log(a, await p.checkZoning(a))}})"
```
Confirm `RT4 → residential` via `zoningClassToFamily`. If any real class is unmapped, add it to `family.js` and re-run that unit test.

- [ ] **Step 3: 20-query relevance sweep**

Write `scripts/zoning-eval.mjs` (throwaway, like `parcel-card-verify.mjs`): for ~20 questions across families (e.g. "duplex on an RT4 lot?", "corner store in LB2?", "ADU rules?", "downtown height limit?"), call the real `runZoningAnswer` path (resolveZoning + embedQuery + convex `api.zoning.search`) and print the top-3 sections per query. Manually confirm relevance. Record pass rate in the Linear comment.

- [ ] **Step 4: Citations-exist check**

For 3 answered queries, confirm each cited `295-NNN` section is present verbatim in the ingested `zoningChunks` (query Convex by section). No invented sections.

- [ ] **Step 5: One ES question**

Ask a Spanish zoning question end-to-end (deployed agent or a local `runAgent` harness): confirm an accurate ES answer with English §295-NNN citations.

- [ ] **Step 6: Deploy + close**

Add `OPENAI_API_KEY` to Fly secrets on `gavel-app`; deploy; verify via `fly releases`. Then move MOO-55 → Done with an evidence comment (sweep pass rate, a real cited answer, the ES answer). The native-ES fluency sign-off stays an explicit open item if not yet done.

---

## Self-review

**Spec coverage:**
- `zoning_code` namespace, structure-aware chunking, tables intact, parent breadcrumbs → Tasks 1, 3, 4. ✓
- `ask_zoning_code(address, question)` address→district→filtered search → Tasks 6, 7, 8. ✓
- Cites specific sections → Task 7 (format + cite instruction), Task 10 step 4 (verified). ✓
- ES path (translate query→EN, answer in ES) → Task 8 prompt + Task 10 step 5. ✓
- Family+general filter / district disambiguation → Tasks 2, 6, 7. ✓
- OpenAI embeddings, Convex vector store → Tasks 5, 6. ✓
- Table auto-extract + manual fallback → Task 9. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. The only conditional artifact (`ch295-table.md`) is explicitly gated on a garbled extraction.

**Type consistency:** chunk shape `{section,text,parent,family,scope,sourceUrl}` is identical across `chunk.js` (Task 4), `upsertChunk` args (Task 6), and the ingest call (Task 9). `search` returns `{section,text,parent,sourceUrl}` consumed identically in `runZoningAnswer` (Task 7). `embedQuery`/`embedTexts` signatures match between `embed.js` (Task 5) and callers (Tasks 8, 9). `zoningClassToFamily` signature matches between `family.js` (Task 2) and `tool.js` (Task 8). ✓

**Risks carried from spec:** PDF table fidelity (mitigated by fallback), one new secret (`OPENAI_API_KEY`), retrieval-quality tuning gated on the Task 10 sweep.
