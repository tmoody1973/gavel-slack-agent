# MOO-41 Handoff — Legistar poller (the heartbeat)

_For a fresh session to build MOO-41 with clean context. MOO-42 (summarizer) and MOO-45 (subscriptions) are merged to `main` and are this issue's two consumers. Read this + the issue contract; you shouldn't need to re-derive anything._

## The goal (definition of done)

A scheduled poller watches Milwaukee Legistar, **detects genuinely new agenda items**, and **enqueues a summarize+alert job** for each — idempotently (no re-detection across runs), end-to-end under 20 minutes. This is the heartbeat that makes Gavel *proactive*; MOO-44 turns the enqueued job into the posted Block Kit card.

**Acceptance criteria (from the issue — the contract):**
- [ ] Fly.io cron on a 5-minute interval
- [ ] Queries upcoming events + event agendas via Legistar OData
- [ ] New items detected via **diff against last-seen state in Convex**
- [ ] Detected items **enqueue a summarize+alert job**
- [ ] Agenda-posted → detected latency **< 20 min**

**Verify against reality:** a real run log detecting a genuinely new live item · no duplicate detections across consecutive runs (idempotent diff) · measured latency pasted into the issue.

**Out of scope (do not build):** summary generation (✅ MOO-42, done — you *call* it), agenda-change / walk-on detector (Phase 3, MOO-51), escalation ping (MOO-52). County (MOO-66) is parked but **build `{client}`-aware** so it's a one-line flip later.

## Start the session
1. `build MOO-41` → `linear-build` reads the contract, restate intent, move → In Progress.
2. Branch `tarikjmoody/moo-41-legistar-poller-on-flyio-cron-detect-new-agenda-items` off `main` (branch-per-issue; everything merges to main).
3. **This is a chunky issue** (cron + state + diff + queue) — worth a short written plan via `superpowers:writing-plans` before TDD. Brainstorm the open questions below first.

## What already exists (your consumers — don't rebuild)

