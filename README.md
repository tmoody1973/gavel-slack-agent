# Gavel

> A proactive Slack agent that watches Milwaukee city government and tells your neighborhood what's about to be decided — **before the vote** — in plain English and Spanish.

**Gavel doesn't just tell you what city hall is about to vote on — it tells you who's behind it, what they've already filed, and what your neighborhood said last time.**

> 🏛️ **Slack Agent Builder Challenge** · *Agent for Good* track · submission due **July 13, 2026** · built by Tarik Moody (Milwaukee City Plan Commissioner).
> 🚧 **Status:** active development — Phase 0 (validation) underway. See [Build status](#build-status).

---

## Overview

Local government decisions that determine whether neighborhoods thrive or get displaced — rezonings, demolitions, land deals, liquor licenses — are made in public but hidden in practice: buried in file numbers, legalese, and 4-hour webcasts posted days before a weekday-afternoon meeting. The people with the highest stakes have the least ability to monitor it.

Gavel closes that gap inside Slack. It watches Milwaukee's agendas, permits, property records, and meeting video; translates each item into plain English and Spanish *before* the vote; and fuses the official civic record with a community's own institutional memory.

**Who it's for:** neighborhood associations, bilingual community organizers, and civic journalists — the under-resourced watchdogs who currently do this by hand.

## Architecture — the three-memory model

Gavel orchestrates three retrieval modalities through one agent. The split is also a **Slack-ToS compliance design**: Gavel *indexes the public record* and *queries the private record live*.

```
                    ┌──────────────────────────┐
                    │   GAVEL (Bolt agent)      │
                    │ proactive channel alerts  │
                    │   + assistant threads     │
                    └────┬──────────┬───────┬───┘
        ┌────────────────┘          │       └─────────────────┐
        ▼                           ▼                         ▼
┌────────────────┐      ┌────────────────────┐    ┌──────────────────────┐
│ 1. STRUCTURED  │      │ 2. SEMANTIC         │    │ 3. LIVE COMMUNITY     │
│ CIVIC DATA     │      │ CIVIC MEMORY        │    │ MEMORY                │
│ Milwaukee      │      │ Convex vector DB    │    │ Slack RTS API         │
│ Civic MCP      │      │ (zoning_code +      │    │ assistant.search.     │
│ (Legistar+CKAN)│      │  transcripts ns)    │    │ context — never stored│
└────────────────┘      └────────────────────┘    └──────────────────────┘
   public record           public record only          queried LIVE
```

All three required sponsor technologies are used: **Slack AI capabilities**, a custom **MCP server**, and the **Real-Time Search API**.

## Tech stack

| Layer | Technology |
|-------|------------|
| Language | TypeScript (Node.js) |
| Agent runtime | Slack **Bolt for JavaScript** + Slack CLI (`slack create agent`) |
| Model | Anthropic **Claude Sonnet** via the Claude Agent SDK |
| State + vector search | **Convex** (subscriptions, watchlists, channel prefs; two vector namespaces) |
| Civic data | Custom **Milwaukee Civic MCP** server — wraps Legistar OData API + Milwaukee CKAN datastore |
| Live workspace memory | Slack **Real-Time Search API** (`assistant.search.context`) |
| Hosting | **Fly.io** (poller cron, workers, clip hosting) |
| Transcription | **Deepgram Nova-3** (batch, diarized) |
| Media | ffmpeg / yt-dlp (video clipping) |
| Geocoding | Census Geocoder |

## Repository structure

```
gavel-slack-agent/
├── docs/          # Source of truth — PRD, project brief, Legistar data reference, personas
├── agent/         # The Slack agent (Bolt JS + Claude Agent SDK scaffold)
│   ├── listeners/ #   events / actions / views (the agent surface)
│   ├── agent/     #   Claude Agent SDK reasoning loop
│   ├── scripts/   #   rts-smoke.mjs, rts-diagnose.mjs (RTS verification)
│   └── manifest.json
├── CLAUDE.md      # How this project is built (Linear + superpowers workflow, architecture notes)
└── README.md
```

`docs/` is authoritative — read the relevant doc before implementing. Work is tracked in **Linear** (team Moodyco, project "Gavel", issues MOO-37…63 across 6 phase milestones).

## Quick start

### Prerequisites

- **Node.js 20+** (developed on 26)
- **Slack CLI** (`slack v4.2.0+`) — [install guide](https://docs.slack.dev/tools/slack-cli/)
- A **Slack developer sandbox** (free via the [Slack Developer Program](https://api.slack.com/developer-program))
- An **Anthropic API key** with billing credit ([console.anthropic.com](https://console.anthropic.com))

### Run the agent locally

```bash
git clone https://github.com/tmoody1973/gavel-slack-agent.git
cd gavel-slack-agent/agent

npm install
cp .env.sample .env            # then add your ANTHROPIC_API_KEY

slack login                    # authenticate to your sandbox
slack run                      # installs to the sandbox + starts a socket-mode dev server
```

Open the agent in your sandbox workspace and send it a DM — it replies in-thread.

### Verify Real-Time Search (optional)

After `slack run` installs the app, copy the **User OAuth Token** (`xoxp-`) from *api.slack.com/apps → your app → OAuth & Permissions*, add it to `agent/.env` as `SLACK_USER_TOKEN`, post a message in a public channel, then:

```bash
node scripts/rts-smoke.mjs "neighborhood"   # one assistant.search.context call
```

A `ok: true` response with a matching message confirms RTS access works.

## Environment variables

Set in `agent/.env` (gitignored — never committed):

| Variable | Description | Required |
|----------|-------------|----------|
| `ANTHROPIC_API_KEY` | Claude API key — powers the agent's responses | **Yes** |
| `SLACK_USER_TOKEN` | `xoxp-` user token for the RTS smoke test | For RTS test |
| `SLACK_APP_TOKEN` / `SLACK_BOT_TOKEN` | Only when running without the Slack CLI (`npm start`) | No |
| `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` / `SLACK_SIGNING_SECRET` | OAuth (HTTP) mode (`node app-oauth.js`) | No |

## Build status

Phased build (5.5 weeks). Phase 0 validates the riskiest assumptions before any feature code.

| Phase | Scope | Status |
|-------|-------|--------|
| **0 — Curl-before-commit** | Validate Legistar content, Slack/RTS access, video, transcription | 🟡 In progress (MOO-37 ✅, MOO-38 ✅; video + Deepgram next) |
| 1 — The spine | Legistar poller → Claude summarizer → bilingual Block Kit alerts + "How to be heard" footer | ⬜ Planned |
| 2 — MCP + RTS | Milwaukee Civic MCP server, assistant threads + tool router, RTS integration | ⬜ Planned |
| 3 — Parcel intel | MPROP lookup, ownership portfolios, watchlists, agenda-change / escalation detection | ⬜ Planned |
| 4 — Knowledge layer | Zoning-code RAG, meeting transcripts + video clips | ⬜ Planned |
| 5 — Polish & ship | App Home config, demo video, submission | ⬜ Planned |

**Validated so far:** Milwaukee Legistar requires no API token and carries substantive zoning detail; RTS (`assistant.search.context`) works end-to-end in the sandbox.

## Cost & API notes

- **Anthropic** — usage-based; requires billing credit on the account.
- **Deepgram** — $200 free credit (~433 hrs); the demo transcribes a single meeting.
- **Legistar / Milwaukee CKAN** — free, no token for Milwaukee. Be a polite client (cache lookups, poll hourly, identify your User-Agent).

## License

The agent scaffold is MIT (from [slack-samples](https://github.com/slack-samples)). The Milwaukee Civic MCP server is intended to ship **open-source** for reuse across the 300+ Legistar municipalities.
