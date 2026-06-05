# GAVEL — Slack Agent for Civic Transparency

### TL;DR

Local government decisions that determine whether neighborhoods thrive or get displaced — rezonings, demolitions, land deals, liquor licenses — are made in public but hidden in practice. Gavel is a proactive Slack agent that watches Milwaukee city government, translates legalese into plain English and Spanish before the vote, and fuses official civic records with the community's own institutional memory in Slack. It serves neighborhood associations, bilingual community organizers, and civic journalists — the people structurally least able to monitor government on their own.

Logline: Gavel doesn't just tell you what city hall is about to vote on — it tells you who's behind it, what they've already filed, and what your neighborhood said last time.

---

## Goals

### Business Goals

* Win the Slack Agent for Good track (1st place: $8,000, Dreamforce 2026, Slack Dev Certification) and stack Best Technological Implementation ($2,000)
* Ship an open-source Milwaukee Civic MCP server usable by civic-tech builders across 300+ Legistar municipalities
* Demonstrate all three required sponsor technologies (Slack AI capabilities, MCP server integration, Real-Time Search API) in a single coherent product
* Reduce time-to-awareness for consequential city decisions from weeks/never to hours before the hearing
* Establish Gavel as a replicable model for civic transparency tools built on Slack

### User Goals

* Receive proactive, plain-language (EN/ES) alerts on government actions that affect the user's neighborhood, before the vote happens
* Eliminate manual monitoring labor: no more cross-referencing agendas, permits, property records, and meeting videos
* Access actionable participation paths (when, where, how to register, who represents you) embedded in every alert
* Surface community memory alongside official records ("didn't we fight this developer before?")
* Track specific owners, LLCs, or topics across all city filings automatically via watchlists

### Non-Goals

* Homeowner-facing features or individual resident targeting — Gavel serves organizations
* Multi-city ingestion or parameterization beyond Milwaukee for the hackathon build
* Direct permit-application help or 311-like services
* Long-horizon per-user personalization via mem0 (deferred to post-hackathon)
* Mobilize/RSVP workflows, funder activity exports, cross-meeting analytics requiring corpus backfill
* Hmong language support (named honestly as a roadmap item; demo ships EN/ES only)

---

## User Stories

### Denise (58) — Volunteer Neighborhood Association President

* As Denise, I want to receive a plain-language alert in my neighborhood Slack channel when a rezoning, demolition, or liquor license affects my area, so that I learn about it before the vote instead of after.
* As Denise, I want every alert to include a "How to be heard" section with the hearing date, location, public comment registration link, and my alderperson's contact info, so I can act on information without researching separately.
* As Denise, I want a Sunday Digest summarizing what meetings are happening next week and which items need attention, so I can plan my week around city business.
* As Denise, I want to be notified when a watched item moves from committee to full Council, so I don't miss the final vote after tracking it in subcommittee.
* As Denise, I want to ask Gavel about a developer's history and have it pull both city records and our channel's past discussions, so our institutional memory doesn't live only in my head.

### Marcos (34) — Paid CDC Organizer, Three Neighborhoods, Bilingual Community

* As Marcos, I want alerts generated natively in both English and Spanish on a single Block Kit card, so I can post them directly to our Spanish-preference channels without translating manually at 11pm.
* As Marcos, I want to run `/gavel watch "XYZ Holdings LLC"` and get notified whenever that entity appears in any new matter, permit, or filing citywide, so I stop manually chasing LLCs across city websites.
* As Marcos, I want to see an owner's full portfolio (all parcels held, recent permits, code violations) when their name appears on an agenda item, so I can brief my community on the full picture.
* As Marcos, I want to ask a zoning question in Spanish and get an answer in Spanish that cites specific code sections relevant to the parcel in question.

### Rachel (41) — Solo Civic Journalist

