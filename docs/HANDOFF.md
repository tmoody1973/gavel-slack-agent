# Gavel — Session Handoff (resume here)

_Written 2026-06-08, end of the session that shipped the Phase 1 spine. For a fresh/clean-context session. Read this + CLAUDE.md + Linear (team Moodyco, project "Gavel") + `journal/2026-06-08.md`. Supersedes `docs/MOO-41-HANDOFF.md` (MOO-41 is done)._

## Where things stand — **Phase 1 spine is COMPLETE** ✅
All four spine issues merged to `main` and verified against real data:
- **MOO-42** Claude summarizer (`agent/summarizer/`) — EN + now native-bilingual (`summarizeMatterBilingual`).
- **MOO-45** Convex subscriptions (`agent/convex/subscriptions.ts`) — fan-out target + per-channel `language`.
- **MOO-41** Legistar poller (`agent/poller/`) — detects new `Final` agenda items, idempotent, on Fly cron.
- **MOO-44** Bilingual Block Kit alert card (`agent/alerts/`) — the first thing Gavel posts.

The full loop is proven end-to-end live: **detect new Milwaukee matter → enrich (Legistar) → bilingual EN/ES summarize → match subscription → post a Block Kit card** with summary, "why it matters", a "How to be heard / Cómo participar" footer (hearing time/location, meeting link, alderperson email+phone), and Watch/History/Ask Gavel buttons (handlers fire, channel-level ephemeral acks). Suite **89/89**, lint clean. Slack app renamed **agent → Gavel**.

## DO NEXT (priority order)
1. **Go live: reset backfill + enable the alert cron.** The live Fly app `gavel-poller` still runs **MOO-41 detect-only** `poll-once.mjs` (safe — it doesn't post). The merged `main` version of `poll-once.mjs` now does detect **+** `processPendingAlerts` (post). Before redeploying:
   - **Reset the ~89 stale backfilled rows** so the first auto-run doesn't dump 89 old cards + 89 Claude calls: mark every `detectedAgendaItems` `pending` row → `sent` (add a one-shot, or a `markAllSent` mutation, then verify `listPending` is empty). These are 2.7-day-old backfill, not genuinely-new.
   - **Set the Slack token in Fly:** `fly secrets set SLACK_BOT_TOKEN=… --app gavel-poller` (or rely on the `SLACK_BOT_TOKEN || SLACK_USER_TOKEN` fallback — confirm a usable token reaches the cron). Then `fly deploy --remote-only`.
   - Confirm a tick logs `posted N` only when a genuinely-new matching item appears.
2. **Phase 2** (now unblocked): custom Milwaukee Civic **MCP server** (MOO-47), Bolt **assistant threads**, **RTS** (`assistant.search.context`, MOO-49 — retires the #1 risk). RTS = query live, never store (ToS rule).
3. **Phase 3 / parked:** MOO-51 (walk-on/`<48h` detector — the dormant `walkOnFlag` slot in `card.js` is ready), MOO-52 (escalation), MOO-69 (AgentMail). Honor each issue's "Out of scope."

## The build pattern (proven on MOO-41/42/44/45 — keep using it)
linear-build (contract) + superpowers (engine). Per issue: `build MOO-XX` → restate intent → **In Progress** → brainstorm only if fuzzy (use the visual companion for UI/card questions) → **worktree** (native `EnterWorktree`, copy gitignored `agent/.env*` + `.slack/` in, `npx convex dev --once` for codegen) → **TDD** (inject boundaries, unit-test pure logic RED-first, verify the boundary live in `agent/scripts/*-verify.mjs`) → lint (`npx @biomejs/biome check .`) → PR → **auto-Done on merge** → journal. Specs/plans commit to `main` directly under `docs/superpowers/`.

## Validated facts / gotchas (do NOT re-derive)
- **Slack:** env has only `SLACK_USER_TOKEN` (org-level Enterprise-Grid `xoxp`); **no bot/app token**. Posting uses `SLACK_BOT_TOKEN || SLACK_USER_TOKEN`. The live listener (button handlers) runs via **`slack run -a A0B8GP68PLJ --org-workspace-grant all --force`** from the **main** checkout's `agent/` (worktrees lack gitignored `.slack/` — copy it in to run there). `slack run` needs a TTY unless you pass `-a <appId> --force`. App id `A0B8GP68PLJ`, channel `#general` `C0B8KS5VCCC`.
- **Legistar** (`https://webapi.legistar.com/v1/milwaukee`, no token): alert only on `EventAgendaStatusName = Final`. `EventAgendaLastPublishedUTC` ships **without a `Z`** — tag as UTC before time math. **~half of EventItems are boilerplate** — filter on `EventItemMatterId`. Footer data is all real: `/events/{id}` (time/location/inSiteUrl), `/matters/{id}/sponsors` → `/persons/{id}` (email/phone). Milwaukee has **no online comment-registration form** — the footer links the per-meeting Legistar page. All in `docs/gavel-legistar-data-reference.md` §4.
- **Convex:** dev deployment `vivid-weasel-903`, `CONVEX_URL` in `agent/.env.local` (gitignored). Table `detectedAgendaItems` = idempotency ledger **and** alert queue (`alertStatus pending|sent`). `convex/_generated` gitignored — run `npx convex dev` after checkout.

## Run / repo
- `cd agent`: tests `node --test` (89/89) · lint `npx @biomejs/biome check .` · Convex `npx convex dev` · one poll cycle `node scripts/poll-once.mjs` (detect+post — careful, posts to matched channels) · one card `DEMO_CHANNEL_ID=C0B8KS5VCCC node scripts/alert-verify.mjs`.
- Repo github.com/tmoody1973/gavel-slack-agent (private). PRs #1–#5 merged. Journals + specs/plans commit directly to `main`.
- **Re-auth Linear each session** (per-session OAuth) → "list my Gavel issues".
