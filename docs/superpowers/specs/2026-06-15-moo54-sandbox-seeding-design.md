# MOO-54 — Sandbox Seeding Design

_Design spec · 2026-06-15 · Linear MOO-54 (P0, Phase 3, blocks MOO-62 demo video)_

## Intent

The RTS "community memory" wow-beat only lands if a seeded channel actually contains
believable prior discussion to surface, and judges' hands-on testing needs the same. Seed
2-3 neighborhood channels with content-dated, demo-honest history — including the
developer/LLC thread the demo surfaces — plus working per-channel subscriptions.

## The hard constraint (why this isn't just "post some messages")

The Slack API **cannot** post messages with historical timestamps. "2024-25 history" must be
**real messages posted now, content-dated in the text** and **disclosed as staged**, per the
PRD "Real vs. Cached for Demo" contract. RTS (`assistant.search.context`) searches live
message text in public channels via the user token — so a planted message is findable iff it
is plain text in a public channel the user token can see. The bot must be a member to post.

## Decisions (locked with the user, 2026-06-15)

1. **Boundary criterion re-scoped to districts.** The schema supports only
   `boundary: { type: 'district', value: string }` (geo/polygons are Phase 3; MOO-59 was
   canceled). Each channel gets its representative aldermanic district as an honest stand-in.
   The Linear acceptance bullet is updated from "hand-drawn boundary polygons" to "district
   boundaries (polygons deferred — geo not built)." We do **not** build polygon geo for a
   seeding ticket.
2. **Anchor entity = Punta Cana LLC / 2000 S 13th St / File #260229** — already the canonical
   example in the codebase (Watch-modal placeholder, existing `#general` watch). Ties
   community chatter ↔ a real civic record with zero new lookups. 2000 S 13th St is on the
   near south side, so the thread lives naturally in the Spanish `#clarke-square` channel.
3. **You create channels + invite the bot; the script seeds.** You create the public channels
   and `/invite` the bot; the script resolves channel IDs by name (`conversations.list`) and
   seeds. Avoids `channels:manage` scopes and duplicate-channel risk on re-run.
4. **Channels:** `#sherman-park` (en, District 7), `#lindsay-heights` (en, District 6),
   `#clarke-square` (**es**, District 12 — near south side, bilingual).

## Architecture (mirror the MOO-76 digest pattern: pure module + thin script)

- **`agent/sandbox/corpus.js`** — pure data. `SANDBOX_CHANNELS`: one entry per channel with
  `{ name, language, client, boundary, committees, keywords, messages[], thread? }`. Messages
  are `{ date, text }`; `thread` is `{ anchor, messages[] }` (first message = parent, rest =
  in-thread replies). Stores only text — **no user IDs, no author fields** (the minimal-PII
  rule extends here). Committee strings are the exact real `EventBodyName` values copied from
  the working `#general` subscription, so subscriptions actually route alerts/digests.
- **`agent/sandbox/plan.js`** — pure builders + validators:
  - `CONTENT_DATE_RE` — the content-date prefix convention `🗓️ _[Mon YYYY]_ `.
  - `formatMessage({ date, text })` → prefixed display text.
  - `buildDisclosureMessage(language)` → pinned-disclosure text (EN; +ES line for `es`).
  - `buildSeedPlan(channels)` → `[{ name, channelName, subscription, disclosure, posts }]`
    where `posts` is an ordered list of `{ text, thread? }` and the anchor parent carries a
    `threadKey` so replies attach via `thread_ts`. `subscription` matches
    `upsertSubscription` args exactly.
  - `assertCorpusInvariants(channels)` — throws unless: exactly 3 channels; ≥1 `language:'es'`;
    every channel has a valid district boundary; every message (standalone + thread) carries a
    content-date prefix; no message text contains a Slack user-id pattern (`/U[A-Z0-9]{6,}/`);
    the anchor thread exists, has ≥2 messages, references `2000 S 13th St`/`Punta Cana`, and
    lives in an `es` channel.
- **`agent/sandbox/index.js`** — re-export (mirrors `digest/index.js`).
- **`agent/scripts/seed-sandbox.mjs`** — thin orchestrator (mirrors `digest-once.mjs`):
  1. Load env, build `ConvexHttpClient` + bot `WebClient`.
  2. `assertCorpusInvariants` then `buildSeedPlan`.
  3. Resolve each `channelName` → id via `conversations.list` (skip+warn if not found / bot
     not a member).
  4. `SEED_DRY_RUN=1` → print the plan (subscription + messages) and exit, no writes.
  5. Per channel: `upsertSubscription` (idempotent); **pin-guard** — if the channel already
     has a pinned message whose text matches the disclosure marker, skip message seeding
     unless `SEED_FORCE=1` (makes re-runs safe); else post disclosure, pin it, then post each
     message (anchor parent first, replies with its `thread_ts`).
  6. Print a summary line; `main().then(exit0).catch(exit1)`.

## Content-dating & disclosure (demo-honest)

- Every message text is prefixed `🗓️ _[Mon YYYY]_ ` (e.g. `🗓️ _[Feb 2025]_ …`). The bracket
  is metadata; Spanish message bodies keep English month abbreviations in the bracket.
- Each channel gets a **pinned** disclosure: _"📋 Staged sandbox channel — posted for the
  Gavel demo. Bracketed dates like [Feb 2025] are the content's represented date, not when it
  was posted. No real resident data."_ (`es` channels append a one-line Spanish translation.)

## The anchor thread (`#clarke-square`, bilingual)

A 3-4 message resident conversation about **Punta Cana LLC / 2000 S 13th St / File #260229**
(liquor license → LICENSES COMMITTEE), mixing EN + ES so it demos the RTS EN+ES query merge.
This is the thread the demo's `search_community_memory` surfaces. The other two channels get
~4-5 standalone content-dated messages drawn from the personas (Denise's "anyone know what's
happening on X St?", vacant-lot/rezoning rumors).

## Testing (TDD, `node --test`, `tests/sandbox/`)

- `tests/sandbox/corpus.test.js` — `assertCorpusInvariants(SANDBOX_CHANNELS)` passes; the
  individual invariants (channel count, ≥1 es, district boundary shape, no user-id leak,
  content-date prefix on all messages, anchor thread placement/content) each tested.
- `tests/sandbox/plan.test.js` — `formatMessage` applies the prefix; `buildDisclosureMessage`
  contains "staged"/"sandbox" and adds a Spanish line for `es`; `buildSeedPlan` produces one
  plan per channel, a `subscription` shaped exactly for `upsertSubscription`, and an ordered
  `posts` list where anchor replies carry the parent `threadKey`.

The `.mjs` orchestrator is thin I/O and is verified live, not unit-tested (matches the
digest/poller precedent).

## Verification (maps to the Linear checklist)

- Subscriptions readable via `listSubscriptions` after seeding (3 new channels, correct
  languages + district boundaries).
- **RTS query against a seeded channel returns the planted thread** — run
  `node scripts/rts-smoke.mjs "Punta Cana"` (and `"2000 S 13th"`) and confirm a planted
  `#clarke-square` message comes back.
- **Judge-account walkthrough** stays an explicit **human item** (the channels are public, so
  any workspace guest sees the history; needs a real guest/judge account to confirm access).

## Out of scope (held)

Polygon geo, real production workspace data, full message-corpus backfill, per-user storage.
