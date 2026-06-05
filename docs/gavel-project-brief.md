# GAVEL — Project Brief
### Slack Agent Builder Challenge · Agent for Good Track
**Builder:** Tarik Moody · **Deadline:** July 13, 2026, 5:00 PM PDT (~5.5 weeks from June 4)
**Methodology:** Bumwad coding — this document is the blueprint; architecture before code.
**Companion docs:** `gavel-personas-features.md` (Denise / Marcos / Rachel) · `gavel-legistar-data-reference.md` (full API surface)
**Status (June 2026):** Curl test #1 ✅ PASSED — Milwaukee Legistar requires no API token.

---

## 1. The Problem & The Logline

### Problem statement (Agent for Good)

**One sentence (Devpost form):**
> Local government decisions that determine whether neighborhoods thrive or get displaced — rezonings, demolitions, land deals, liquor licenses — are made in public but hidden in practice, and the people most affected are structurally the least able to find out before the vote.

**Full statement:**

*"Public" is doing a lot of work in "public meeting."* Every consequential decision about a neighborhood's future is technically published: as a file number, in legalese, on an agenda posted days before a weekday-afternoon meeting, debated somewhere inside a four-hour webcast, with the substance buried in staff-report PDFs. Legal notice is satisfied. Actual notice never happens. The system is open in name and closed in function.

*The access burden falls precisely on the people with the highest stakes.* Participating requires four things: free time during business hours, fluency in planning jargon, English, and someone constantly monitoring the pipeline. Working families, renters, non-English speakers, and neighborhoods with histories of redlining and disinvestment — communities where a single rezoning can mean displacement — have the least of all four. The institutions that used to close this gap are disappearing: local newsrooms have hollowed out, and the remaining watchdogs are volunteer association presidents doing it at 11pm after work. The result is a one-way ratchet: development happens *to* these neighborhoods instead of *with* them.

*This isn't hypothetical — it's what I watch from the dais.* As a Milwaukee City Plan Commissioner, I see the pattern monthly: empty chambers when the item is heard, angry residents after it's decided. The information existed the whole time. The access didn't.

**Track category mapping (lead with this breadth in the submission):**
1. **Economic opportunity** — zoning and land-use decisions are wealth and displacement decisions
2. **Accessibility** — time, language (EN/ES), and plain-language access to government
3. **Nonprofit operations** — neighborhood associations and CDCs are under-resourced nonprofits whose core monitoring labor Gavel automates

**Measurable impact framing (the "explain the impact" requirement):**
- Time-to-awareness: weeks/never → hours before the hearing
- Comprehension: legalese file → plain English and Spanish summary with "why it matters"
- Participation path: information → action via the "How to be heard" footer (when, where, how to register, who represents you)
- Monitoring labor: hours of manual cross-referencing per case (Marcos) → automated watchlists and alerts
- Oversight: procedural burial (walk-ons, consent padding) → flagged automatically

### Logline

> **Gavel doesn't just tell you what city hall is about to vote on — it tells you who's behind it, what they've already filed, and what your neighborhood said last time.**

A Slack agent for neighborhood associations and community organizations. It watches Milwaukee city government (agendas, permits, property records, meeting video), translates legalese into plain English *before* the vote, and fuses official civic memory with the community's own institutional memory in Slack.

**Narrative hook (open the video with this, on camera):**
> "I'm a Milwaukee City Plan Commissioner. I've watched neighborhoods learn about zoning changes *after* the vote. Gavel is the agent I wish every neighborhood association had."

Physical object on camera: a printed 40-page agenda packet. "This is one week of city government."

---

## 2. Hackathon Facts

| Item | Detail |
|---|---|
| Platform | Devpost — slackhack.devpost.com |
| Deadline | July 13, 2026, 5:00 PM PDT |
| Track | **Slack Agent for Good** (social impact: civic participation, accessibility, economic opportunity) |
| Prize target | 1st Agent for Good: $8,000 + Dreamforce 2026 + Slack Dev Certification + features. **Stack play:** Best Technological Implementation ($2,000) |
| Judging criteria | Technological Implementation · Design · Potential Impact · Quality of the Idea |
| Required tech (≥1) | Slack AI capabilities · MCP server integration · Real-Time Search API — **Gavel uses all three** |
| Submission | Track selection · text description (explain impact!) · ~3-min demo video · architecture diagram · sandbox URL with access for slackhack@salesforce.com and testing@devpost.com |
| Key constraint | Judges get hands-on sandbox access — the agent must actually work, with seeded demo data |
| Prize structure analysis | Placement-primary (no virality points). Optimize for judges, not clips. RTS API is the sleeper tech — most of 1,000 registrants will use generic "Slack AI capabilities." Nonprofit/civic ops is the sleeper Agent-for-Good sub-niche vs. crowded education/climate |

