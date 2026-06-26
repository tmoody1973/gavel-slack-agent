# Spec — Civic News Enrichment (local reporting on government items)

_Date: 2026-06-26 · Status: Draft for review · Brainstormed via superpowers:brainstorming._
_Built via superpowers TDD; ready to become a MOO issue + plan._

## Intent

Gavel already knows the official record (agendas, minutes, zoning, property) and the community's own
discussion. The gap is **outside reporting**: when WTMJ, Milwaukee NNS, Urban Milwaukee, or the Journal
Sentinel covers a government item, Gavel can't connect that coverage to the item it's already tracking.

This feature fetches **local news about a specific government item** and surfaces it in two places:
1. **Enrich the alert** — when Gavel posts an agenda alert, attach related local coverage.
2. **Search lane** — add a `news` source to `/gavel search`, next to mail / agendas / minutes / zoning.

The value is the **connection** (this agenda item is in the news), not a generic feed. People can already
read the news; only Gavel can tie a headline to the file number, address, and decision it's watching.

What Gavel already covers and this does NOT duplicate: the city's **own** press releases, newsletters,
community events, and hearings already flow in through the AgentMail civic-mail pipeline. This feature is
**external press only**.

## Decisions (from brainstorming)

- **Job:** enrich the alert **and** a `/gavel search` news lane. One fetch service, two surfaces.
- **Source:** behind a `NewsSource` interface. Ship **Google News RSS** now (free, no key, hyperlocal
  coverage, real article links). Leave an **Exa/Tavily adapter** as a drop-in for later. Build one, not both.
- **Matching:** **query + Claude relevance gate.** Build a tight query from the item, fetch, then Claude
  confirms each article is actually about *this* item before it's shown. On a civic-trust product, a wrong
  match is worse than no match.

## Architecture

A new `agent/news/` module:

- **`NewsSource` interface:** `fetchNews({ address, terms, sinceDays }) → Promise<RawArticle[]>` where
  `RawArticle = { title, url, source, publishedAt }`.
  - **`googleNewsRss.js`** — the implementation: builds a Google News RSS search URL from the query, fetches,
    parses the RSS (title / link / source / pubDate). No API key. Polite client (UA string, timeout).
  - **`exaNewsSource.js`** — NOT built now. A documented seam: same interface, swap in later for sharper
    relevance.
- **`query.js` (pure):** `buildNewsQuery(item) → { query, address, terms } | null`. Uses the item's
  **address** (when Gavel can resolve one — it already extracts addresses for alerts) plus one or two
  **distinctive terms** from the title. Returns `null` for items with no address and no distinctive entity
  (so we don't fetch news for routine personnel items). File numbers are never used (they don't appear in news).
- **`relevance.js`:** `buildGatePrompt(item, articles)` (pure) + `filterRelevant(item, rawArticles, { generate })`
  — Claude confirms each candidate is about this item; returns only the passing articles. Injected `generate`.
- **`normalize.js` (pure):** `normalizeNews(article) → { title, url, source, date }` for the search card.

**Cache:** a Convex `newsCache` table keyed by a normalized string key — the **file number** for the alert
path, the **normalized search query** for the search lane: `{ key, articles, fetchedAt }`, read-through with
a ~24h TTL. Both surfaces hit the cache first; a miss fetches once and writes back.

## How it works

**Alert path (Surface 1).** When the poller posts an alert (`processPendingAlerts` / `poll-once.mjs`):
1. `buildNewsQuery(item)`; if `null`, skip news entirely.
2. Read the cache; on miss, `fetchNews` then `filterRelevant`, bounded by a short timeout budget.
3. If ≥1 article passes the gate, append a `📰 In the local news` context block to the card with up to 3
   real links (headline · source · date). If the fetch times out or nothing passes, post the alert with **no**
   news block. **News never blocks or breaks an alert** (mirrors `resolveAttachmentUrls` degrading to null).

**Search path (Surface 3).** Add a 5th `news` group to `runSearch`: cache-first fetch for the query, gate,
`normalizeNews`, render in the existing `buildFederatedResultsCard`. Quoted/exact queries can skip the gate's
fuzz; unquoted run the full path.

## Trust & cost guardrails

- **Real links only.** Gavel shows headline, source, date, and a link. It never writes its own summary of an
  article, so it can never misrepresent a reporter's work. (Consistent with "cite primary sources, never invent.")
- **Gated only.** Nothing appears unless it clears the Claude "is this about this item?" check.
- **Fetch selectively.** Only items with a resolvable address or a distinctive named entity. Routine items
  (e.g. a personnel appointment) get nothing — better relevance and lower cost.
- **Capped + cached.** Top ~5 raw → gate → show ≤3 → cache 24h. Polite RSS client (UA, timeout, no hammering).

## Testing

- **Pure / unit-tested:** `buildNewsQuery` (item → query, including the `null` skip cases), the RSS parser,
  `normalizeNews`, `buildGatePrompt`.
- **Injected boundaries (stubbed):** the `NewsSource` fetch and the Claude `generate` gate.
- **Behavioral:** cache read-through (hit vs miss→write), and the alert **degrade path** — a timeout or an
  empty gate result leaves the alert card byte-identical to today.
- `node --test` green · `biome` clean.

## Out of scope (YAGNI for now)

- A standalone "civic news this week" digest.
- The Exa/Tavily source (interface seam only).
- National news, or any non-local outlet.
- Gavel-authored summaries of articles.
- Backfilling news onto already-posted alerts (Slack messages aren't updated retroactively).

## Acceptance

- [ ] `news/` module with the `NewsSource` interface + a working Google News RSS implementation.
- [ ] `buildNewsQuery` returns a tight address+term query, or `null` for items with neither.
- [ ] `filterRelevant` gates articles via Claude; only passing articles surface.
- [ ] Alert cards gain a `📰 In the local news` block when ≥1 article passes; otherwise unchanged. News
      failure never affects the alert.
- [ ] `/gavel search` shows a `news` group alongside the other four lanes.
- [ ] Convex `newsCache` (keyed by file number for alerts, by query for search) with 24h TTL, read-through from both surfaces.
- [ ] Real links only; no Gavel-written article summaries.

## Verification

- Unit tests per the Testing section, green.
- Live: trigger an alert for an item with known coverage (e.g. the Midtown data center at 5825 W Hope Ave) →
  the card shows the real WTMJ/NNS links, gated. `/gavel search "data center"` shows a news group with real,
  on-topic links. An item with no coverage shows no news block and no empty-state noise.