* As Rachel, I want Gavel to flag items added to an agenda less than 48 hours before a meeting or buried on the consent calendar, so I can detect procedural maneuvers that hide controversial items.
* As Rachel, I want to search meeting transcripts semantically and get back the speaker name, exact quote, agenda item, and a timestamped video deep link, so I can verify and cite primary sources instantly.
* As Rachel, I want to request a 90-second video clip of the debate on a specific agenda item and have it drop inline in Slack, so I don't have to scrub through 4-hour webcasts.
* As Rachel, I want to query both the official record and the community's Slack history in one question, so I can see what the city said alongside what the neighborhood said.

---

## Functional Requirements

### Alerting Engine (Priority: P0 — Week 1)

* Proactive Block Kit alerts: Legistar poller detects new agenda items, Claude generates plain-English summaries with "why it matters" and extracted addresses, posted to subscribed channels unprompted
* Bilingual EN/ES output: per-channel `language` setting; Claude generates both languages natively in one card (EN section, divider, ES section) using a curated civic glossary injected into the prompt
* "How to be heard" footer on every alert: hearing date, location, public-comment registration, alderperson name and contact (sourced from Legistar OfficeRecords)
* Escalation ping: notify when a watched matter moves committee to full Council (detected via MatterHistory diff)

### Milwaukee Civic MCP Server (Priority: P0 — Week 2)

Legistar tools (endpoint: `webapi.legistar.com/v1/milwaukee`, OData REST, no token required):

* `get_upcoming_events(body?, days)` — meetings in a configurable time window
* `get_event_agenda(event_id)` — EventItems with agenda text, attachments, consent flags
* `get_matter(file_number)` — full matter detail including MatterEXText1-11 extended fields
* `get_matter_history(matter_id)` — actions, committees, dates
* `get_matter_text(matter_id)` — full legal text, versioned
* `get_attachments(matter_id)` — staff reports, zoning maps, site plans; `/File` endpoint returns content for Claude deep summaries
* `get_votes(event_item_id)` — per-member roll calls; tally, mover, seconder
* `get_sponsors(matter_id)` — sponsoring alderperson plus Persons/OfficeRecords for contacts
* `search_matters(query, date_range)` — keyword search across legislation; also powers watchlist sweeps
* `get_member_record(person, topic?)` — vote history per alderperson (stretch — Rachel)

Parcel tools (endpoint: `data.milwaukee.gov` CKAN datastore API):

* `lookup_parcel(address)` — returns TAXKEY, zoning district, owner from MPROP (updated daily)
* `get_permits(address | taxkey, since)` — permit work data (monthly refresh; snapshot into Convex for demo)
* `get_ownership_portfolio(owner_name)` — all parcels held by an owner/LLC via MPROP join
* `check_zoning(address)` — current zoning district (nightly refresh)
* `get_violations(address)` — DNS/Accela vacant and code cases (stretch, first to cut)

Knowledge tools:

* `ask_zoning_code(address, question)` — parcel-conditioned RAG: resolve address to district, filter vector search to that district's code sections, answer with section citations. For Spanish queries: translate query to EN for retrieval, compose answer in ES.
* `search_transcripts(query, filters)` — semantic search over meeting transcripts; every hit returns speaker, quote, agenda item, and timestamped video deep link

Video tools:

* `get_video_moment(event_item_id)` — deep link (tier 1) or cached clipped MP4 (tier 2)

Internal poller-only functions (not exposed as MCP tools):

* Agenda-change detector: diffs `EventAgendaLastPublishedUTC` plus item lists per agenda version; flags items added less than 48 hours before a meeting or slipped onto consent
* Watchlist sweep: daily diff of new matters/permits against watched owner/LLC names
* Note: `MatterIndexes` exposes the city's own subject taxonomy — evaluate as backbone for topic subscriptions before building custom classification

### Slack Agent Features (Priority: P0 — Weeks 1-2)

* Bolt SDK agent with assistant threads and tool router
* Suggested prompts for common queries ("Who owns this property?", "What's on the agenda this week?", "What could they build here?")
* App Home config surface: committees, keywords, language preference, boundary selection
* Slash commands: `/gavel watch`, `/gavel unwatch`, `/gavel digest`, `/gavel status`
* Mirror-language system prompt: "Respond in the language the user wrote in." — zero detection code

