# Gavel — Devpost submission (draft copy)

> Slack Agent Builder Challenge · **Track: Agent for Good**
> Paste these sections into the Devpost fields. Bracketed `[…]` items are placeholders to fill at
> submit time (links/screens). Written against the **actually-built** feature set — anything not yet
> built lives under **What's next**, not "What it does."

---

## Tagline (one line)

**Gavel watches city hall so your neighborhood doesn't have to — proactive, plain-English (and
Spanish), before the vote.**

---

## Inspiration

I'm a Milwaukee City Plan Commissioner. Every week I watch the same thing happen: a rezoning, a
demolition, a license that will reshape a block — decided in a weekday-afternoon committee meeting
that the people who live on that block never heard about until it was over.

Participating in local government quietly requires four things: free time during business hours,
fluency in planning jargon, English, and someone constantly monitoring the pipeline. The families
with the highest stakes — renters, working parents, non-English speakers, neighborhoods with
histories of redlining — have the least of all four. The institutions that used to close that gap
are gone: local newsrooms have hollowed out, and the last line of defense is a volunteer
association president reading a 14-page Legistar file at 11pm after her shift.

Gavel is built for her.

---

## What it does

Gavel is a **proactive** Slack agent — not a chatbot you have to think to ask. It watches Milwaukee
city government and fires an alert into a neighborhood's own Slack *before* the vote, in plain
English and Spanish, and it fuses the official public record with the community's own institutional
memory.

Three real people shaped every feature:

**Denise (58) — volunteer association president.** Finds out about rezonings *after* the committee
votes, can't parse "deviation from §295-505-2-b," can't attend weekday meetings, and *is* her
association's entire memory.
→ Gavel posts a **plain-English Block Kit alert before the hearing** with a *"How to be heard"*
footer — the hearing's date, time, where to register for public comment, and her alderperson's
contact. An **escalation ping** tells her the moment a watched item clears committee and is headed
to the full Common Council — her last window to act.

**Marcos (34) — bilingual CDC organizer across three neighborhoods.** Keeps a cursed spreadsheet of
LLC names because the same developers reappear under new shells, and translates zoning summaries
into Spanish himself at 11pm.
→ `/gavel watch "XYZ Holdings LLC"` and Gavel alerts him whenever that owner surfaces in any **new
matter or building permit citywide** — resolving owner → parcels → permits automatically. Every
alert renders **natively bilingual EN/ES** (generated, not machine-translated), per channel.

**Rachel (41) — solo civic journalist covering city hall for 8,000 readers.** Can't watch every
4-hour committee meeting; her stories live on receipts.
→ Gavel's **walk-on / agenda-change detector** flags items added <48 hours before a meeting or
slipped onto the consent calendar — the procedural moves where accountability goes to die, and
exactly what's hardest to catch by hand.

Ask Gavel a follow-up in the thread and it reaches across **three memories** at once:

1. **Structured civic data** — a custom *Milwaukee Civic MCP server* over Legistar + the city's open
   data (parcels, owners, permits). *"Who's behind this?"* → the owner's full portfolio and a
   demolition permit filed three weeks before the hearing.
2. **Semantic civic memory** — the Milwaukee Zoning Code (Ch. 295) in a Convex vector index.
   *"What could they build if this passes?"* → a parcel-conditioned answer that **cites the actual
   code sections (§295-NNN)**.
3. **Live community memory** — Slack's Real-Time Search API. *"Didn't we oppose this developer
   before?"* → Gavel surfaces the channel's own 2024 thread, in English and Spanish, right beside
   the matter's official record.

The result: official civic memory and a community's own memory, in one answer, in the language the
resident speaks.

---

## How we built it — the three-memory architecture

One agent (Slack Bolt + the Claude Agent SDK, Claude Sonnet 4.6) orchestrating three distinct
retrieval modalities, with a hard compliance rule that shapes the whole design:

> **Gavel indexes the public record and queries the private record live.** Public data (zoning code,
> agendas) is embedded and cached in Convex; the community's private Slack messages are queried live
> through RTS at question time and are **never stored, copied, or indexed.** (We deliberately
> rejected a persistent-memory layer because it would have meant storing Slack content.)

A poller (Fly.io + supercronic) is the spine: every 5 minutes it pulls Legistar events → agenda
items → matters, detects what's genuinely new, has Claude summarize it bilingually, and posts a
Block Kit card to the channels subscribed to that committee or keyword. Sibling crons add the
escalation ping (committee → Council), the daily watchlist sweep (matters + permits), and a weekly
Sunday digest. State lives in Convex (subscriptions, watches, detection ledgers) — civic-record
keys only, never message content.

→ **See `docs/architecture/three-memory-architecture.svg`** for the full diagram (the 1:45 demo
beat).

### Sponsor tech — Gavel uses all three required capabilities

- **★ Custom MCP server integration** — the **Milwaukee Civic MCP server**, an open-source artifact
  in its own right: Legistar tools (`get_matter`, `get_matter_history`, `search_matters`,
  `get_sponsors`, `get_upcoming_events`) + CKAN parcel tools (`lookup_parcel`, `get_permits`,
  `get_ownership_portfolio`, `check_zoning`). Usable by any civic-tech builder in **300+ Legistar
  cities**.
