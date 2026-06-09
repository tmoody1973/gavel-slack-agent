# Gavel — Session Handoff (resume here)

_Updated 2026-06-08 (into 06-09 UTC), end of the deploy-interactive + identity session. For a fresh/clean-context session. Read this + CLAUDE.md + Linear (team Moodyco, project "Gavel — Slack Agent for Civic Transparency") + `journal/2026-06-08.md` (5 sessions)._

## Where things stand — **Gavel is LIVE, hosted, and interactive** ✅

**Phase 1 spine is live and auto-posting.** `gavel-poller` on Fly runs detect**+post** `poll-once.mjs` every 5 min → bilingual Block Kit alert cards to subscribed channels. Posts as the **Gavel bot** now (`SLACK_BOT_TOKEN` set).

**The interactive agent is deployed.** `gavel-app` on Fly runs `agent/app.js` always-on in **Socket Mode** — DMs, buttons, and the milwaukee-civic tools work hosted, **no `slack run`**. Gavel answers real civic questions from live Legistar data, in English and Spanish, with its own civic identity.

**Phase 2 essentially complete:** MOO-47 (MCP server), **MOO-70** (deploy interactive app + bot identity), **MOO-71** (civic identity) all merged + Done.

Done so far: MOO-37/38/39/40 (Phase 0), MOO-41/42/44/45 (Phase 1), MOO-47/70/71 (Phase 2). Suites: `mcp-server` 17/17, `agent` 89/89, lint clean. PRs #1–#8 merged.

## DO NEXT (priority order)
1. **Cosmetic / housekeeping (quick):** rename the app **"Gavel (local)" → "Gavel"** at api.slack.com/apps/A0B8GP68PLJ → Basic Information (the "(local)" is the CLI dev-app label, not a status); **rotate** the `xoxb`/`xapp`/`xoxp` tokens that were pasted in chat (regenerate on the same page → update Fly secrets on `gavel-app` + `gavel-poller`); **`/invite @Gavel`** to alert channels so poller cards post as the bot (it has `chat:write`, not `chat:write.public`).
2. **MOO-48 — Bolt assistant threads + tool router.** Formalize/clean up what now works ad hoc (the agent already routes DMs to milwaukee-civic). Unblocks **MOO-49**.
3. **MOO-49 — RTS** (`assistant.search.context`): the live community-memory beat (the red "Slack MCP disconnected" App-Home dot is this, deliberately not wired). Query live, never store.
4. **Phase 3 / parked:** MOO-51 (walk-on detector — `walkOnFlag` slot in `card.js` ready), MOO-52 (escalation — `get_matter_history` exists), MOO-69 (AgentMail), MOO-68 (permits/CKAN).

## The build pattern (proven on MOO-41/42/44/45/47 — keep using it)
linear-build (contract) + superpowers (engine). Per issue: `build MOO-XX` → restate intent → **In Progress** → brainstorm only if fuzzy → **worktree** → plan (chunky issues) → **TDD** → lint → PR → **auto-Done on merge** (Linear↔GitHub closes it) → journal. For chunky issues, MOO-47 proved the full flow: brainstorm → design doc → plan → **subagent-driven-development** (implementer + 2 reviewers per batch) → polish → PR. Specs/plans/journals commit to `main` directly under `docs/superpowers/` and `journal/`.