### Real-Time Search API Integration (Priority: P0 — Week 2)

* `assistant.search.context` queries the workspace's own Slack history when an agenda item resurfaces
* Queries issued in both EN and ES, results merged
* Messages are never indexed, copied, or stored — queried live per Slack ToS
* Fallback: Slack MCP server's built-in search tools if OAuth/RTS access is blocked

### Watchlists and Monitoring (Priority: P1 — Week 3)

* `/gavel watch "XYZ Holdings LLC"` — stores entity in Convex, daily sweep alerts on new matches
* Agenda-change and walk-on detection via publish-timestamp diffs
* Escalation pings when MatterHistory shows committee-to-Council movement

### Knowledge Layer (Priority: P1 — Week 4)

* Zoning code vector namespace: structure-aware chunking by code section, district/use tables kept intact, parent-section breadcrumbs
* Transcript vector namespace: speaker turns in 30-60 second windows with overlap; metadata includes meeting, date, agendaItem, speaker, startTime, matterId, addresses
* The receipt principle: every transcript retrieval returns the quote, speaker, and one-click timestamped video link

### Sunday Digest (Priority: P2 — Week 4-5)

* Weekly cron: one post per subscribed channel summarizing the coming week's relevant meetings and items requiring attention

### Video Pipeline (Priority: P2 — Week 4)

* Tier 1 (ships day one): Block Kit thumbnail + "Watch Item 14" link to Granicus player at item timestamp
* Tier 2 (demo hero): yt-dlp/ffmpeg segment around `EventItemVideoIndex` timestamps, uploaded via `files.uploadV2`, plays natively inline in Slack
* Tier 3 (skip): Block Kit video block — iframe/unfurl-domain/scope requirements make it impractical; tier 2 gives identical payoff

Transcript pipeline (one-shot script, not infrastructure):

```
Granicus video → ffmpeg audio extract → Deepgram batch (diarize, utterances, smart_format)
→ slice at EventItemVideoIndex boundaries → per-item discussion text → Convex (transcripts ns)
```

Demo scope: exactly one meeting — the one containing the hero agenda item.

---

## User Experience

### Entry Point and First-Time User Experience

* Workspace admin installs Gavel via Slack CLI (`slack create agent`) and authorizes OAuth scopes
* App Home surfaces on first open: configuration for committee subscriptions, keywords of interest, channel language preference (EN or ES), and optional boundary selection
* Gavel posts a welcome message to configured channels explaining what it does and showing a sample alert card
* Suggested prompts appear in assistant threads to guide first interactions

### Core Experience

Step 1: Proactive alert fires in channel (no user action required)

* Legistar poller detects a new agenda item relevant to the channel's subscriptions
* Claude generates a plain-language summary with "why it matters," extracted addresses, and if configured, parallel EN/ES sections
* Block Kit card posts to the channel with action buttons: Watch, History, Ask Gavel
* "How to be heard" footer shows hearing date/time, location, comment registration, alderperson contact
* If the item was added to the agenda less than 48 hours before the meeting, a warning flag appears on the card

Step 2: User requests context ("Didn't we oppose this developer before?")

* Gavel queries RTS API for the channel's own prior discussions about the developer or address (live, not stored)
* Simultaneously queries MCP server for the matter's prior vote record, committee history, and sponsor information
* Results presented side-by-side: "Your channel discussed this in March 2024" alongside "This matter was heard by Zoning Committee on 2024-03-12, vote 4-1"

Step 3: User asks for parcel intelligence ("Who's behind this?")

* Gavel calls `lookup_parcel` for the address, then `get_ownership_portfolio` for the owner
* Returns: owner/LLC name, full portfolio (e.g., 14 parcels), recent permits filed, and any code violations
* Quick-action: "Add to watchlist?" — user confirms with one click

Step 4: User asks a zoning question ("What could they build if this passes?")