---

## 3. The Three-Memory Architecture (diagram centerpiece)

One agent orchestrating three retrieval modalities:

```
                        ┌─────────────────────────┐
                        │   GAVEL (Bolt agent)     │
                        │  assistant threads +     │
                        │  proactive channel alerts│
                        └────┬───────┬───────┬─────┘
                             │       │       │
        ┌────────────────────┘       │       └──────────────────────┐
        ▼                            ▼                              ▼
┌────────────────┐        ┌──────────────────┐          ┌────────────────────┐
│ 1. STRUCTURED   │        │ 2. SEMANTIC       │          │ 3. LIVE COMMUNITY  │
│ CIVIC DATA      │        │ CIVIC MEMORY      │          │ MEMORY             │
│ Milwaukee Civic │        │ Convex vector DB  │          │ Slack RTS API      │
│ MCP server      │        │ • zoning_code ns  │          │ assistant.search.  │
│ (Legistar,      │        │ • transcripts ns  │          │ context — queried  │
│ permits, MPROP, │        │ (indexed: public  │          │ live, NEVER stored │
│ zoning, video)  │        │ record only)      │          │                    │
└────────────────┘        └──────────────────┘          └────────────────────┘
```

**Compliance note (also a selling point — say it in the submission text):** Slack's terms prohibit indexing, copying, or permanently storing Slack messages via the API; the RTS API exists as the sanctioned alternative. Gavel **indexes the public record** (transcripts, zoning code, agendas) and **queries the private record live** (Slack, via RTS). The architecture demonstrates exactly why Slack built RTS the way they did.

---

## 4. Sponsor Tech Map

| Slack tech | How Gavel uses it | Non-obvious angle |
|---|---|---|
| **Real-Time Search API** | `assistant.search.context` pulls the org's own prior discussions when an agenda item resurfaces ("haven't we fought this developer before?") | RTS over *neighborhood association* memory — a corpus Slack would never imagine. Community memory beside official memory |
| **MCP server integration** | Custom **Milwaukee Civic MCP** server (open-source artifact) + optional Slack MCP server tools | An MCP server for city legislation — usable by every civic-tech builder in any of 300+ Legistar municipalities |
| **Slack AI capabilities** | Assistant threads, suggested prompts, Block Kit alert cards, App Home config, status updates | Proactive agent, not a chatbot — the alert fires unprompted |

RTS access requirements (verify week 1): directory-published or internal apps only (internal sandbox app qualifies); user token (xoxp-) via OAuth; minimum scope `search:read.public`, add optional scopes for wider search.

---

## 5. Milwaukee Civic MCP — Tool Surface

**Legistar tools** (webapi.legistar.com/v1/milwaukee, OData — full field reference in `gavel-legistar-data-reference.md`):
- `get_upcoming_events(body?, days)` — meetings in window
- `get_event_agenda(event_id)` — EventItems w/ agenda text, attachments, consent flags
- `get_matter(file_number)` — full matter detail
- `get_matter_history(matter_id)` — actions, committees, dates
- `get_matter_text(matter_id)` — full legal text, versioned
- `get_attachments(matter_id)` — staff reports, zoning maps, site plans (the `/File` endpoint returns actual content → feed to Claude for deep summaries)
- `get_votes(event_item_id)` — per-member roll calls; tally, mover, seconder
- `get_sponsors(matter_id)` — sponsoring alderperson (+ Persons/OfficeRecords for contacts)
- `search_matters(query, date_range)` — keyword search across legislation; also powers watchlists
- `get_member_record(person, topic?)` — vote history per alderperson *(stretch — Rachel)*

**Internal (poller-only, not exposed as MCP):**
- **Agenda-change detector** — diffs `EventAgendaLastPublishedUTC` + item lists per agenda version; flags items added <48h before a meeting or slipped onto consent *(persona-derived: Rachel P3.2, Denise P1.1)*
- **Watchlist sweep** — daily diff of new matters/permits against watched owner/LLC names *(Marcos P2.5)*
- Note: `MatterIndexes` exposes the city's own subject taxonomy — evaluate as the backbone for topic subscriptions before building custom classification.

