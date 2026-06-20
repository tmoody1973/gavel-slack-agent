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

Two axes are kept separate (this is the load-bearing distinction):

- **Theme = the beat / subject** — the clustering axis: what the item is *about* (police, health, housing, development, …). Read off the title by named keyword families.
- **Tag = newsworthiness** — already exists from MOO-127 (💰money · 🛡️accountability · 👥equity · ⚔️conflict · ✨novelty · ⚠️anomaly · 🔁recurrence): *why* it matters.

Money is **not** a theme — almost every agenda item involves money, so it's a useless grouping axis but a great "why." It stays a tag. A lead's **theme** groups it; its **tags** (already scored) describe it.

Leads sharing the **same committee + same theme** form a cluster (≥2 members); singletons pass through unchanged. The cluster label stays deterministic on the Home (`🏗️ Development — 3 items · CED`, with the shared tags beside it); the Claude-written narrative headline ("rules are being rewritten") is deferred to the dossier (MOO-129), so the Home makes no model call.

## Components

### `agent/stories/cluster.js` (new, pure)

```
// THEME = subject / beat (the clustering axis). NOT newsworthiness — those are the
// MOO-127 tags. Extends the MOO-121 topic vocabulary. First match wins, so the order
// is specific → general (a "$5M TIF for a development" is a development story, not a
// generic money one). Money is deliberately absent: it's a tag, not a beat.
THEME_FAMILIES = [
  { key: 'police',       emoji: '🛡️', re: /police|MPD|use of force|pursuit|surveillance|officer|fire and police|body camera/i },
  { key: 'health',       emoji: '🏥', re: /lead(?: poisoning)?|public health|health department|clinic|food safety|water quality|opioid|sanitation|disease/i },
  { key: 'housing',      emoji: '🏠', re: /rezoning|demolition|variance|blight|vacant lot|eviction|conditional use|housing/i },
  { key: 'development',  emoji: '🏗️', re: /TIF|tax incremental|redevelopment|development agreement|business improvement district|\bBID\b|economic development|land sale/i },
  { key: 'licenses',     emoji: '🍺', re: /license|tavern|liquor|bartender|food dealer/i },
  { key: 'parks',        emoji: '🌳', re: /\bpark(?:s|land)?\b|forestry|green space|community garden|tree planting|climate|sustainab/i },
  { key: 'streets',      emoji: '🚧', re: /paving|repaving|resurfac|sewer|water main|sidewalk|alley|pothole/i },
  { key: 'appointments', emoji: '👔', re: /appoint|confirmation|nomination|\bboard\b|\bcommission\b/i },
]
// Localized theme labels live in the render layer (like the existing tag labels).

themeOf(title) -> family key | null    // first matching family; null → the lead is always a single

// District is a FACET (location), not a theme or a tag. Reuse districtOf() from
// home/salience.js (MOO-123) — it parses "(Nth Aldermanic District)" off the title.
// Shown as a 📍 chip when present; absent on council-wide policy items. No new fetch.

clusterLeads(leads) -> Array<
  { kind: 'cluster', theme, committee, tags, district?, members: Lead[], topScore }  // ≥2 members
  | { kind: 'single', district?, ...lead }                                           // unchanged
>
```

Rules:
- Bucket by `eventBodyName` (committee). Theme only clusters *within* a committee (the chosen "theme + committee" granularity).
- Within a committee bucket, group leads by `themeOf(title)`. A group of ≥2 → a `cluster`; a group of 1 (or `null` theme) → a `single`.
- `tags` on a cluster = the tag kinds shared by **all** members (the genuinely common signal), falling back to the union if none is shared.
- `district` on a cluster = the single district shared by all members, else omitted; on a single = `districtOf(title)` when present.
- Order: clusters/singles ranked by `topScore` desc (a cluster's `topScore` = max member score), then earliest `eventDate`, then `eventItemId` — deterministic, mirrors `selectStoryLeads`.
- Pure, no I/O, no mutation; exhaustively unit-tested.

### `agent/blockkit/story-leads.js` (modify) + `home-view.js` (modify)

- `storyLeadsSection(entries, language)` now consumes `clusterLeads(...)` output (clusters + singles), not raw leads.
- **Cluster block:** a section with the deterministic label `{emoji} {Theme} — {N} {items} · {committee}` carrying the shared tag(s) + a 📍 District chip when shared, once; member titles listed compactly beneath (context/section lines), each with its own `story_watch`; a cluster-level overflow (`👁 Watch all · 🔎 stories`).
- **Single block:** title + context line `🏛️ {committee} · 📍 District {N} (when present) · {tags}` + watch, via the existing path.
- **District chip:** rendered from `districtOf(title)` (MOO-123) wherever a lead/cluster carries a district; the alder *name* (MOO-72 directory) is deferred to the dossier (MOO-129) to keep the Home fetch-free.
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

**`tests/stories/cluster.test.js`:** the real 4-item police fixture → one `police` cluster of 4 (the load-bearing case); two unrelated Common Council items → two singles (conservative non-merge); a development (TIF) item + a police item in the same committee → two groups; `themeOf` resolves each of the 8 beats (incl. health, development, parks) and returns `null` for an off-vocabulary title; first-match precedence (a "TIF for a development" → `development`, not caught elsewhere); a cluster of items all in District 7 carries `district: '7'`, mixed/absent → no district; deterministic order across runs; purity (input untouched).

**`tests/blockkit/story-leads.test.js` / `home-view.test.js` (extend):** cluster header shows the shared tag + count once and not per-member; the 📍 District chip renders when a title names a district and is absent otherwise; member titles all present; `▾ ver más` affordance when entries exceed N_EXPANDED; whole Home one language (strip localized — the regression test for the bug); singles still render; empty/quiet-week unchanged.

**Live (`scripts/story-radar-verify.mjs` extend or a new check):** against the real agenda, the four police items collapse into one cluster; reporter App Home renders one language. Screenshot.

## Out of scope (restated)

Dossier / video / minutes / votes (MOO-129) · Claude narrative headlines · ML · new persistence/schema.
