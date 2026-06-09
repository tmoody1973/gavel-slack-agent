# MOO-49 — Community memory via Real-Time Search (design)

_Approved 2026-06-09. Issue: [MOO-49](https://linear.app/moodyco/issue/MOO-49) — RTS integration end-to-end (EN+ES merged) + fallback._

## Problem

When an agenda item, address, developer, or topic resurfaces, Gavel should surface the
channel's OWN prior discussion live via Slack's Real-Time Search API
(`assistant.search.context`) and present it beside the official civic record — without ever
storing a Slack message. If RTS access is blocked, fall back to Slack's hosted MCP search
tools. This is sponsor-tech #3 and the demo's "wow" beat.

**The load-bearing rule:** Gavel indexes the public record and queries the private record
live. No Slack message content is ever persisted (no Convex writes, no caches, no logs of
message bodies).

## Decisions (brainstormed 2026-06-09)

1. **Primary path = in-process agent tool.** A `search_community_memory` tool registered
   via `createSdkMcpServer()` (the established pattern in `agent/agent/agent.js`), calling
   `assistant.search.context` directly with the user token. We own the EN+ES fan-out and
   merge/dedup, and it is unit-testable. `slack-mcp` (Slack's hosted MCP server) stays
   wired as the fallback — exactly the role the acceptance criteria give it.
2. **Trigger = agent-decided, prompt-nudged.** A system-prompt section instructs Claude:
   when a user asks about a specific matter/address/developer/topic in a channel or
   thread, also query community memory and weave it in. No trigger code; covers both
   explicit ("have we discussed this?") and implicit resurfacing.
3. **Rendering = agent-composed sections.** The tool returns plain text results (per the
   MCP no-`structuredContent` gotcha); Claude composes the reply with a
   "📋 Official record" part (civic tools) and a "💬 Your community's memory" part
   (dates + permalinks), in the user's language, through the existing `markdown_text`
   streamer. No new Block Kit layer.

## Architecture

New module `agent/agent/community-memory/` (small focused files):

| File | Responsibility |
|---|---|
| `rts-client.js` | `searchRts(query, { userToken, fetchFn })` — one `assistant.search.context` POST (`content_types=messages`, `channel_types=public_channel`, `limit`), mirroring the proven `scripts/rts-smoke.mjs`. `fetchFn` injected for tests. Returns `{ ok, messages, error }`. |
| `merge.js` | Pure functions. `mergeAndDedupe(enMessages, esMessages)` — dedup key `channel + ts`, newest-first, merged list capped at 8 (each RTS call uses `limit=5`). `formatResultsAsText(messages)` — author, date, channel, snippet, permalink as plain text. |
| `tool.js` | `createCommunityMemoryTool({ userToken })` via `tool()` + Zod. Input `{ query_en, query_es }` — Claude generates both natively (no translation API). Fires both RTS calls in parallel, merges, returns formatted text. Handles fallback signaling. |

### Changes to `agent/agent/agent.js`

- **User-token threading (the key gotcha):**
  `const userToken = deps?.userToken ?? process.env.SLACK_USER_TOKEN;` resolved once in
  `runAgent`. In the deployed bot-token app `context.userToken` is `undefined`; the Fly
  secret `SLACK_USER_TOKEN` is the production source. Bot token continues to do all
  posting; the user token is only for RTS/search. This also activates the existing
  `slack-mcp` wiring in prod (fixes the App Home "Slack MCP Server is disconnected" dot).
- When `userToken` exists: register the in-process `community-memory` SDK server
  (primary) and keep `slack-mcp` (fallback); append a **COMMUNITY MEMORY** section to the
  system prompt (search trigger guidance, side-by-side composition guidance, "if the tool
  reports RTS unavailable, use the slack-mcp search tools", never store messages).
- When `userToken` is absent: neither server registered, prompt section omitted —
  graceful degradation identical to today.

### Data flow

User message → listener builds `deps` (unchanged) → `runAgent` resolves `userToken` →
Claude decides a matter/entity resurfaced → calls
`search_community_memory(query_en, query_es)` → two parallel RTS calls → merge + dedup →
formatted text → Claude composes official-record + community-memory answer in the user's
language.

## Fallback (acceptance criterion #5)

- RTS returns `ok:false` (`missing_scope`, `not_allowed_token_type`, …) or fetch throws →
  the tool returns text telling the agent: RTS is unavailable, use the `slack-mcp` search
  tools instead. The agent then satisfies the request via `mcp__slack-mcp__*`.
- `GAVEL_DISABLE_RTS=1` env switch makes the tool behave as if RTS were blocked, so the
  fallback path can be forced deterministically for verification/demo.

## No-persistence guarantee (acceptance criterion #4)

- `community-memory/` imports nothing from Convex; results exist only in the tool-result
  text passed to Claude.
- Message bodies are never logged.
- Verified at the gate by code-path review + grep (`convex`, `fetch` writes) over the new
  module.

## Error handling

- Missing/blank token → servers not registered; agent works as today.
- Non-200 / network error / malformed JSON → informative tool text (with the fallback
  instruction); the agent loop never crashes.
- One language's RTS call failing while the other succeeds → return the successful side,
  note the partial result.

## Testing

Unit (`node --test`, fetch injected — no network):

- `merge.js`: dedup on overlapping `channel+ts`, ordering newest-first, cap, empty inputs,
  one-sided results.
- `formatResultsAsText`: fields present, empty-result message.
- `tool.js`: EN+ES fan-out (exactly two fetch calls with correct body params), merged
  output, fallback text on `ok:false`, on thrown fetch, and on `GAVEL_DISABLE_RTS=1`;
  partial-failure handling.
- Token resolution: `deps.userToken` wins; env fallback used when absent; no servers when
  neither set.

Live verification (the issue's checklist):

1. Seeded channel history surfaces via RTS for a real query through the deployed bot —
   paste the result.
2. Code-path review confirming no persistence (no Convex write).
3. Force the fallback (`GAVEL_DISABLE_RTS=1`) and show community context still returned
   via slack-mcp.

## Out of scope

Sandbox history seeding (Phase 3). Vector/transcript search (Phase 4). Any new Block Kit
rendering layer. Changes to the milwaukee-civic MCP server.
