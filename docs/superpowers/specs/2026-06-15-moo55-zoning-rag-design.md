# MOO-55 — Zoning-code RAG design

_Brainstormed 2026-06-15. Parcel-conditioned retrieval over the Milwaukee zoning code
(Chapter 295) that answers "what could they build here?" with verifiable section citations._

## Goal

Build the `zoning_code` semantic layer (memory #2 of the three-memory model) and an
`ask_zoning_code(address, question)` agent tool that resolves an address to its zoning
class, retrieves only the code that governs that class, and answers — in the user's
language — citing specific `295-NNN` sections that provably exist in the source text.

This is the "what could they build if this passes?" demo hero beat. It is the last
unbuilt knowledge-layer beat (transcripts namespace is a separate issue).

## Decisions locked during brainstorm

| Decision | Choice | Why |
|---|---|---|
| Source | **Full Chapter 295** | Comprehensive; future-proof beyond the demo districts |
| Source format | **City PDFs** (`city.milwaukee.gov/.../CH295-sub*.pdf` + `CH295table.pdf`) | The authoritative publication; section-numbered `295-NNN` → natural chunk boundaries |
| Embeddings | **OpenAI `text-embedding-3-small`** (1536-dim) | Cheap (~$0.02/M tok), ubiquitous, best-documented Convex path. One new key |
| Vector store | **Convex vector search** | Per PRD — one index, no new infra (no Pinecone/Weaviate) |
| Parcel-conditioning | **Family + general scope filter** | Matches the code's own subchapter structure; correctly interprets "filter to that district" as zoning-class family, not aldermanic district |
| Table handling | **Auto-extract, manual fallback** | PDF table extraction is lossy; the dimensional table is the most demo-cited data, so a one-time hand-capture of `CH295table.pdf` is the safety net |
| Tool location | **Agent-side in-process tool** | Needs Convex + OpenAI; the MCP server is stateless and has neither |

### The "district" disambiguation (important)

`check_zoning(address)` (MOO-50) returns **both** `zoning` (the zoning class, e.g. `RT4`)
and `district` (the aldermanic district, e.g. `12`). The acceptance criterion says
"resolve address → district → filter to that district," but zoning regulations are
organized by **zoning class**, not aldermanic district. The aldermanic number is
political and irrelevant to what may be built. So "district" here means the **zoning
class family**, and the filter key is derived from `zoning`, never `district`.

## Architecture — three units

```
ingest-zoning.mjs (offline, run-once)        agent runtime (live)
  download CH295-*.pdf ──┐                     ask_zoning_code(address, question)
  pdfjs text extract     │                       │
  section-aware chunk    │                       ├─ check_zoning(address) → {zoning}
  (295-NNN + parent)     │                       ├─ zoning → family (lookup)
  OpenAI embed           │                       ├─ (ES) translate question → EN
  upsert ────────────────┴──► Convex            ├─ OpenAI embed question
                              zoningChunks  ◄────┤  searchZoning(vec, family)
                              + vectorIndex      └─ Claude composes cited answer
```

### Unit 1 — Offline ingestion: `agent/scripts/ingest-zoning.mjs`

Run-once, idempotent, network-touching. Orchestrates pure helpers (which ARE unit-tested):

- **`agent/zoning/sources.js`** — the canonical list of Ch.295 subchapter PDFs + the table
  PDF, each with its `family`/`scope` classification (subch.5 = residential, subch.6 =
  commercial, subch.7 = downtown, subch.8 = industrial, subch.9 = special, subch.10–11 =
  overlay; subch.1–4 = general/definitions → `scope: "general"`).
- **`agent/zoning/chunk.js`** — `chunkSections(text, meta)`: split on the `^295-\d+` section
  regex; each section becomes one chunk carrying `{ section, family, scope, parent, text }`.
  Oversized sections split on sub-paragraph boundaries with the section breadcrumb repeated.
  **Tables are never split** — a detected table region becomes one intact chunk.
- **`agent/zoning/embed.js`** — `embedTexts(texts, { openai })`: batch call to
  `text-embedding-3-small`; `openai` (fetch-based) injected for tests.
- The script: download → extract (`pdfjs-dist`) → `chunkSections` → `embedTexts` →
  `upsertZoningChunks`. Re-runnable: upsert keyed on `section` so a re-run replaces, not
  duplicates. Logs counts (chunks, tokens, est. cost) and the dropped/garbled regions
  (no silent truncation).
- **Table fallback:** if a table region extracts garbled, the script reads a hand-authored
  `agent/data/zoning/ch295-table.md` (one artifact) instead, stored as one intact chunk.

### Unit 2 — Convex vector store: `agent/convex/zoning.ts` + `schema.ts`

```ts
zoningChunks: defineTable({
  text: v.string(),
  embedding: v.array(v.float64()),   // 1536
  section: v.string(),               // "295-505"
  family: v.string(),                // "residential" | "commercial" | ... | "general"
  scope: v.string(),                 // "district" | "general"
  parent: v.string(),                // "Subchapter 5 — Residential Districts"
  sourceUrl: v.string(),
}).vectorIndex("by_embedding", {
  vectorField: "embedding",
  dimensions: 1536,
  filterFields: ["family", "scope"],
})
```

- `upsertZoningChunks(chunks)` — mutation; replaces by `section` (idempotent ingest).
- `searchZoning({ embedding, family, limit })` — action running `ctx.vectorSearch` with
  filter `q.or(q.eq("family", family), q.eq("scope", "general"))`, then loads the chunk
  docs and returns `{ section, text, parent, sourceUrl }[]`. (Vector search runs in a
  Convex action; doc hydration via a follow-up query, the standard Convex pattern.)

### Unit 3 — Agent tool: `agent/agent/zoning/tool.js`

In-process MCP tool (the `render_receipt` / community-search pattern), wired into the
agent loop in `build-agent-options` / wherever tools are registered.

- Schema: `{ address: string, question: string }`.
- Flow: resolve `zoning` via the MOO-50 parcel client (imported directly — same import the
  MOO-110 verify script used — no MCP round-trip inside our own tool) → `zoningClassToFamily(zoning)`
  → embed the question (EN; if the question is ES, the agent passes an EN retrieval query per
  the system-prompt nudge, reusing the MOO-49 bilingual approach) → `searchZoning` →
  return the retrieved sections as structured text for Claude to compose a cited answer.
- **Citations:** every returned chunk carries its `section` + `sourceUrl`; the system prompt
  instructs Claude to cite `295-NNN` sections and never invent one.
- **Failure modes:** address not found → "information unavailable" text (the existing
  pattern); no chunks for the family → tell the agent to fall back to prose + the Legistar
  link; embedding/Convex error → same.
- **ES path:** translate query → EN for retrieval; compose the answer in ES with the civic
  glossary (MOO-43); keep `295-NNN` citations in English, clearly labeled.

### `zoningClassToFamily` map (`agent/zoning/family.js`)

Small pure lookup from MPROP zoning codes to code family, e.g. `RT*`/`RS*`/`RM*` →
`residential`; `LB*`/`NS*`/`CS*`/`RB*` → `commercial`; `C9*`/downtown → `downtown`;
`IL*`/`IM*`/`IH*`/`IO*` → `industrial`; `PD`/`TL`/`I*` special → `special`. Unknown class →
`null` → tool returns general-scope chunks only + discloses the class wasn't mapped.

## Data flow example

`ask_zoning_code("2000 S 13th St", "can I build a duplex here?")`
→ check_zoning → `zoning: "RT4"` → family `residential`
→ embed "can I build a duplex (two-family dwelling) on this property?"
→ searchZoning(vec, "residential") → top-k residential + general chunks + the RT4 table row
→ Claude: "Yes — under **§295-505**, the RT4 district permits two-family dwellings; the
dimensional table (**§295-Table**) sets a minimum lot area of … per unit. [milwaukee.gov]"

## Testing

| Layer | How |
|---|---|
| `chunkSections` | fixtures: a real `295-NNN` excerpt → asserts section/parent/scope + table-intact |
| `zoningClassToFamily` | table-driven: RT4→residential, LB2→commercial, unknown→null |
| `embedTexts` | injected fake `openai` → asserts batching + shape |
| `searchZoning` filter | unit test the filter expression builder (family OR general) |
| citation extraction | given chunks + an answer, assert cited sections ∈ the chunk set |
| **Live verification** | run the real ingest, then the 20-query relevance sweep + cited-sections-exist check + one ES question (these are the issue's Verification checklist, run against real ingested data) |

## Out of scope (per the issue)

Transcripts namespace (separate issue). The zoning-code source is an *input* — but since it
didn't exist in-repo, **acquiring it (the PDF download + parse) is folded into Unit 1's
ingest script**; it is not a separate deliverable. No live re-indexing/poller (the code
changes rarely; re-run the script on amendment).

## Risks

1. **PDF table fidelity** — the dimensional/use table is the most-cited demo data and the
   hardest to extract. Mitigated by the manual-fallback markdown capture of `CH295table.pdf`.
2. **OpenAI key** — one new secret (`OPENAI_API_KEY`) in `agent/.env` + Fly secrets on
   `gavel-app`. Standing deploy item.
3. **Retrieval quality** — the 20-query sweep is the gate; if family-filtering is too coarse
   or too narrow, tune `limit` and the family map before claiming Done.
