# milwaukee-civic-mcp

A standalone stdio MCP server that wraps the [Milwaukee Legistar](https://legistar.com/) city-legislation API as 9 tools, making it trivially connectable to any MCP-capable AI agent. Built as part of [Gavel](https://github.com/tmoody1973/gavel-slack-agent) — a proactive Slack agent for Milwaukee neighborhood associations — but designed as a reusable, publishable open-source artifact. Any civic-tech builder can point their agent at this server and get live legislation search, sponsor lookup, voting history, and full legal text for free, no API token required.

## Install

```bash
cd mcp-server
npm install
```

## Run

```bash
# Via npm script
npm start

# Directly
node src/server.js

# Via npx (once published)
npx milwaukee-civic-mcp
```

The server idles on stdin/stdout waiting for an MCP client to connect. It prints nothing to stdout unless a client sends a request (stdout is the MCP transport).

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `LEGISTAR_CLIENT` | `milwaukee` | Legistar city slug (e.g. `chicago`, `boston`). Parameterizes every endpoint — set this to target a different city's Legistar instance. |

## Connect to an AI Agent (Claude / any MCP client)

Add a `mcpServers` entry that spawns this server over stdio:

```json
{
  "mcpServers": {
    "milwaukee-civic": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/src/server.js"]
    }
  }
}
```

For Claude Code or the Anthropic SDK with stdio transport, the equivalent TypeScript config:

```ts
mcpServers: {
  'milwaukee-civic': {
    command: 'node',
    args: [new URL('../mcp-server/src/server.js', import.meta.url).pathname],
  },
},
```

## Live Verification

Run the built-in verify script to confirm all three core tools hit live Legistar:

```bash
node scripts/mcp-verify.mjs
```

Expected output: real upcoming-event count, a real agenda item with a `matterId`, and a real alderperson sponsor with email and phone.

## 9-Tool Catalog

Base URL: `https://webapi.legistar.com/v1/{client}` — no auth token required for Milwaukee.

| Tool | Arguments | Returns | Legistar Endpoint |
|---|---|---|---|
| `get_upcoming_events` | _(none)_ | Array of Final-agenda meetings in the next 7 days | `GET /events?$filter=EventDate ge … and EventAgendaStatusName eq 'Final'` |
| `get_event_agenda` | `event_id: number` | Agenda items for a meeting, with attachments and matter links | `GET /events/{id}/eventitems?AgendaNote=1&Attachments=1` |
| `get_matter` | `matter_id: number` | Single legislative file (file number, title, status) | `GET /matters/{id}` |
| `get_sponsors` | `matter_id: number` | Sponsors of a matter with name, email, and phone from the person record | `GET /matters/{id}/sponsors` → `GET /persons/{personId}` |
| `get_matter_history` | `matter_id: number` | Every action taken on a matter (committee votes, referrals, Council action, tally) | `GET /matters/{id}/histories?AgendaNote=1&MinutesNote=1` |
| `get_matter_text` | `matter_id: number` | Latest full legal text of a matter (plain + RTF fallback) | `GET /matters/{id}/versions` then `GET /matters/{id}/texts/{textId}` |
| `get_attachments` | `matter_id: number` | Supporting documents (name + URL) for a matter | `GET /matters/{id}/attachments` |
| `get_votes` | `event_item_id: number` | Per-member roll-call votes for a specific agenda item | `GET /eventitems/{id}/votes` |
| `search_matters` | `query?: string`, `since_date?: string`, `top?: number`, `skip?: number` | Paginated list of matters matching a title substring and/or intro date | `GET /matters?$filter=substringof('q',MatterTitle)&$orderby=MatterIntroDate desc&$top=…&$skip=…` |

## Error Contract

Every tool wraps Legistar HTTP calls in a structured error handler. On any failure, empty result, or known sparse case, the tool returns:

```json
{ "status": "information_unavailable", "reason": "<context>: <error message>" }
```

The agent receives this as valid `structuredContent` and can degrade gracefully (e.g. fall back to the matter title) rather than erroring.

## Known Gotchas (from the Legistar data reference)

**Voice votes return empty votes.** `get_votes` (`/eventitems/{id}/votes`) is empty for any agenda item decided by voice vote or unanimous consent, which is the majority of routine items in Milwaukee. Roll-call data only exists where a recorded vote was taken. Use `EventItemPassedFlagName` (present in agenda items) as a coarse pass/fail indicator.

**Matter titles are terse.** Milwaukee legislative file titles are often bare identifiers (`"File 230045"`). Real substance lives in `get_matter_text` (the full ordinance text) and `get_attachments` (staff reports, resolutions). Build your summarizer fallback chain as: title → text → first attachment.

**1,000-row query cap.** Legistar enforces a hard `$top=1000` cap on every list endpoint. Use `search_matters`'s `top` + `skip` arguments to page through large result sets. The `get_upcoming_events` window is pre-bounded to 7 days, so it stays well under the cap in normal operation.

**`LEGISTAR_CLIENT` for multi-city.** The `client` parameter maps to the URL slug (`/v1/{client}`). Milwaukee uses `milwaukee`; other cities have their own slug (check the Legistar API documentation for your city). Fields present in Milwaukee may be sparse or absent in other cities — probe with the verify script before relying on any field.

**No auth token for Milwaukee.** The Milwaukee Legistar instance is publicly accessible with no API key. Multi-city deployments may require an `ApiKey` query parameter — check your city's Legistar instance documentation.

## License

MIT
