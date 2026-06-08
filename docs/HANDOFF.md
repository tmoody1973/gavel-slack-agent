# Gavel — Session Handoff (resume here)

_Updated 2026-06-08, end of the go-live + MOO-47 session. For a fresh/clean-context session. Read this + CLAUDE.md + Linear (team Moodyco, project "Gavel — Slack Agent for Civic Transparency") + `journal/2026-06-08.md` (4 sessions). Supersedes the prior "go-live next" version._

## Where things stand — **spine is LIVE + Phase 2 keystone shipped** ✅

**Phase 1 spine is live and auto-posting.** `gavel-poller` on Fly runs the detect**+post** `poll-once.mjs` every 5 min: detect new Milwaukee `Final` agenda item → enrich → bilingual EN/ES summarize → match subscription → post a Block Kit card to subscribed channels. Backfill was drained (105 stale rows flipped to `sent`), both Fly secrets are set, one cron machine.

**Phase 2 started — MOO-47 (Milwaukee Civic MCP server) is merged + Done.** Standalone stdio package `mcp-server/` with 9 Legistar tools, vendored client, structured-error contract, README, and agent wiring. PR #6 merged to `main`.

Done so far: MOO-37/38/39/40 (Phase 0), MOO-41/42/44/45 (Phase 1 spine), **MOO-47** (Phase 2). Suites: `mcp-server` 16/16, `agent` 89/89, lint clean.

## DO NEXT (priority order)
1. **MOO-48 — Bolt assistant threads + tool router + mirror-language system prompt.** The natural next pickup: it consumes the new MCP server (`build MOO-48`). It's what unblocks **MOO-49 (RTS)** — RTS is `blockedBy` MOO-48. Wire the agent's assistant-thread surface so a user can ask Gavel about a matter and it routes to the `milwaukee-civic` tools (already connected in `agent/agent/agent.js`).
2. **MOO-49 — RTS** (`assistant.search.context`): query the channel's own discussion live, never store (ToS rule). The demo "wow" beat. Blocked only by MOO-48 now (MOO-38 already retired the RTS *access* risk).
3. **Phase 3 / parked:** MOO-51 (walk-on/`<48h` detector — dormant `walkOnFlag` slot in `card.js` ready), MOO-52 (escalation — `get_matter_history` tool now exists to power it), MOO-69 (AgentMail), MOO-68 (permits/CKAN). Honor each issue's "Out of scope."

## The build pattern (proven on MOO-41/42/44/45/47 — keep using it)
linear-build (contract) + superpowers (engine). Per issue: `build MOO-XX` → restate intent → **In Progress** → brainstorm only if fuzzy → **worktree** → plan (chunky issues) → **TDD** → lint → PR → **auto-Done on merge** (Linear↔GitHub closes it) → journal. For chunky issues, MOO-47 proved the full flow: brainstorm → design doc → plan → **subagent-driven-development** (implementer + 2 reviewers per batch) → polish → PR. Specs/plans/journals commit to `main` directly under `docs/superpowers/` and `journal/`.

## Validated facts / gotchas (do NOT re-derive)
- **Fly `gavel-poller`:** secrets `CONVEX_URL` + `SLACK_USER_TOKEN` + `ANTHROPIC_API_KEY` all set (the post path needs the Anthropic key — the summarizer runs in the cron). One machine. `fly logs -a gavel-poller` shows ticks (`…posted N`). Redeploy: `fly deploy --remote-only` from `agent/`. The `markAllSent` Convex mutation drains the pending queue without posting (go-live reset tool).
- **Slack:** env has only `SLACK_USER_TOKEN` (org Enterprise-Grid `xoxp`); no bot token. Posting + live cards go out **as the user**. The live Bolt listener runs via `slack run -a A0B8GP68PLJ --org-workspace-grant all --force` from the **main checkout's** `agent/` (worktrees lack gitignored `.slack/` + `.env` — copy them in to run there). App id `A0B8GP68PLJ`, channel `#general` `C0B8KS5VCCC`.
- **MCP server (MOO-47):** lives at repo-root `mcp-server/` (standalone, `npx milwaukee-civic-mcp` / `node src/server.js`). Self-test: `cd mcp-server && node --test` (16/16), `node scripts/mcp-verify.mjs` (live Legistar). Legistar client is **vendored** there (a copy of `agent/poller/legistar.js` + 5 more methods) — DON'T assume editing one updates the other; tech-debt issue to dedupe into `legistar-core` is pending. SDK is `@modelcontextprotocol/sdk` 1.29.0 (`registerTool` + `z.object` inputSchema works). Every tool returns `{ status: "information_unavailable", reason }` on failure instead of throwing.
- **Agent ↔ MCP:** the agent impl is at **`agent/agent/agent.js`** (nested). It has a `milwaukee-civic` external-stdio `mcpServers` entry (`new URL('../../mcp-server/src/server.js', import.meta.url)`) + `mcp__milwaukee-civic__*` in `allowedTools`. Proven working: `cd agent && node scripts/mcp-connection-verify.mjs` drives `query()` and logs `mcp__milwaukee-civic__get_upcoming_events` being invoked. (Needs `agent/.env` for `ANTHROPIC_API_KEY` + `npm install` in `agent/`.)
- **Legistar** (`https://webapi.legistar.com/v1/milwaukee`, no token): alert only on `EventAgendaStatusName = Final`. `EventAgendaLastPublishedUTC` ships **without a `Z`** — tag as UTC. **~half of EventItems are boilerplate** — filter on `EventItemMatterId`. Voice votes → empty `votes` (tally-only). No online comment-registration form → footer links the per-meeting Legistar page. Full surface + 9-tool→endpoint map in `docs/gavel-legistar-data-reference.md` §4 + §"MCP tool surface".
- **Convex:** dev deployment `vivid-weasel-903`, `CONVEX_URL` in `agent/.env.local` (gitignored). `detectedAgendaItems` = idempotency ledger **and** alert queue (`alertStatus pending|sent`). `_generated` gitignored — run `npx convex dev` after checkout.

## Run / repo
- `cd agent`: tests `node --test` (89/89) · lint `npx @biomejs/biome check .` · Convex `npx convex dev` · one poll cycle `node scripts/poll-once.mjs` (detect+post — careful, posts to matched channels) · one card `DEMO_CHANNEL_ID=C0B8KS5VCCC node scripts/alert-verify.mjs` · MCP connection proof `node scripts/mcp-connection-verify.mjs`.
- `cd mcp-server`: `node --test` (16/16) · `node scripts/mcp-verify.mjs` (live) · `node src/server.js` (stdio).
- Repo github.com/tmoody1973/gavel-slack-agent (private). PRs #1–#6 merged. Journals + specs/plans commit directly to `main`.
- **Re-auth Linear each session** (per-session OAuth) → "list my Gavel issues" (project "Gavel — Slack Agent for Civic Transparency").