**Parcel tools** (data.milwaukee.gov CKAN datastore API):
- `lookup_parcel(address)` → TAXKEY, zoning district, owner (MPROP, updated daily)
- `get_permits(address | taxkey, since)` — permit work data (monthly refresh; snapshot into Convex for demo)
- `get_ownership_portfolio(owner_name)` — all parcels held by an owner/LLC (MPROP join)
- `check_zoning(address)` — current district (zoning datasets refresh nightly)
- `get_violations(address)` — DNS/Accela vacant & code cases *(stretch)*

**Knowledge tools:**
- `ask_zoning_code(address, question)` — **parcel-conditioned RAG**: resolve address → district → filter vector search to that district's code sections → answer with section citations
- `search_transcripts(query, filters)` — semantic search over meeting transcripts; every hit returns speaker, quote, agenda item, and a timestamped video deep link

**Video tools:**
- `get_video_moment(event_item_id)` — deep link (tier 1) or clipped MP4 (tier 2)

---

## 6. Data Sources (scouted & verified)

| Need | Source | Access | Freshness | Fallback |
|---|---|---|---|---|
| Agendas, matters, votes | Legistar Web API `/v1/milwaukee` | OData REST; ✅ **confirmed — no API token required** | Live | Scrape published agenda PDFs |
| Property/ownership | MPROP (data.milwaukee.gov) | CKAN datastore API / CSV | Daily | CSV snapshot |
| Permits | Residential & Commercial Permit Work Data | CKAN API / CSV | Monthly | Snapshot into Convex (demo-honest) |
| Zoning districts | Open data portal zoning datasets | CKAN API | Nightly | Snapshot |
| Code violations | Vacant buildings (Accela-sourced) | CKAN | Automated | Cut first |
| Zoning code text | Milwaukee zoning code PDF (MKEdev salvage) | Public | Static | — |
| Meeting video | Granicus / Channel 25 via `EventItemVideo` / `EventItemVideoIndex` | **Curl test #4:** are indexes populated? captions available? | Per meeting | Deep link only |
| Transcripts | Granicus captions (free, check first) → else Deepgram Nova-3 batch | $200 free credit ≈ 433 hrs; ~$1/4-hr meeting; diarization + utterance timestamps | One-shot per meeting | Skip — demo works without |
| Geocoding | Census Geocoder | Free | — | Keyword/committee subs instead of geo |

---

## 7. Personas & Persona-Derived Features

Full detail in `gavel-personas-features.md`. The build serves three users:

- **Denise (58)** — volunteer neighborhood association president; finds out after the vote, can't parse legalese, can't attend weekday meetings, *is* the institutional memory → **Potential Impact**
- **Marcos (34)** — paid CDC organizer, three neighborhoods, bilingual community; manually chases LLCs across records, translates summaries at 11pm → **Agent for Good equity**
- **Rachel (41)** — solo civic journalist; the story is buried in 3.5-hour videos and procedural maneuvers (walk-ons, consent-agenda padding) → **Quality of Idea / Tech Implementation**

### 7.1 Persona-derived features (integrated into this build)

| Feature | Persona / pain | Effort | Placement |
|---|---|---|---|
| **Spanish bilingual alerts** — per-channel language setting; Claude generates EN + ES natively in one card | Marcos P2.2 | ~½ day | Week 1 (prompt parameter + channel setting) |
| **Agenda-change / walk-on detection** — diff agenda versions via `EventAgendaLastPublishedUTC`; flag items added <48h or buried on consent | Rachel P3.2, Denise P1.1 | ~1 day | Week 3 (poller diff) |
| **Owner/developer watchlists** — `/gavel watch "XYZ Holdings LLC"` → alert on any new matter, permit, or filing, citywide | Marcos P2.5 | ~1–2 days | Week 3–4 |
| **"How to be heard" footer** — hearing date/location, public-comment registration, alderperson contact (via OfficeRecords) on every alert | Denise P1.5 | ~hours | Week 1 |
| **Sunday Digest** — one weekly post: "3 items near you this week, 1 needs attention" | Denise P1.6 | ~½ day | Week 4–5 |
| **Escalation ping** — notify when a watched item moves committee → full Council | Denise P1.1 | ~hours | Week 3 (MatterHistory diff) |

Cut in persona review (→ parking lot): Mobilize/RSVP workflows, funder activity exports, cross-meeting analytics (needs corpus backfill), anything homeowner-facing.