* Gavel resolves the address to its zoning district, queries the zoning code vector namespace filtered to that district, and returns an answer citing specific code sections
* If the user asks in Spanish, the query is translated to English for retrieval, and the answer is composed in Spanish

Step 5: User requests video evidence ("What did the alderman say?")

* Gavel searches the transcript namespace, returns the speaker quote with timestamp
* Tier 1: deep link to Granicus player at that timestamp
* Tier 2: 90-second clip drops inline in Slack via files.uploadV2

Step 6: Ongoing automation

* Watchlist alerts fire whenever a watched entity appears in new city filings
* Escalation pings notify when tracked items advance through the legislative process
* Sunday Digest summarizes the coming week's relevant items

### Advanced Features and Edge Cases

* Bilingual output: language is a per-channel and per-user setting stored in Convex; Claude generates natively rather than translating; curated EN-to-ES civic glossary covers core zoning terms (variance, conditional use, TIF); legal source text stays English and is clearly labeled; file numbers, addresses, and committee names are never translated
* Thread language mirroring: system prompt instructs Claude to respond in the language the user wrote in
* RTS query language: queries issued in both EN and ES, results merged and deduplicated
* Error states: if Legistar data is sparse or an API call fails, the card states "information unavailable" with fallback links to source PDFs
* Slack ToS compliance: Gavel indexes the public record (transcripts, zoning code, agendas) and queries the private record live (Slack, via RTS) — never indexes, copies, or stores Slack messages

### UI/UX Highlights

* Proactive alerts, not a chatbot: the agent fires unprompted. The demo never opens with a question typed at a bot.
* Block Kit cards designed for mobile-first Slack usage with accessible color contrast
* All legal source terms and file numbers clearly labeled in both output languages
* Suggested prompts in assistant threads reduce friction for non-technical users
* App Home provides a single surface for all configuration without slash-command memorization

---

## Narrative

It is 9:47 PM on a Tuesday in Sherman Park. Denise has just gotten home from her shift. She checks her neighborhood association's Slack channel and sees a card Gavel posted three hours ago: Item 14 on tomorrow's Zoning Committee agenda would rezone a parcel at 2700 W. Wisconsin Avenue from RT4 residential to commercial. In plain English, the card explains that this would allow the current residential lot to be developed as retail or office space — and that the applicant filed a demolition permit for the existing duplex three weeks ago. The footer tells Denise the hearing is at 1:30 PM tomorrow, gives her the registration link for public comment, and shows her alderperson's phone number and email.

Denise types: "Didn't we fight this developer before?" Gavel searches the channel's history via the Real-Time Search API and surfaces a thread from March 2024 where members discussed the same LLC's previous proposal two blocks away. Alongside it, Gavel pulls the official record: that proposal was heard by the same committee, passed 4-1, and the lone dissent came from the district's own alderperson.

Three miles south, in the Lindsay Heights CDC channel, the same alert appeared in Spanish and English. Marcos sees it, clicks "Watch," and the LLC is now on his watchlist across all three neighborhoods he organizes.

The information existed the whole time. Now the access does too.

---

## Success Metrics

### User-Centric Metrics

* Time-to-awareness: measure elapsed time from agenda publication to alert delivery in Slack; target under 20 minutes
* Alert engagement rate: percentage of alerts that receive at least one button click or thread reply
* Watchlist adoption: number of entities added to watchlists per channel per month
* Bilingual usage: percentage of channels configured for ES output; interaction rate on ES cards

### Business Metrics

* Hackathon placement: 1st Agent for Good track and Best Technological Implementation
* Open-source adoption: GitHub stars and forks of the Milwaukee Civic MCP server within 3 months
* Workspace expansion: number of neighborhood organizations onboarded in Milwaukee within 6 months post-launch

### Technical Metrics

* End-to-end alert latency (agenda posted to alert in Slack): target under 20 minutes
* MCP server API success rate: target 99%+ for Legistar and CKAN calls
* Agent uptime during demo and sandbox evaluation: 99.5%+
* Vector search relevance: manual evaluation of top-3 results for 20 test queries across zoning code and transcript namespaces

