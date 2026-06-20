# Design — App Home declutter: theme+committee clustering for Story leads (MOO-128)

_2026-06-20. Builds on MOO-127 (Story Radar, merged). Pairs with MOO-129 (dossier, backlog)._

## Problem

The reporter App Home "📰 Story leads" renders as a flat, repetitive wall (live screenshot 2026-06-20):

- **Repeated tags carry no information.** All five visible leads show the identical `🏛️ COMMON COUNCIL · 🛡️ Poder y rendición de cuentas`. A tag that's on every row differentiates nothing.
- **Near-duplicate items aren't grouped.** Four of the five are the same story — an MPD use-of-force / pursuit / video-release reform package — shown as four separate legalese rows. A journalist sees one story, not four.
- **No hierarchy.** Row #1 and row #5 look identical; the "ranked by relevance" promise is invisible.
- **Raw legalese headlines.** "A substitute motion modifying… Standard Operating Procedures regarding the duty to intervene…" is not what a reporter scans.
- **Language split (bug).** The header/strip render English ("This week: 3 meetings…") while the body renders Spanish — the strip text is hardcoded English in `home-view.js` while the sections localize.

## Goal

Cluster related matters into one story (deterministic, by committee + theme family), restore hierarchy and scannability, surface the shared tag once, and fix the language inconsistency — staying **pure, LLM-free, reporter-gated, bilingual, and with no new persistence** (the MOO-127 invariants).

Out of scope: the tap-through dossier (video/minutes/votes) — that's MOO-129. Claude-written narrative headlines (the Home keeps deterministic labels). ML clustering. Any schema/persistence change.

## Approach (chosen)

**Deterministic theme-family clustering.** Considered and rejected: (A2) an LLM clustering pass — breaks the LLM-free/deterministic Home and the "not ML" rule; (A3) no clustering, rank+style only — the user explicitly wants clustering, and it's the biggest declutter win.

A lead's **theme** is read off its title by a small set of named keyword families. Leads sharing the **same committee + same theme family** form a cluster (≥2 members); singletons pass through unchanged. The cluster label stays deterministic on the Home (`🛡️ Police & accountability — 4 items · Common Council`); the Claude-written narrative headline ("rules are being rewritten") is deferred to the dossier (MOO-129), so the Home makes no model call.

## Components

### `agent/stories/cluster.js` (new, pure)

```
THEME_FAMILIES = [
  { key: 'police',       emoji: '🛡️', en, es, re: /police|MPD|use of force|pursuit|surveillance|officer|fire and police|body camera/i },
  { key: 'money',        emoji: '💰', en, es, re: /bond(?:ing|s)?|TIF|appropriat|contract|tax (?:levy|incremental)|budget/i },
  { key: 'housing',      emoji: '🏠', en, es, re: /demolition|rezoning|eviction|redevelopment|vacant|zoning|land sale/i },
  { key: 'licenses',     emoji: '🍺', en, es, re: /license|tavern|liquor|bartender|food dealer/i },
  { key: 'streets',      emoji: '🚧', en, es, re: /paving|repaving|sewer|water main|sidewalk|alley|pothole/i },
  { key: 'appointments', emoji: '👔', en, es, re: /appoint|confirm|nomination|board|commission/i },
]

themeOf(item) -> family key | null     // first matching family, deterministic order

clusterLeads(leads) -> Array<
  { kind: 'cluster', theme, committee, tags, members: Lead[], topScore }   // ≥2 members
  | { kind: 'single', ...lead }                                            // unchanged
>
```

Rules:
- Bucket by `eventBodyName` (committee). Theme only clusters *within* a committee (the chosen "theme + committee" granularity).
- Within a committee bucket, group leads by `themeOf(title)`. A group of ≥2 → a `cluster`; a group of 1 (or `null` theme) → a `single`.
- `tags` on a cluster = the tag kinds shared by **all** members (the genuinely common signal), falling back to the union if none is shared.
- Order: clusters/singles ranked by `topScore` desc (a cluster's `topScore` = max member score), then earliest `eventDate`, then `eventItemId` — deterministic, mirrors `selectStoryLeads`.
- Pure, no I/O, no mutation; exhaustively unit-tested.

### `agent/blockkit/story-leads.js` (modify) + `home-view.js` (modify)

- `storyLeadsSection(entries, language)` now consumes `clusterLeads(...)` output (clusters + singles), not raw leads.
- **Cluster block:** a section with the deterministic label `{emoji} {Theme} — {N} {items} · {committee}` carrying the shared tag once; member titles listed compactly beneath (context/section lines), each with its own `story_watch`; a cluster-level overflow (`👁 Watch all · 🔎 stories`).
- **Single block:** as today (title + tags + watch), via the existing path.
- **Hierarchy:** render the top **N_EXPANDED = 3** entries fully; remaining entries collapse behind a `▾ Ver N pistas más` affordance (a button → `/gavel stories`, since the App Home can't lazy-expand in place).
- **Per-item actions → overflow** where more than Watch applies, to stop the one-fat-button repetition.
- **Language fix:** move the hardcoded-English strip line in `home-view.js` into a localized `STRIP_COPY[language]` table so the entire Home renders in the resolved language.

### Constraints preserved

Reporter-gated (unchanged) · bilingual (theme labels localized; committee/proper names stay English) · LLM-free (clustering is pure regex/grouping) · **no new persistence** (clustering is at render) · degrades (no clusters → flat ranked singles; empty → quiet-week line).

## Data flow

`buildHomeState` (unchanged) → `state.storyLeads` (ranked leads) → **`clusterLeads(storyLeads)`** (new, in `home-view.js` render path or `state.js`) → `storyLeadsSection(entries, language)` → Block Kit.

Decision: call `clusterLeads` inside `storyLeadsSection` (render), keeping `state.storyLeads` as the raw ranked list — so `state` stays the data layer and clustering stays a presentation concern.

## Error handling / edge cases

- `themeOf` returns `null` → the lead is always a `single` (never force-grouped).
- A committee bucket with all-distinct themes → all singles (no false clusters).
- Cluster members with no shared tag → label falls back to the union of member tags (still explainable).
- Empty `storyLeads` → existing quiet-week line. Non-reporter → section absent (unchanged).
- Slack 100-block cap: top-3 expansion + compact members keeps well under (current full render is ~49 blocks).

## Testing

**`tests/stories/cluster.test.js`:** the real 4-item police fixture → one `police` cluster of 4 (the load-bearing case); two unrelated Common Council items → two singles (conservative non-merge); a money + a police item in the same committee → two groups; `themeOf` family matches + `null`; deterministic order across runs; purity (input untouched).

**`tests/blockkit/story-leads.test.js` / `home-view.test.js` (extend):** cluster header shows the shared tag + count once and not per-member; member titles all present; `▾ ver más` affordance when entries exceed N_EXPANDED; whole Home one language (strip localized — the regression test for the bug); singles still render; empty/quiet-week unchanged.

**Live (`scripts/story-radar-verify.mjs` extend or a new check):** against the real agenda, the four police items collapse into one cluster; reporter App Home renders one language. Screenshot.

## Out of scope (restated)

Dossier / video / minutes / votes (MOO-129) · Claude narrative headlines · ML · new persistence/schema.