### 7.2 Multilingual design (no translation API, no i18n framework)

1. **Language is data, not a feature** — `language` preference per channel (App Home) and per user (overrides in threads); one Convex field.
2. **Generate natively, don't translate** — the summarizer prompt takes target languages; Claude writing Spanish directly explains rather than transliterates. One Block Kit card: EN section, divider, ES section.
3. **Mirror the user in threads** — system-prompt line: *"Respond in the language the user wrote in."* Zero detection code.
4. **Curated civic glossary** — small EN→ES glossary for zoning terms (variance, conditional use, TIF) injected into the prompt; reviewed once by a native speaker (that review is itself a community-engagement line for the submission). Legal source text always stays English, clearly labeled; file numbers/addresses/committee names never translated.
5. **Retrieval stays monolingual** — translate the *query* (ES question → EN retrieval query → answer composed in ES); RTS queries issued in both languages and merged.

Hmong: large Milwaukee community, but model quality is materially weaker than Spanish — **roadmap item with human review**, named honestly in the submission. Demo ships EN/ES.

---

## 8. Vector Database Design (Convex — no new infra)

One index, two namespaces, different chunking:

| Namespace | Chunking | Metadata per chunk |
|---|---|---|
| `zoning_code` | By code section; district/use tables kept intact as units; parent-section breadcrumbs | `district`, `section`, `parent` |
| `transcripts` | Speaker turns, ~30–60s windows with overlap | `meeting`, `date`, `agendaItem`, `speaker`, `startTime`, `matterId`, `addresses` |

**The receipt principle:** every transcript retrieval returns the quote + speaker + one-click timestamped video link. Semantic search over spoken government, where every answer links to primary-source video. This is the Best Technological Implementation pitch.

**Never index Slack messages.** RTS only, queried live.

---

## 9. Video Pipeline

| Tier | Method | Status |
|---|---|---|
| 1. Deep link card | Block Kit thumbnail + "▶ Watch Item 14" → Granicus player at item timestamp | Ships day one |
| 2. Clipped upload | yt-dlp/ffmpeg segment around `EventItemVideoIndex` → `files.uploadV2` → plays natively inline | **Demo hero** — pre-cut and cache before recording |
| 3. Block Kit video block | Embedded player | **Skip** — iframe/unfurl-domain/scope requirements, raw MP4s often fail; tier 2 gives identical payoff |

Transcript pipeline (one-shot script, not infrastructure):
```
Granicus video → ffmpeg audio extract → Deepgram batch (diarize, utterances, smart_format)
→ slice at EventItemVideoIndex boundaries → per-item discussion text → Convex (transcripts ns)
```
Demo scope: **exactly one meeting** — the one containing the hero agenda item.

---

## 10. Agent Memory Decision (mem0)

**Decision: NO mem0 for the hackathon.** Rationale:
- Gavel already has three memory systems; a fourth adds a dependency without a demo beat — memory accumulation is invisible in a 3-minute video.
- Channel preferences (committees, keywords, boundaries) are explicit config — a Convex table covers it with zero new infra.
- Persisting memories derived from Slack conversations skates near the same ToS line the architecture deliberately avoids.
- No judging criterion rewards it that Convex-stored preferences don't already satisfy.

**Lightweight substitute that still demos as "the agent learns":** a `channel_interests` Convex table — Claude periodically summarizes which alert types each channel engages with and adjusts ranking. One sentence in the video ("Gavel learns that this channel cares most about liquor licenses and demolitions"), zero new dependencies.

**Post-hackathon:** mem0 (or similar) becomes worth revisiting if Gavel ships as a multi-tenant product needing long-horizon per-user personalization.

---

## 11. Demo Script (~3 min; wow lands by 0:60; judges may stop at 3:00)