**Summarizer — `agent/summarizer/`** (MOO-42, merged)
- `summarizeMatter(matter, { generate })` → `{ summary, whyItMatters, addresses, sourcesUsed, wordCount }`.
- `createClaudeGenerate()` builds the real `generate` (Sonnet 4.6, structured output). Anthropic key in `agent/.env`.
- **Matter input shape the poller must produce:** `{ fileNumber, title, matterText, attachments: [{ name, text }] }`. (Milwaukee `MatterText` is empty in practice — title carries the substance; that's fine, the summarizer handles it.)

**Subscriptions — `agent/convex/subscriptions.ts` + `agent/subscriptions/normalize.js`** (MOO-45, merged)
- `listSubscriptions({ client? })` → all rows (the poller's fan-out: which channels + which committees/keywords to watch, and the `language` to write in).
- `getSubscription({ channelId })`, `upsertSubscription`, `setLanguage`, `removeSubscription`.
- Row shape: `{ channelId, client, committees[], keywords[], language, boundary? }`. **Minimal PII — never add Slack user IDs or message content.**

**Convex is live:** dev deployment `vivid-weasel-903`, `CONVEX_URL` in `agent/.env.local` (gitignored). Run `npx convex dev` to push/codegen. `convex/_generated/` is gitignored. Schema lives in `agent/convex/schema.ts` — you'll **add a table here** (see below).

**Agent scaffold — `agent/`** (Bolt + Slack CLI, MOO-38). `cd agent && slack run`. Tests: `node --test` (42/42 now). Lint: `npx @biomejs/biome check .`.

## The build pattern to follow (proven on MOO-42 + MOO-45)
**Inject the boundaries; unit-test the pure logic; verify the boundary against real data.**
- The **diff** — *given fetched Legistar items + last-seen state → which items are new* — is **pure and deterministic**. Unit-test it under `node --test` (RED first). This is the heart of MOO-41 and the idempotency guarantee.
- The **Legistar fetch** and **Convex read/write** are the boundaries: injected as dependencies, exercised in a live verification script (`scripts/poller-verify.mjs`), not in the unit suite.
- Close with a **real run log** (the issue's verification), not assertions.

## Validated Legistar facts (do NOT re-validate — MOO-37 / `docs/gavel-legistar-data-reference.md`)
- Base URL `https://webapi.legistar.com/v1/{client}` — `milwaukee` now, **no auth token**. Build `{client}`-aware.
- **Alert only on `EventAgendaStatusName = Final`.** (Diff Draft→Final is the Phase-3 walk-on detector — out of scope here.)
- `EventAgendaLastPublishedUTC` is the agenda-change field — re-pull an event when it moves.
- Spine query path: **Events (next 7 days, Final) → `/events/{id}/eventitems?Attachments=1` → Matters → map to summarizer shape.** `/events/{id}/eventitems` is the richest single endpoint.
- EventItems carry `EventItemId`, `EventItemMatterId`, `EventItemTitle`, `EventItemAgendaNumber`, etc. Fetch the full matter via `/matters/{MatterId}` for the title; `/matters/{id}/texts` is **empty in Milwaukee** (verified across the ID range) — title is the source.
- **1,000-row hard cap** per query; page with `$top`/`$skip`. Be polite: set a UA string (use `GavelCivicAgent/0.1 (…; contact tarik@radiomilwaukee.org)`), poll on the 5-min cron, cache lookup tables.
- No geocoded fields anywhere — addresses come from the title via the summarizer (already handled).

## Open design decisions to settle at session start (brainstorm these)
1. **Dedup key + state table.** Add a Convex table (e.g. `seenAgendaItems`) keyed by a stable id — likely `EventItemId` (or composite `eventId:matterId`). The diff = fetched items whose key isn't in the table; on enqueue, record the key. Decide: store per-item, or a per-event `EventAgendaLastPublishedUTC` watermark + per-item keys? Idempotency hinges on this.
2. **What "enqueue a summarize+alert job" means.** Strong candidate: **Convex scheduler** (`ctx.scheduler.runAfter`) kicks a Convex action that calls `summarizeMatter` then the alert (MOO-44). Alternative: poller calls summarize inline and writes an `alerts` row MOO-44 renders. Pick the simplest path to one posted card; keep it `{client}`-aware.
3. **Subscription matching boundary.** MOO-41's acceptance is *detection + enqueue*, not channel-targeting. Decide whether the job carries just the new item (matching to channels happens in the alert step, reading `listSubscriptions`) or whether the poller pre-filters by committee/keyword. Lean: detect-all → enqueue item → the alert step matches subscriptions. Confirm so scope doesn't bleed.
4. **Fly.io now vs local-run-first.** The detection logic + a local `node scripts/poller-verify.mjs` proves the acceptance criteria. The Fly.io cron is the deployment wrapper (a `fly.toml` + scheduled machine / cron). Reasonable to build+verify the logic locally, then wrap in Fly cron — but the issue lists Fly cron as acceptance, so don't skip it; just sequence it last.

## Run / verify
- Local poll run: `node scripts/poller-verify.mjs` (to be created) — fetch live Legistar, diff vs Convex, print detected items + latency; run twice to prove no duplicates.
- Convex: `npx convex dev` (push schema + functions, codegen).
- Anthropic key in `agent/.env`; `CONVEX_URL` in `agent/.env.local`.

## Guardrails (from CLAUDE.md)
- **Proactive, not a chatbot** — the poller fires alerts unprompted.
- **Never persist Slack message content.** The new state table holds civic-record keys only (EventItemId etc.), never Slack data.
- Honor the issue's "Out of scope." Verify against real Legistar; close with a real run log + measured latency.

---
*Prereqs done: MOO-42 (summarizer) ✅, MOO-45 (subscriptions + Convex live) ✅. MOO-41 wires them into the first posting card (with MOO-44 next).*