### Tracking Plan

* Alert lifecycle events: alert_generated, alert_posted, alert_button_clicked (watch / history / ask), alert_thread_opened
* Search events: rts_query_issued, mcp_query_issued, vector_search_issued, search_results_returned
* Watchlist events: watchlist_entity_added, watchlist_entity_removed, watchlist_alert_triggered
* Configuration events: language_changed, committee_subscribed, keyword_added, boundary_set
* Digest events: digest_generated, digest_posted, digest_link_clicked
* Error events: api_call_failed (with source), summary_generation_failed, rts_access_denied

---

## Technical Considerations

### Architecture: Three-Memory Model

Gavel orchestrates three retrieval modalities through a single agent:

1. Structured Civic Data (Milwaukee Civic MCP server) — Legistar legislation, MPROP parcels, permits, zoning. Authoritative, API-sourced, real-time.
2. Semantic Civic Memory (Convex vector DB) — zoning code text and meeting transcripts. Indexed from public records only. Two namespaces with distinct chunking strategies.
3. Live Community Memory (Slack RTS API) — `assistant.search.context` queries the workspace's own discussion history. Queried live, never stored. This is the architecture's compliance centerpiece.

### Technical Needs

* TypeScript throughout
* Bolt SDK with Slack CLI (`slack create agent`) for the agent runtime
* Convex: application state (subscriptions, watchlists, channel preferences including `language` field), vector search (two namespaces: `zoning_code`, `transcripts`), cached data snapshots (permits)
* Anthropic API (Claude Sonnet): summarization, agent reasoning loop, bilingual generation, tool routing
* Milwaukee Civic MCP server: custom, open-source, TypeScript; wraps Legistar OData API and CKAN datastore API
* Fly.io: poller cron jobs (agenda monitoring, watchlist sweeps), worker processes, clip hosting
* Deepgram Nova-3: batch transcription with diarization and utterance timestamps ($200 free credit, approximately 433 hours)
* ffmpeg/yt-dlp: video download and segment extraction
* Census Geocoder: address-to-coordinate resolution for geo-matching (fallback: keyword/committee subscriptions)

### Vector Database Schema (Convex)

One index, two namespaces:

| Namespace | Chunking Strategy | Metadata per Chunk |
| --- | --- | --- |
| zoning_code | By code section; district/use tables kept intact as units; parent-section breadcrumbs attached | district, section, parent |
| transcripts | Speaker turns in 30-60 second windows with overlap | meeting, date, agendaItem, speaker, startTime, matterId, addresses |

### Integration Points

* Legistar Web API (`webapi.legistar.com/v1/milwaukee`): OData REST, no token required (confirmed)
* CKAN datastore API (`data.milwaukee.gov`): MPROP, permits, zoning datasets
* Slack RTS API: OAuth user-token (xoxp-) via OAuth; minimum scope `search:read.public`
* Slack Bolt SDK: assistant threads, Block Kit, App Home, slash commands
* Granicus / Channel 25: meeting video via `EventItemVideo` / `EventItemVideoIndex`
* Deepgram API: batch audio transcription

### Data Sources

| Need | Source | Access | Freshness | Fallback |
| --- | --- | --- | --- | --- |
| Agendas, matters, votes | Legistar Web API /v1/milwaukee | OData REST; confirmed no token | Live | Scrape published agenda PDFs |
| Property/ownership | MPROP (data.milwaukee.gov) | CKAN datastore API / CSV | Daily | CSV snapshot |
| Permits | Residential and Commercial Permit Work Data | CKAN API / CSV | Monthly | Snapshot into Convex (demo-honest) |
| Zoning districts | Open data portal zoning datasets | CKAN API | Nightly | Snapshot |
| Code violations | Vacant buildings (Accela-sourced) | CKAN | Automated | Cut first |
| Zoning code text | Milwaukee zoning code PDF (MKEdev salvage) | Public | Static | — |
| Meeting video | Granicus / Channel 25 via EventItemVideo / EventItemVideoIndex | Needs curl test: indexes populated? captions available? | Per meeting | Deep link only |
| Transcripts | Granicus captions (check first) or Deepgram Nova-3 batch | $200 free credit; \~$1/4-hr meeting; diarization + utterance timestamps | One-shot per meeting | Skip — demo works without |
| Geocoding | Census Geocoder | Free | — | Keyword/committee subs instead of geo |

