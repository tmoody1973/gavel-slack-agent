# Spine Build Handoff

_For a fresh session to build Gavel's core loop. Phase 0 is complete and every dependency is validated — this doc is everything you need to start building without re-investigating._

## The goal (definition of done for "the spine")

**A real, unprompted Block Kit card posts to a real Slack channel, summarizing a real Milwaukee agenda item in plain English — with a "How to be heard" footer.** That single end-to-end moment is the product's thesis and the first 25 seconds of the demo. Build to that; everything else decorates it.

## Step 0 — pick a clean base (do this first)

The agent scaffold currently lives **only on branch `tarikjmoody/moo-38-…` (PR #1, unmerged)**. `main` does **not** have `agent/`. Before building:

- **Recommended:** merge **PR #1 → main**, then `git checkout main` and build the spine from there (branch per issue off main). This gives one clean base and ends the "docs on main vs code on branch" confusion.
- Alternative: keep building on the `moo-38` branch (it already has `agent/` + docs merged in).

Either way: **re-auth Linear** (per-session OAuth) → "list my Gavel issues" to confirm access.

## Build order (issue-by-issue via `linear-build` + superpowers; TDD; verify on REAL data)

1. **`build MOO-42` — Claude summarizer** *(recommended first: self-contained, no Slack/Convex dep, the product's brain)*
   - Real Legistar matter → plain English (≤ ~80 words) + a one-line **"why it matters"** + **street addresses extracted** into structured fields.
   - Fallback chain for sparse titles: **title → MatterText → first attachment** (`/File` PDF).
   - Anthropic key is in `agent/.env`. Test against real matters (e.g. file 252190, the 234 S Water St rezone).

2. **`build MOO-45` — Convex subscription state**
   - Schema: channel subscriptions (committees, keywords, optional boundary, **`language`** EN/ES per channel). CRUD paths. Minimal PII (channel id, language, lists).

3. **`build MOO-41` — Legistar poller (Fly.io cron)**
   - 5-min cron → query upcoming events + agendas (OData) → **diff new items vs last-seen state (Convex)** → enqueue a summarize+alert job.
   - **Build it `{client}`-aware** (`milwaukee` now; `milwaukeecounty` later — MOO-66). Same code path, different base-URL segment.

4. **`build MOO-44` — Block Kit alert + "How to be heard" footer**
   - Unprompted card: summary + "why it matters" + buttons (Watch · History · Ask Gavel) + footer (hearing date/time, location, public-comment registration, alderperson contact via Legistar OfficeRecords).
   - This is the moment the goal above is met. **Stop and demo it.**

*(Then, still Phase 1 but after the card posts: MOO-43 bilingual EN/ES, MOO-46 slash commands. Not part of the minimal spine.)*

## Validated facts the spine depends on (do NOT re-validate — see MOO-37/38/39)

- **Legistar:** `https://webapi.legistar.com/v1/{client}` — no token. **Alert only on `EventAgendaStatusName = Final`.** Page with `$top` ≤ 1000 (never request more — it returns a degenerate page).
- **The spine query path:** Events (next 7 days, Final) → EventItems (`?Attachments=1`) → Matters → enrich. Richest endpoint: `/events/{id}/eventitems`.
- **Summaries source the title + text + attachments**, not `MatterEXText*` (empty in Milwaukee). **Extract address/district from the title via Claude.**
- **Subscriptions = custom classification:** committee (`EventBodyName`) + title keyword + Claude topic-tag against the city's 854-term vocabulary. **Do not** rely on `MatterIndexes` (only tagged post-enactment; Gavel alerts pre-vote).
- **"How to be heard":** sponsors via `/matters/{id}/sponsors` → Persons/OfficeRecords for alderperson contact.

## Architecture guardrails (from CLAUDE.md)

- **Proactive, not a chatbot** — the alert fires unprompted. Never design the primary UX as "type a question at a bot."
- **Never persist Slack messages** — public record is indexed; Slack is queried live via RTS only. (Doesn't affect the spine, but don't violate it.)
- **Honor each issue's "Out of scope."** Build only to the acceptance criteria. Verify against real data; close with evidence.

## SCOPE FREEZE (important)

**Add no new issues, and do not build, MOO-65 / 66 / 67 / 68, until one alert card posts to Slack.** County, audio briefings, permit/license alerts, and the Turners interview are validated and parked. The spine is the only path to a working demo — protect it.

## In parallel (not a blocker)

Schedule the **Milwaukee Turners interview (MOO-65)** this week — guide at `docs/discovery/milwaukee-turners.md`. Two make-or-break questions: (1) are they on Slack? (2) city vs county beat? The spine is needed regardless of the answers.

## Run / verify

- Agent: `cd agent && slack run` (socket mode; installs to the `gavel-project` Enterprise sandbox).
- RTS smoke (already passing): `node agent/scripts/rts-smoke.mjs "<query>"` (token in `agent/.env`).
- Convex: stand up via `npx convex dev` when starting MOO-45.