| Beat | Time | On screen |
|---|---|---|
| Hook | 0:00–0:10 | Tarik on camera holding printed agenda packet: "I'm a Milwaukee City Plan Commissioner. This is one week of city government." |
| Unprompted alert | 0:10–0:25 | #sherman-park: Gavel posts Block Kit card — "Item 14, Tuesday's Zoning Committee: rezones 2700 W. Wisconsin from RT4 to commercial. In plain English: …" Buttons: Watch · History · Ask Gavel. **"How to be heard" footer visible** |
| RTS wow | 0:25–0:40 | User: "Didn't we oppose this developer before?" → Gavel surfaces the channel's own 2024 thread (RTS) beside the matter's prior vote record (MCP) |
| Parcel intelligence | 0:40–0:55 | "Who's behind this?" → ownership portfolio (14 parcels), demolition permit filed 3 weeks before the hearing. Quick flash: `/gavel watch` confirms the LLC is now on the watchlist |
| Zoning RAG | 0:55–1:10 | "What could they build if this passes?" → parcel-conditioned answer citing code sections |
| **Equity + procedure** | 1:10–1:25 | Same alert shown in #lindsay-heights — **bilingual EN/ES card** (5 seconds, no narration needed). Voiceover: "Gavel also caught that this item was added to the agenda yesterday afternoon." |
| Video clip | 1:25–1:45 | "What did the alderman say?" → quoted utterance + 90-second clip drops inline. "A 4-hour meeting. Gavel hands you the 90 seconds about your block." |
| Architecture | 1:45–2:15 | Three-memory diagram; RTS/MCP/AI capabilities callouts; "indexes the public record, queries the private record live" |
| Impact close | 2:15–3:00 | "Works in any of 300+ Legistar cities. The Milwaukee Civic MCP server is open source today. Built by a Plan Commissioner, for every neighborhood that finds out too late." |

Never open with a question typed at a bot — the proactive alert is the differentiator. All hero outputs cached before recording.

---

## 12. Build Plan (5.5 weeks)

**Week 0 — curl-before-commit (do before any app code):**
1. ~~`curl ".../v1/milwaukee/events?$top=5"` — token required?~~ ✅ **PASSED — no token**
2. `curl ".../events/{id}/eventitems?AgendaNote=1&Attachments=1"` — is zoning detail actually present? Also dump a matter sample and inspect `MatterEXText1–11` + `MatterIndexes` tag quality
3. `slack create agent` → sandbox → OAuth user-token flow → one successful `assistant.search.context` call
4. One Milwaukee Granicus video page: captions track? `EventItemVideoIndex` populated?
5. 10-min chamber audio sample → Deepgram playground — diarization survives echoey-room acoustics?

**Weeks 1–3 — THE SPINE (non-negotiable):**
- W1: Legistar poller (Fly.io cron) → Claude summarizer (plain English + "why it matters" + address extraction; **bilingual EN/ES output via prompt parameter + civic glossary**) → Block Kit alerts with **"How to be heard" footer** to subscribed channels. Convex subscription state (incl. per-channel `language`). Slash-command config.
- W2: Milwaukee Civic MCP server (Legistar tools first) + Bolt assistant threads + tool router (**mirror-language system prompt**). RTS integration end-to-end.
- W3: Parcel tools (MPROP lookup, permits snapshot, ownership portfolio, check_zoning). **Agenda-change/walk-on detector** (publish-stamp + item diff). **Escalation ping** (MatterHistory diff). **Watchlists** (`/gavel watch` + daily sweep). Sandbox seeding: 2–3 neighborhood channels (one Spanish-preference) with plausible 2024–25 history for the RTS beat.

**Week 4 — KNOWLEDGE LAYER:**
- Zoning code namespace (structure-aware chunking, MKEdev salvage) + `ask_zoning_code` parcel-conditioned retrieval (query-translation path for ES questions).
- Hero meeting: captions-or-Deepgram one-shot → transcripts namespace → `search_transcripts`.
- Video tier 1 (deep links); tier 2 clip for hero item. **Sunday Digest** cron if on schedule.

**Week 5 — POLISH & SHIP:**
- App Home config surface (committees, keywords, language). Suggested prompts. Error states.
- Architecture diagram. Record demo (cached hero outputs). Submission text — **lead with Denise/Marcos/Rachel, then impact, then architecture**.
- Email Slack DevRel/sponsor contacts with the cut the day before submitting (sponsors champion what they see early).
- Buffer: nothing new after July 9.

**Scope-cut order if behind (cut from the bottom):**
violations tool → vote-record compilation → Sunday Digest → watchlists → ownership portfolio → transcript layer → video tier 2 (keep tier 1) → geo-matching (keep keyword/committee subs) → App Home (keep slash commands)
**Protected (cheap + high-impact — cut only in emergency):** bilingual alerts · "How to be heard" footer · agenda-change detection · escalation ping

---

## 13. Real vs. Faked-for-Demo (every demo fakes something — be explicit)