### Data Storage and Privacy

* Official public records (agendas, legislation text, transcripts, zoning code) are indexed and stored in Convex
* Slack messages are never indexed, copied, or permanently stored — queried live via RTS API only
* User and channel preferences stored in Convex with minimal PII (channel ID, language, subscription lists)
* Permit data cached as snapshots in Convex with source refresh date clearly disclosed

### Scalability and Performance

* Demo scope: 2-3 neighborhood channels, one city (Milwaukee)
* Architecture parameterized for multi-city expansion: `{Client}` variable in MCP server (Madison first; `milwaukeecounty` is a flag flip)
* Poller designed for 5-minute intervals; alert generation target under 20 minutes end-to-end
* Convex handles vector search scaling; no additional infrastructure needed

### Potential Challenges

1. RTS access friction in sandbox: OAuth user-token flow is fiddly; directory-published/internal-only constraint. Mitigation: Week 0 test. Fallback: Slack MCP server built-in search tools.
2. Sparse matter text / unpopulated extended fields: content quality varies. Mitigation: Week 0 sample dump of MatterEXText1-11 and MatterIndexes. Fallback: summarize from MatterTexts and attachment PDFs.
3. Video index/caption availability: `EventItemVideoIndex` may be unpopulated; chamber acoustics may defeat diarization. Mitigation: Week 0 tests. Fallback: tier-1 deep links only; transcript layer is stretch-tagged.

---

## Agent Memory Decision

No mem0 for the hackathon. Rationale:

* Gavel already has three memory systems; a fourth adds a dependency without a demo beat — memory accumulation is invisible in a 3-minute video
* Channel preferences (committees, keywords, boundaries) are explicit config covered by a Convex table with zero new infra
* Persisting memories derived from Slack conversations skates near the same ToS line the architecture deliberately avoids

Lightweight substitute: a `channel_interests` Convex table where Claude periodically summarizes which alert types each channel engages with and adjusts ranking. One sentence in the video ("Gavel learns that this channel cares most about liquor licenses and demolitions"), zero new dependencies.

---

## Multilingual Design Rules

1. Language is data, not a feature: `language` preference per channel (App Home) and per user (thread override); one Convex field
2. Generate natively, don't translate: the summarizer prompt takes target languages; Claude writes Spanish directly. One Block Kit card: EN section, divider, ES section
3. Mirror the user in threads: system prompt line "Respond in the language the user wrote in." Zero detection code
4. Curated civic glossary: small EN-to-ES glossary for zoning terms (variance, conditional use, TIF) injected into the prompt; reviewed once by a native speaker. Legal source text always stays English, clearly labeled; file numbers/addresses/committee names never translated
5. Retrieval stays monolingual: translate the query (ES question to EN retrieval query, answer composed in ES); RTS queries issued in both languages and merged

---

## Real vs. Cached for Demo

| Real | Cached or Staged |
| --- | --- |
| Legistar API pulls, summaries, MCP server, RTS queries, vector search, Block Kit UI, zoning RAG | Alert "fires" on manual trigger during recording |
| Bilingual EN/ES generation (live Claude output) | Glossary covers core zoning terms only at demo time |
| Agenda-change detection logic (real version diff) | If no genuine walk-on occurs in the recording window, the demo diff runs on a staged draft/final agenda pair — disclosed |
| Permit and MPROP data (genuine city data) | Permits are a snapshot in Convex (source updates monthly — stated) |
| Transcript of hero meeting (genuinely processed) | Corpus is 1 meeting; pipeline generalizes but isn't backfilled |
| Council footage in clip | Clip pre-cut with ffmpeg, not generated live |
| — | Sandbox neighborhood channels seeded with plausible history; 2-3 hand-drawn boundary polygons |

