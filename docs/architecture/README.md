# Gavel — Three-Memory Architecture (MOO-61)

The required submission deliverable + the 1:45–2:15 demo beat: one Slack agent orchestrating
**three retrieval modalities** over Milwaukee civic data, and the compliance story that makes it
ToS-safe — *index the public record, query the private record live*.

## Files

| File | Use |
|---|---|
| `three-memory-architecture.svg` | **Primary.** Vector — crisp at any resolution; drop into the video and Devpost. |
| `three-memory-architecture.png` | 3200×2080 (2×) raster export, for tools that won't take SVG. |
| `three-memory-architecture.mmd` | Mermaid source — editable structural twin. Paste into <https://mermaid.live> to render/tweak (not validated by a Mermaid renderer here; the SVG is the verified export). |

## The model in one line

**Structured Civic Data (MCP)** · **Semantic Civic Memory (Convex vectors)** · **Live Community
Memory (RTS)** — fused by a Claude-powered agent into one bilingual answer. Public data is indexed
and cached; **private Slack messages are queried live and never stored.**

## No aspirational boxes — every element maps to shipped code

The diagram was drawn *against the build*, not the PRD vision. Verification trail:

| Diagram element | Where it's built |
|---|---|
| Gavel Agent · Claude Sonnet 4.6 · Bolt (Socket Mode) | `agent/app.js`, `agent/agent/agent.js` (model pinned `claude-sonnet-4-6`) |
| Poller crons (`*/5`, `0 */6`, `0 13`, `0 14 Sun`) | `agent/crontab`, `agent/scripts/poll-once.mjs` · `escalation-once.mjs` (MOO-52) · `watch-sweep-once.mjs` (MOO-53) · `digest-once.mjs` (MOO-76) |
| Walk-on / agenda-change detector | `agent/poller/flags.js` (MOO-51) |
| ① **Structured Civic Data — MCP server** | `mcp-server/src/` — `tools.js` (Legistar: `get_matter`, `get_matter_history`, `search_matters`, `get_sponsors`, `get_upcoming_events`, `get_event_agenda`), `parcel-tools.js` (CKAN: `lookup_parcel`, `get_permits`, `get_ownership_portfolio`, `check_zoning`) |
| ② **Semantic Civic Memory — Convex vectors** | `agent/convex/schema.ts` → `zoningChunks` vector index (namespace `zoning_code`); `ask_zoning_code` tool (MOO-55). 116 chunks, OpenAI `text-embedding-3-small`. |
| ③ **Live Community Memory — RTS** | `agent/agent/community-memory/` — `rts-client.js` (`assistant.search.context`), `search.js` (EN+ES merge), `tool.js` (`search_community_memory`) (MOO-49) |
| Convex app state + cache | `agent/convex/schema.ts` → `subscriptions`, `watches`, `watchAlerts`, `matterEscalations`, `detectedAgendaItems`, `councilMembers` |
| Bilingual EN/ES alert cards · Block Kit | `agent/blockkit/`, `agent/alerts/card.js`, glossary in the summarizer prompt (MOO-43) |
| Compliance line (index public / query private live) | The central design claim — see root `CLAUDE.md` "the hard compliance rule that shapes the architecture"; enforced by RTS never persisting Slack content. |

**Deliberately shown as roadmap, not built:** the `transcripts` vector namespace and the video/
audio tier (Deepgram, ffmpeg/yt-dlp) — Phase 4, no code in the repo yet, so they're a footnote on
memory ②, not a box.

## Sponsor-tech callouts (challenge required techs)

- ★ **Custom MCP server** — the Milwaukee Civic MCP (memory ①), a shippable open-source artifact.
- ★ **Slack Real-Time Search API** — live community memory (memory ③).
- ★ **Slack Platform / Slack AI** — Bolt agent, Block Kit, App Home, Assistant threads (top band).

## Editing / re-exporting

- **Edit the SVG** directly (plain XML; styles in the `<style>` block) — the source of truth.
- **Re-export the PNG:** open the SVG in any browser at the target width and screenshot, or
  `rsvg-convert -w 3200 three-memory-architecture.svg -o three-memory-architecture.png`.
- **Mermaid:** paste `.mmd` into the Devpost editor or <https://mermaid.live> to regenerate.

## Verification (against reality)

- ✅ Reviewed box-by-box against shipped code (table above) — every solid box has a code home.
- ✅ Rendered at 1600px and 3200px (2×) in a headless browser; text legible, no clipping, the
  green/blue public-vs-private coding reads at a glance.