## Validated facts / gotchas (do NOT re-derive)
- **Fly `gavel-poller`:** secrets `CONVEX_URL` + `SLACK_USER_TOKEN` + `ANTHROPIC_API_KEY` all set (the post path needs the Anthropic key — the summarizer runs in the cron). One machine. `fly logs -a gavel-poller` shows ticks (`…posted N`). Redeploy: `fly deploy --remote-only` from `agent/`. The `markAllSent` Convex mutation drains the pending queue without posting (go-live reset tool).
- **Fly `gavel-app` (MOO-70, the interactive agent):** runs `agent/app.js` always-on in **Socket Mode** (no HTTP port). Built from repo-root `Dockerfile.app` + `fly.app.toml` (bundles `agent/` + `mcp-server/`). Redeploy: `fly deploy -c fly.app.toml --remote-only` from repo root. Secrets: `SLACK_BOT_TOKEN` (xoxb) + `SLACK_APP_TOKEN` (xapp, `connections:write`) + `SLACK_USER_TOKEN` + `ANTHROPIC_API_KEY` + `CONVEX_URL`. **Runs as the non-root `node` user — REQUIRED:** the agent uses `claude-agent-sdk`, which *spawns the Claude Code CLI*, and Claude Code refuses `permissionMode: bypassPermissions` (`--dangerously-skip-permissions`) as root (exits 1 on every DM). `fly ssh console` logs in as root — check the real process with `grep Uid /proc/<app.js pid>/status` (uid 1000).
- **Slack tokens:** `agent/.env` now has `SLACK_BOT_TOKEN` (xoxb) + `SLACK_APP_TOKEN` (xapp) too (gitignored). App `A0B8GP68PLJ`, bot `B0B8LBSPA20`, named "Gavel (local)" (CLI dev-app label — rename in app config to drop "(local)"). Install granted to the **Hackathon** workspace `T0B8KS540G4`; `#general` `C0B8KS5VCCC`. `slack run` still works locally from the main checkout's `agent/` for dev. **Rotate the tokens that were pasted in chat.**
- **MCP result shape (learned the hard way, MOO-71):** tools return JSON **as text content only** — NO `structuredContent`. MCP requires `structuredContent` to be an *object*; list tools return arrays → `-32602` protocol error that only shows when the *agent* calls the tool (fake-server unit tests miss it). `mcp-server/test/mcp-protocol.test.js` is a real MCP-client stdio test that guards this.
- **MCP server (MOO-47):** lives at repo-root `mcp-server/` (standalone, `npx milwaukee-civic-mcp` / `node src/server.js`). Self-test: `cd mcp-server && node --test` (17/17), `node scripts/mcp-verify.mjs` (live Legistar). Legistar client is **vendored** there (a copy of `agent/poller/legistar.js` + 5 more methods) — DON'T assume editing one updates the other; tech-debt issue to dedupe into `legistar-core` is pending. SDK is `@modelcontextprotocol/sdk` 1.29.0 (`registerTool` + `z.object` inputSchema works). Every tool returns `{ status: "information_unavailable", reason }` on failure instead of throwing.
- **Agent ↔ MCP:** the agent impl is at **`agent/agent/agent.js`** (nested). It has a `milwaukee-civic` external-stdio `mcpServers` entry (`new URL('../../mcp-server/src/server.js', import.meta.url)`) + `mcp__milwaukee-civic__*` in `allowedTools`. Proven working: `cd agent && node scripts/mcp-connection-verify.mjs` drives `query()` and logs `mcp__milwaukee-civic__get_upcoming_events` being invoked. (Needs `agent/.env` for `ANTHROPIC_API_KEY` + `npm install` in `agent/`.)
- **Legistar** (`https://webapi.legistar.com/v1/milwaukee`, no token): alert only on `EventAgendaStatusName = Final`. `EventAgendaLastPublishedUTC` ships **without a `Z`** — tag as UTC. **~half of EventItems are boilerplate** — filter on `EventItemMatterId`. Voice votes → empty `votes` (tally-only). No online comment-registration form → footer links the per-meeting Legistar page. Full surface + 9-tool→endpoint map in `docs/gavel-legistar-data-reference.md` §4 + §"MCP tool surface".
- **Convex:** dev deployment `vivid-weasel-903`, `CONVEX_URL` in `agent/.env.local` (gitignored). `detectedAgendaItems` = idempotency ledger **and** alert queue (`alertStatus pending|sent`). `_generated` gitignored — run `npx convex dev` after checkout.

## Run / repo
- `cd agent`: tests `node --test` (89/89) · lint `npx @biomejs/biome check .` · Convex `npx convex dev` · one poll cycle `node scripts/poll-once.mjs` (detect+post — careful, posts to matched channels) · one card `DEMO_CHANNEL_ID=C0B8KS5VCCC node scripts/alert-verify.mjs` · MCP connection proof `node scripts/mcp-connection-verify.mjs`.
- `cd mcp-server`: `node --test` (17/17) · `node scripts/mcp-verify.mjs` (live) · `node src/server.js` (stdio).
- Repo github.com/tmoody1973/gavel-slack-agent (private). PRs #1–#8 merged. Journals + specs/plans commit directly to `main`.
- **Re-auth Linear each session** (per-session OAuth) → "list my Gavel issues" (project "Gavel — Slack Agent for Civic Transparency").