---

## Demo Script (approximately 3 minutes)

| Beat | Time | On Screen |
| --- | --- | --- |
| Hook | 0:00-0:10 | Tarik on camera holding printed agenda packet: "I'm a Milwaukee City Plan Commissioner. This is one week of city government." |
| Unprompted alert | 0:10-0:25 | #sherman-park: Gavel posts Block Kit card — "Item 14, Tuesday's Zoning Committee: rezones 2700 W. Wisconsin from RT4 to commercial. In plain English: ..." Buttons: Watch, History, Ask Gavel. "How to be heard" footer visible. |
| RTS wow | 0:25-0:40 | User: "Didn't we oppose this developer before?" Gavel surfaces the channel's own 2024 thread (RTS) beside the matter's prior vote record (MCP). |
| Parcel intelligence | 0:40-0:55 | "Who's behind this?" Ownership portfolio (14 parcels), demolition permit filed 3 weeks before the hearing. Quick flash: /gavel watch confirms the LLC is now on the watchlist. |
| Zoning RAG | 0:55-1:10 | "What could they build if this passes?" Parcel-conditioned answer citing code sections. |
| Equity and procedure | 1:10-1:25 | Same alert shown in #lindsay-heights — bilingual EN/ES card (5 seconds, no narration needed). Voiceover: "Gavel also caught that this item was added to the agenda yesterday afternoon." |
| Video clip | 1:25-1:45 | "What did the alderman say?" Quoted utterance plus 90-second clip drops inline. "A 4-hour meeting. Gavel hands you the 90 seconds about your block." |
| Architecture | 1:45-2:15 | Three-memory diagram; RTS/MCP/AI capabilities callouts; "indexes the public record, queries the private record live." |
| Impact close | 2:15-3:00 | "Works in any of 300+ Legistar cities. The Milwaukee Civic MCP server is open source today. Built by a Plan Commissioner, for every neighborhood that finds out too late." |

---

## Milestones and Sequencing

### Project Estimate

Medium-Large: 5.5 weeks (deadline July 13, 2026, 5:00 PM PDT). Nothing new after July 9.

### Team Size and Composition

Solo builder (Tarik) with one occasional contributor:

* Tarik: product, engineering, design, demo, submission
* Native Spanish speaker: one-time civic glossary review (community engagement line for submission)

### Suggested Phases

Phase 0: Curl-Before-Commit Validation (2 days)

* Key Deliverables:
  * Legistar token test: PASSED (no token required)
  * Legistar content quality: dump EventItems with AgendaNote=1 and Attachments=1; inspect MatterEXText1-11 and MatterIndexes tag quality
  * Slack agent scaffold: `slack create agent`, sandbox, OAuth user-token flow, one successful `assistant.search.context` call
  * Granicus video check: captions track available? EventItemVideoIndex populated?
  * Deepgram acoustic test: 10-min chamber audio sample through playground — diarization survives echoey room?
* Dependencies: None

Phase 1: The Spine — Alerting and Agent Core (Week 1)

* Key Deliverables:
  * Legistar poller on Fly.io cron
  * Claude summarizer: plain English + "why it matters" + address extraction; bilingual EN/ES via prompt parameter and civic glossary
  * Block Kit alerts with "How to be heard" footer to subscribed channels
  * Convex subscription state including per-channel `language` field
  * Slash-command config (`/gavel watch`, `/gavel status`)
* Dependencies: Phase 0 validation complete

Phase 2: MCP Server and RTS Integration (Week 2)

* Key Deliverables:
  * Milwaukee Civic MCP server (Legistar tools first)
  * Bolt assistant threads with tool router and mirror-language system prompt
  * RTS integration end-to-end
* Dependencies: Phase 1 alerts working

Phase 3: Parcel Intelligence and Monitoring (Week 3)