- **★ Real-Time Search API** — `assistant.search.context` over a *neighborhood association's* own
  Slack history (EN + ES queries merged) — community memory beside official memory, a corpus Slack
  would never imagine.
- **★ Slack AI capabilities / platform** — proactive Block Kit alert cards, assistant threads with
  suggested follow-ups, App Home configuration, slash commands. A proactive agent, not a chatbox —
  **the alert fires unprompted.**

---

## Measurable impact

- **Time-to-awareness: weeks-or-never → hours before the hearing.** The alert lands while there's
  still time to act, with the escalation ping as the final-vote heads-up.
- **Language access:** every alert and answer in **English and Spanish**, generated natively — for
  communities locked out of civic life twice (by jargon, then by language).
- **Monitoring labor automated:** the hours Marcos spends cross-referencing LLCs ↔ parcels ↔ permits
  become a `/gavel watch` and a daily sweep.
- **Plain-language access** to a process that hides behind "§295-505-2-b."
- **Scales civic-wide:** any of 300+ Legistar municipalities + open CKAN portals; the Civic MCP
  server is open source today.

This squarely serves the Agent-for-Good pillars: **civic participation, accessibility (time +
language + plain language), and the operations of under-resourced nonprofits** (neighborhood
associations and CDCs) whose core monitoring labor Gavel automates.

---

## What's real vs. staged in the demo (we believe in disclosing this)

| Real | Staged / cached for the recording |
|---|---|
| Legistar API pulls, summaries, the MCP server, RTS queries, Convex vector search, Block Kit UI, the zoning RAG with live citations | The alert "fires" on a manual trigger during recording (the poller is real; we control *when* on camera) |
| Bilingual EN/ES generation (live Claude output) | The civic glossary injected into the prompt covers core zoning terms |
| Watchlist sweep + escalation detection (real logic, verified against live Legistar/CKAN data) | — |
| Permit & MPROP data (genuine city open data) | Permits are a Convex snapshot — the source refreshes monthly (we say so) |
| Sandbox neighborhood channels | Seeded with plausible 2024–25 history so the RTS beat has something to find |

---

## Challenges we ran into

- **ToS-aware data design.** The whole architecture turns on *never* persisting Slack content. That
  ruled out an off-the-shelf memory layer and forced the index-public / query-private-live split —
  which became the project's strongest idea.
- **Real Legistar data is messier than the docs.** Matter titles are terse, the "extra field"
  columns Milwaukee exposes are empty, and there are no geocoded fields anywhere — addresses had to
  be extracted from titles by Claude and resolved via the Census Geocoder.
- **Getting the civic logic *right*, not just running.** Our escalation detector initially fired on
  matters that had *already* been voted on, and on three-year-old stalled recommendations — bugs a
  unit test would never catch. We only found them by running the detector against the live corpus of
  133 real tracked matters. Verifying against reality, not assertions, is baked into how we built.

---

## Accomplishments we're proud of

- A **genuinely proactive** civic agent: it speaks first, in the resident's language, before the
  vote.
- **Insider features only a sitting commissioner would think to build** — walk-on/consent-burial
  detection and the committee→Council escalation ping.
- An **open-source Milwaukee Civic MCP server** that any of 300+ Legistar cities can reuse.
- A compliance story that's a *feature*, not a disclaimer.

---

## What we learned

That the hard part of civic tech isn't the model — it's the data and the trust. The win was
designing *around* the trust constraint (query private data live, never store it) and grounding
every feature in a named person's 11pm problem.

---

## What's next

- **Transcript + video receipts** — `search_transcripts` with quoted speaker + timestamped clip
  (Rachel's "hand me the 90 seconds about my block"). Pipeline designed (Deepgram + ffmpeg);
  corpus backfill is the work. *(Roadmap — not in this submission's demo.)*
- **Permit/license breadth** — liquor licenses + vacant-building (code-violation) alerts, and
  neighborhood/district-targeted permit alerts.
- **Hmong language support** — a large Milwaukee community; model quality lags Spanish today, so it
  ships with human review, named honestly.
- **Vote-record compilation** across a matter's life; multi-city expansion beyond Milwaukee.

---

## Built with

`TypeScript` · `Slack Bolt SDK` · `Slack Real-Time Search API` · `Model Context Protocol (custom
server)` · `Anthropic Claude (Sonnet 4.6)` · `Claude Agent SDK` · `Convex (vector search + state)` ·
`OpenAI embeddings` · `Legistar Web API` · `Milwaukee CKAN open data` · `Census Geocoder` ·
`Fly.io` · `Block Kit`

---

## Links (fill at submit)

- **Demo video (≤3 min):** `[YouTube/Vimeo URL — MOO-62]`
- **Architecture diagram:** `docs/architecture/three-memory-architecture.svg` (attach the PNG)
- **Sandbox workspace URL:** `[Slack sandbox invite/URL]` — access granted to
  `slackhack@salesforce.com` and `testing@devpost.com`
- **Open-source MCP server:** `[repo link / mcp-server path]`
- **Repository:** `[github.com/tmoody1973/gavel-slack-agent]`
