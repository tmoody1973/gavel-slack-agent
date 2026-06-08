# MOO-47 — Milwaukee Civic MCP server (design)

_Locked 2026-06-08. Brainstormed against the live codebase + `docs/gavel-legistar-data-reference.md`. The contract is Linear MOO-47; this is the agreed shape before planning._

## Intent (from the issue)

A custom TypeScript MCP server wrapping Milwaukee Legistar OData so the agent — and any civic-tech builder — can query city legislation as tools. The open-source artifact and a sponsor-tech path. Keystone of Phase 2: unblocks MOO-48 (assistant threads), MOO-50 (parcel tools), MOO-52 (escalation), MOO-53 (watchlists).

## Decisions (the two load-bearing forks)

1. **Standalone stdio package** (not in-process agent tooling). The MCP server is its own publishable artifact; the agent connects to it as an external `mcpServers` stdio entry. Matches CLAUDE.md ("shippable open-source artifact in its own right") and the acceptance criteria ("runnable locally **and** connectable to the agent" + "README for open-source reuse").
2. **Vendored Legistar client** (not a shared cross-package core). Port `agent/poller/legistar.js` into the package so it is self-contained. The live poller (MOO-41) is **untouched** — zero risk to the shipped spine. Cost: ~150 lines duplicated; logged as tech-debt with a future dedupe issue (candidate: a shared `legistar-core` once the package stabilizes).

The third fork (transport) is settled by decision 1: standalone → **stdio**.

## Package layout

```
mcp-server/
  package.json          # name "milwaukee-civic-mcp", bin for npx, type module
  README.md             # tool catalog + run + agent-connection instructions
  src/
    server.js           # McpServer + StdioServerTransport, registers the 9 tools
    legistar.js         # vendored client (getJson, mappers, createLegistarClient) — {client} param
    tools/              # one module per tool: args schema + handler + structured-error wrap
    errors.js           # informationUnavailable(reason) helper → { status, reason }
  scripts/
    mcp-verify.mjs      # live Legistar calls for >=3 tools (verification checklist)
  test/                 # node --test: query builders, mappers, error conversion
```

## Transport + connection

- `@modelcontextprotocol/sdk`: `McpServer` + `StdioServerTransport`.
- Agent (`agent/`) adds an `mcpServers` stdio entry spawning `node mcp-server/src/server.js` (or the `npx` bin). This is separate from the agent's existing in-process `createSdkMcpServer` emoji tool.

## The 9 tools → documented endpoints

Endpoints are from `docs/gavel-legistar-data-reference.md` §"MCP tool surface" (lines 140–148). Base `https://webapi.legistar.com/v1/{client}`, no token for Milwaukee.

| Tool | Endpoint | Source |
|---|---|---|
| `get_upcoming_events` | `/events` `$filter` (date window) + `EventAgendaStatusName eq 'Final'` | reuse `fetchUpcomingFinalEvents` |
| `get_event_agenda` | `/events/{id}/eventitems?AgendaNote=1&Attachments=1` | reuse `fetchEventItems` |
| `get_matter` | `/matters/{id}`; by file_number → `/matters?$filter=MatterFile eq '...'` | reuse `getMatter` + extend |
| `get_sponsors` | `/matters/{id}/sponsors` → `/persons/{id}` (email/phone) | reuse `getMatterSponsors` + `getPerson` |
| `get_matter_history` | `/matters/{id}/histories?AgendaNote=1&MinutesNote=1` | new |
| `get_matter_text` | `/matters/{id}/versions` then `/texts/{textId}` | new |
| `get_attachments` | `/matters/{id}/attachments` (+ `/attachments/{id}/File` for content) | new |
| `get_votes` | `/eventitems/{id}/votes` + `/rollcalls` | new |
| `search_matters` | `/matters?$filter=substringof('q',MatterTitle)` + `MatterIntroDate` date filter, `$top`/`$skip` | new |

`{client}` is a server-level default (`milwaukee`) with optional per-tool override — the vendored client already parameterizes it.

## Error contract (acceptance criterion)

Every tool wraps `getJson` (which throws on non-OK). On failure, empty result, or a known sparse case, the tool returns structured content `{ status: "information_unavailable", reason }` rather than throwing — so the agent degrades gracefully instead of erroring.

Known sparse cases to handle as *available-but-empty*, not error (from the data reference gotchas):
- **`get_votes`**: voice votes have no roll call — `votes`/`rollcalls` empty for many routine items. Fall back to `EventItemPassedFlagName` + `Tally`; only promise per-member votes where a roll call exists.
- **`get_matter_text` / `get_attachments`**: may be absent for terse items — return the empty/unavailable shape, let the caller fall back (title → text → attachment).

## Pagination + politeness

- 1,000-row hard cap per query → page with `$top`/`$skip` in `search_matters` and any list tool.
- Reuse the poller's `User-Agent` string. Hourly-scale caching is the poller's concern; the MCP server is request-scoped (caller-driven), so no cron, but cache lookup tables (`/actions`, `/votetypes`, …) in-process if a tool needs ID→name translation.

## Testing (TDD, maps onto the verification checklist)

- **Unit (RED-first):** OData query builders (`search_matters` filter/encoding, date windows), the vendored mappers, and the structured-error conversion. Pure functions, no network.
- **Live verify** (`scripts/mcp-verify.mjs`): call ≥3 representative tools against live Legistar; paste real responses. Must include `get_sponsors` returning a real alderperson + contact for a known matter.
- **Agent connection:** boot the agent with the `mcpServers` stdio entry and log one real tool invocation through the MCP connection.

## Out of scope (honored)

Parcel/CKAN tools (Phase 3). Knowledge/video tools (Phase 4). `get_member_record` (stretch). No persistence of any kind here — the MCP server is a stateless read wrapper over Legistar.

## Follow-on

- Tech-debt issue: dedupe the vendored Legistar client into a shared `legistar-core` once both poller and MCP server are stable.
- MOO-48 (Bolt assistant threads + tool router) consumes this server; MOO-49 (RTS) sits beside it as the second memory.