| Real | Faked / cached |
|---|---|
| Legistar API pulls, summaries, MCP server, RTS queries, vector search, Block Kit UI, zoning RAG | Alert "fires" on manual trigger during recording |
| Bilingual EN/ES generation (live Claude output) | Glossary covers core zoning terms only at demo time |
| Agenda-change detection logic (real version diff) | If no genuine walk-on occurs in the recording window, the demo diff runs on a staged draft/final agenda pair — disclose |
| Permit & MPROP data (genuine city data) | Permits = snapshot in Convex (source updates monthly — say so) |
| Transcript of hero meeting (genuinely processed) | Corpus = 1 meeting; pipeline generalizes but isn't backfilled |
| Council footage in clip | Clip pre-cut with ffmpeg, not generated live |
| — | Sandbox neighborhood channels seeded with plausible history; 2–3 hand-drawn boundary polygons |

---

## 14. Risk Log (top 3)

1. **RTS access friction in sandbox** — OAuth user-token flow is fiddly; directory-published/internal-only constraint. *Mitigate:* week-0 test #3. *Fallback:* Slack MCP server's built-in search tools (still sponsor tech #2).
2. **Sparse matter text / unpopulated EX fields** — token risk is ✅ resolved; remaining risk is content quality. *Mitigate:* week-0 test #2 sample dump. *Fallback:* summarize from MatterTexts and attachment PDFs instead of titles.
3. **Video index/caption availability** — `EventItemVideoIndex` may be unpopulated; chamber audio may defeat diarization. *Mitigate:* week-0 tests #4–5. *Fallback:* tier-1 deep links only; transcript layer is already stretch-tagged.

---

## 15. Judging Criteria Mapping

| Criterion | Gavel's answer |
|---|---|
| Technological Implementation | All three sponsor techs; three-memory architecture; parcel-conditioned RAG; transcript receipts; agenda-version diffing; open-source MCP server; ToS-aware data design |
| Design | Proactive Block Kit alerts (not a chat box); bilingual cards; "How to be heard" footer turning information into action; escalating assistant-thread beats; App Home config; clip-in-channel |
| Potential Impact | Civic participation equity — nobody can monitor 4-hour webcasts; **language access (EN/ES) for communities locked out twice**; 300+ Legistar cities + CKAN portals everywhere; open-source Civic MCP for the whole civic-tech community |
| Quality of the Idea | No prior art fuses official civic memory with a community's own Slack memory; **walk-on/consent-burial detection is insider knowledge only a sitting commissioner would build**; persona-grounded (Denise/Marcos/Rachel) |

---

## 16. Red Team (Phase 4)

- **20-minutes-later memory test:** "the Plan Commissioner who put city hall inside Slack" — passes.
- **Laziest competing version:** generic civic Q&A chatbot with web search. Gavel beats it on proactivity, parcel joins, receipts, procedure detection, language equity, and community memory — so the video opens with the unprompted alert.
- **Wow-fail backup:** cached footage of every hero beat.
- **Sponsor champion:** Slack DevRel — RTS showcase + "Slack for communities" story + screenshot-able MCP server.
- **Hard no's (parking lot):** 311, permit-application help, homeowner-facing anything, multi-city ingestion, mem0, Mobilize/RSVP workflows, funder activity exports, silent Hmong support.

---

## 17. Post-Hackathon Roadmap (parking lot)

- Multi-city: parameterize `{Client}` — Madison first; `milwaukeecounty` client is a flag flip
- Backfill transcript corpus; public comment analytics; cross-meeting topic tracking
- Hmong language support with human-reviewed glossary; expand civic glossary with community review
- Mobilize/RSVP workflows; funder activity exports (Marcos's product-tier features)
- Vote-record compilation per alderperson (if not shipped as stretch)
- mem0/long-horizon personalization for multi-tenant product
- Slack Marketplace submission (Organizations-track path for v2)
- Tie-ins: MKEdev, REDLINED lineage; The Intersection launch essay ("I built the watchdog I wish every neighborhood had")
- AfroTech / conference talk material: civic tech + agentic AI + lived governance experience

---

## 18. Stack Summary

TypeScript · Bolt SDK · Slack CLI (`slack create agent`) · Convex (state + vector search) · Anthropic API (Claude Sonnet — summarization + agent loop) · Milwaukee Civic MCP (custom, open source) · Slack RTS API · Fly.io (poller + workers + clip hosting) · Deepgram Nova-3 (batch, diarization) · ffmpeg/yt-dlp · Census Geocoder
