# MOO-49 Handoff — Real-Time Search (RTS) integration

_Focused handoff to start **MOO-49** in a clean context window. Written 2026-06-09._

**Read first, in order:** this doc → `docs/HANDOFF.md` (general project state) → `CLAUDE.md` (architecture + the three-memory model + the hard ToS rule) → the **`slack-agent-builder`** skill (RTS domain reference) → PRD §"Live community memory" / RTS. Then re-auth Linear and `build MOO-49`.

---

## The issue (the contract)

**MOO-49 — Real-Time Search integration end-to-end (EN+ES merged) + fallback.** Sponsor-tech #3 and the demo's "wow" beat. Branch: `tarikjmoody/moo-49-real-time-search-integration-end-to-end-enes-merged-fallback`. Labels: `protected`, `P0`. **Now fully unblocked** (MOO-38 ✅, MOO-48 ✅).

**Intent:** when an agenda item/matter resurfaces, query the channel's OWN prior discussion live via RTS — community memory beside the official record, never stored.

**Acceptance criteria:**
- [ ] `assistant.search.context` queries the workspace's history when a matter/entity resurfaces
- [ ] Queries issued in both EN and ES; results merged + deduplicated
- [ ] Results presented side-by-side with the MCP official record ("your channel discussed this in March 2024" + prior vote record)
- [ ] **No Slack messages indexed, copied, or stored — queried live only**
- [ ] Fallback to Slack MCP search tools if RTS access is blocked

**Verification (prove against reality):**
- [ ] Live demo: seeded channel history surfaces via RTS for a real query; paste result
- [ ] Confirm nothing is persisted (code-path review + no Convex write)
- [ ] Force the fallback path and show it still returns community context

**Out of scope:** sandbox history seeding (Phase 3), vector/transcript search (Phase 4).

---

## The load-bearing rule (do not violate)

Gavel **indexes the public record** (transcripts/zoning/agendas → Convex) and **queries the private record live** (Slack messages → RTS, *never stored, copied, or indexed*). Any code that persists Slack message content violates Slack ToS and the project's central design claim. **No Convex write for RTS results.** (This is also why mem0 was rejected — see PRD "Agent Memory Decision".)

---

## What already exists (don't rebuild)

- **RTS API call is proven (MOO-38):** `agent/scripts/rts-smoke.mjs` calls `POST https://slack.com/api/assistant.search.context` with the **user token** (`xoxp-`), `content_types=messages`, `channel_types=public_channel`, `limit`. Requires scope **`search:read.public`**. **Run this first** to confirm RTS still returns data before building: `cd agent && node scripts/rts-smoke.mjs "didn't we oppose this developer before"`. (`scripts/rts-diagnose.mjs` is the verbose diagnostic.)
- **Manifest already grants the search scopes** (user): `search:read`, `search:read.public`, `search:read.private`, `search:read.mpim`, `search:read.im`, `search:read.files`, `search:read.users`. The `SLACK_USER_TOKEN` (xoxp) in `agent/.env` and as a Fly secret on `gavel-app` has them.
- **The Slack-MCP fallback is half-wired:** `agent/agent/agent.js` adds an http MCP server `slack-mcp` → `https://mcp.slack.com/mcp` with `Authorization: Bearer <userToken>` and `mcp__slack-mcp__*` in `allowedTools` — but **only when `deps.userToken` is truthy** (`agent.js:62`). This is the "Slack MCP search tools" fallback the acceptance criteria mention.

---

## ⚠️ THE key gotcha to solve first

`deps.userToken = context.userToken` (`message.js:61`, `app-mentioned.js:44`). In the **deployed bot-token app, `context.userToken` is `undefined`** — Bolt only holds the bot token; nothing populates a user token into context. Consequences:
- `slack-mcp` is **not added** in prod → this is exactly why the App Home shows the red **"Slack MCP Server is disconnected"** dot.
- **RTS cannot work until the user token reaches the agent.** `SLACK_USER_TOKEN` is a Fly secret on `gavel-app` (in `process.env`), but Bolt's `context.userToken` won't auto-populate from it.

**So MOO-49's first real task is threading `SLACK_USER_TOKEN` into the agent** — e.g. read `process.env.SLACK_USER_TOKEN` in the deps/`runAgent` path (fallback when `context.userToken` is absent), or add a Bolt authorize/context step. Decide this in the brainstorm. (Keep the bot token for posting; the user token is only for RTS/search.)

---

## Design questions to brainstorm (approach is NOT obvious — brainstorm first)

1. **Direct API vs MCP tool.** Two ways to do RTS: (a) call `assistant.search.context` directly (like `rts-smoke.mjs`) as a Gavel tool the agent invokes, or (b) let Claude use the `slack-mcp` http server's search tools. The acceptance treats **(b) as the fallback** — so likely a primary direct/own path + slack-mcp fallback. Pin this down.
2. **What triggers RTS?** "When a matter/entity resurfaces." In a thread, that's when the user asks about a matter Gavel can name — do we auto-query the channel's history for it? Or only on an explicit "have we discussed this?" Decide the trigger.
3. **EN+ES query + merge.** Translate the query to EN and ES, issue both, merge + dedup results (per CLAUDE.md multilingual: "issue RTS queries in both languages and merge").
4. **Side-by-side rendering.** How to present community memory beside the official MCP record (Block Kit? thread text? "your channel discussed this in March 2024" + the matter's vote history via `get_matter_history`/`get_votes`).
5. **Fallback detection.** How to detect "RTS access blocked" (ok:false / missing scope) and switch to `slack-mcp` search.

---

## Where the code lives

- Agent: `agent/agent/agent.js` (the `query()` loop, `mcpServers`, `SLACK_MCP_URL`, the `userToken` gate at line 62). DM/mention handlers: `agent/listeners/events/message.js`, `app-mentioned.js`.
- The civic MCP tools (the "official record" half of the side-by-side) are the `milwaukee-civic` server — already wired and working (`mcp__milwaukee-civic__*`).
- RTS scripts: `agent/scripts/rts-smoke.mjs`, `rts-diagnose.mjs`.

## Build pattern (same as the rest of the project)

`linear-build` (contract) + `superpowers` (engine): `build MOO-49` → restate intent → In Progress → **brainstorm** (the design questions above are real) → **worktree** (native `EnterWorktree`, branch from `main`; copy gitignored `agent/.env` + `.slack/` in if you need to run locally) → plan → **TDD** (unit-test the pure EN/ES merge+dedup + fallback logic; inject the RTS fetch boundary) → verify live with `rts-smoke.mjs` + a real deployed-thread test → lint (`npx @biomejs/biome check .`) → PR → auto-Done on merge → journal.

## Gotchas you'll otherwise re-derive

- **Deployed `gavel-app` runs as non-root `node`** and the agent spawns Claude Code (claude-agent-sdk) — see `docs/HANDOFF.md` for the full deploy notes (Dockerfile.app, secrets, redeploy command). To test RTS in prod you redeploy `gavel-app` (`fly deploy -c fly.app.toml --remote-only` from repo root) and DM the bot.
- **MCP tool results return text content only, no `structuredContent`** (array payloads fail MCP `-32602`) — if you add RTS as an MCP-style tool, follow that pattern.
- **Enterprise Grid:** install is granted to the **Hackathon** workspace `T0B8KS540G4`; RTS searches that workspace's public channels. App `A0B8GP68PLJ`.
- **Rotate the chat-pasted tokens** before/after (see `docs/HANDOFF.md` housekeeping) — the `SLACK_USER_TOKEN` RTS depends on was among them.