* Key Deliverables:
  * Parcel tools: MPROP lookup, permits snapshot, ownership portfolio, check_zoning
  * Agenda-change/walk-on detector (publish-stamp and item diff)
  * Escalation ping (MatterHistory diff)
  * Watchlists: `/gavel watch` plus daily sweep
  * Sandbox seeding: 2-3 neighborhood channels (one Spanish-preference) with plausible 2024-25 history for the RTS beat
* Dependencies: MCP server operational

Phase 4: Knowledge Layer (Week 4)

* Key Deliverables:
  * Zoning code namespace: structure-aware chunking, MKEdev salvage source
  * `ask_zoning_code` parcel-conditioned retrieval with query-translation path for ES
  * Hero meeting: captions or Deepgram one-shot into transcripts namespace plus `search_transcripts`
  * Video tier 1 (deep links); tier 2 clip for hero item
  * Sunday Digest cron (if on schedule)
* Dependencies: Convex vector DB operational from Phase 2

Phase 5: Polish and Ship (Week 5, complete by July 9)

* Key Deliverables:
  * App Home config surface (committees, keywords, language)
  * Suggested prompts and error states
  * Architecture diagram
  * Record demo video (all hero outputs cached before recording)
  * Submission text: lead with Denise/Marcos/Rachel, then impact, then architecture
  * Email Slack DevRel/sponsor contacts with the cut the day before submitting
* Dependencies: All prior phases

### Scope-Cut Priority Order (cut from the bottom if behind)

1. Violations tool (cut first)
2. Vote-record compilation per alderperson
3. Sunday Digest
4. Watchlists
5. Ownership portfolio
6. Transcript layer
7. Video tier 2 (keep tier 1 deep links)
8. Geo-matching (keep keyword/committee subscriptions)
9. App Home (keep slash commands)

Protected (cheap plus high impact — cut only in emergency): bilingual alerts, "How to be heard" footer, agenda-change detection, escalation ping.

---

## Sponsor Tech Mapping

| Slack Technology | How Gavel Uses It | Non-Obvious Angle |
| --- | --- | --- |
| Real-Time Search API | `assistant.search.context` pulls the org's own prior discussions when an agenda item resurfaces | RTS over neighborhood association memory — a corpus Slack would never imagine. Community memory beside official memory. |
| MCP Server Integration | Custom Milwaukee Civic MCP server (open-source artifact) plus optional Slack MCP server tools | An MCP server for city legislation — usable by every civic-tech builder in any of 300+ Legistar municipalities |
| Slack AI Capabilities | Assistant threads, suggested prompts, Block Kit alert cards, App Home config, status updates | Proactive agent, not a chatbot — the alert fires unprompted |

---

## Judging Criteria Mapping

| Criterion | Gavel's Answer |
| --- | --- |
| Technological Implementation | All three sponsor techs; three-memory architecture; parcel-conditioned RAG; transcript receipts with video links; agenda-version diffing; open-source MCP server; ToS-aware data design |
| Design | Proactive Block Kit alerts (not a chat box); bilingual cards; "How to be heard" footer turning information into action; escalating assistant-thread interactions; App Home config; inline video clips |
| Potential Impact | Civic participation equity — nobody can monitor 4-hour webcasts; language access (EN/ES) for communities locked out twice; 300+ Legistar cities plus CKAN portals everywhere; open-source Civic MCP for the civic-tech community |
| Quality of the Idea | No prior art fuses official civic memory with a community's own Slack memory; walk-on/consent-burial detection is insider knowledge only a sitting commissioner would build; persona-grounded design (Denise/Marcos/Rachel) |

---

## Stack Summary

TypeScript, Bolt SDK, Slack CLI (`slack create agent`), Convex (state + vector search), Anthropic API (Claude Sonnet — summarization + agent loop), Milwaukee Civic MCP (custom, open source), Slack RTS API, Fly.io (poller + workers + clip hosting), Deepgram Nova-3 (batch, diarization), ffmpeg/yt-dlp, Census Geocoder