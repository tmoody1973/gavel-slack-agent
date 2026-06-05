# GAVEL — Personas, Pain Points & Persona-Derived Features
*Companion to gavel-project-brief.md · June 2026*

The brief was built architecture-out. This document is built user-in: three personas who would install Gavel tomorrow, their pain points, and the features those pains demand — with an honest verdict on what makes the hackathon build vs. the parking lot.

---

## Persona 1 — "The Volunteer President"

**Denise, 58 · President, Sherman Park-area neighborhood association · Hospital billing supervisor by day**

Runs the association on nights and weekends. Twenty years in her house. The association's "system" is a Gmail account, a free Slack workspace someone's nephew set up in 2021, and Denise's memory. She is the institutional knowledge — and she's tired.

**A day in her life:** Gets a forwarded email about a rezoning *after* the committee already heard it. Spends Saturday morning trying to read a 14-page file on Legistar, gives up at "deviation from §295-505-2-b." Posts "does anyone know what's happening on 27th St?" in Slack. Three people reply with rumors.

| # | Pain point | Severity |
|---|---|---|
| P1.1 | **Finds out too late.** Learns about agenda items after committee votes, when leverage is gone | Critical |
| P1.2 | **Can't parse legalese.** File language is impenetrable; she needs "what does this mean for my block" | Critical |
| P1.3 | **Can't attend.** Meetings are weekday afternoons; she has a job. 4-hour webcasts are not an option | High |
| P1.4 | **She IS the institutional memory.** When she steps down, the association forgets every fight it ever had | High |
| P1.5 | **Doesn't know how to act.** Even when informed, the path from "concerned" to "registered to testify" is opaque | Medium |
| P1.6 | **Drowning in noise.** When she *does* subscribe to city notices, 95% is irrelevant boilerplate | Medium |

**Features derived:**

| Feature | Pain | Status vs. brief |
|---|---|---|
| Proactive plain-English alerts before the hearing | P1.1, P1.2 | ✅ Already the spine |
| 90-second clip + "what was said" | P1.3 | ✅ In brief (video tier 2 + transcripts) |
| RTS community-memory recall ("what did we say in 2024?") | P1.4 | ✅ In brief — Denise is *why* the RTS beat matters |
| **NEW — Sunday Digest:** one weekly post: "3 items near you this week, 1 needs attention" | P1.6 | 🟢 ADD — cheap (one cron + one Claude call), huge retention story |
| **NEW — "How to be heard" card:** alert footer with hearing date/time/location, how to register for public comment, alderperson contact | P1.5 | 🟢 ADD — static-ish Block Kit footer, ~hours of work, pure Agent-for-Good points |
| **NEW — Escalation ping:** notify when a watched item moves committee → full Council, or status changes | P1.1 | 🟢 ADD — the poller already sees MatterHistory; it's a diff check |

---

## Persona 2 — "The Stretched Organizer"

**Marcos, 34 · Community organizer, near-south-side CDC (community development corporation) · Covers 3 neighborhoods**

Paid to do what Denise volunteers for — across three neighborhoods at once, in a bilingual community. His job is half information triage, half mobilization. He keeps a cursed spreadsheet of LLC names because the same developers keep showing up under different shells.

**A day in his life:** Hears a rumor a problem landlord is expanding. Spends two hours manually cross-referencing MPROP ownership records and permit filings. Translates a zoning summary into Spanish himself at 11pm because a third of his residents won't engage otherwise. Needs 25 people at a hearing Thursday and has one channel post and a prayer.

| # | Pain point | Severity |
|---|---|---|
| P2.1 | **Manual entity detective work.** Cross-referencing LLCs ↔ parcels ↔ permits ↔ violations takes hours per case | Critical |
| P2.2 | **Language equity.** Plain English isn't enough; a large share of his residents need Spanish | Critical |
| P2.3 | **Multi-neighborhood routing.** One feed for three areas = everyone tunes out; he needs per-channel geography | High |
| P2.4 | **Mobilization friction.** Knowing isn't acting — he needs to turn an alert into bodies at a hearing | High |
| P2.5 | **Recurring-actor blindness.** No way to say "tell me whenever THIS owner files anything, anywhere" | High |
| P2.6 | **Reporting upward.** Funders ask "what did you monitor and what happened?" — he reconstructs it from memory | Low |

**Features derived:**

| Feature | Pain | Status vs. brief |
|---|---|---|
| Ownership portfolio + permit trail tools | P2.1 | ✅ In brief (parcel tools) — Marcos is the user who makes the 0:40 demo beat believable |
| Per-channel subscriptions (committee/keyword/boundary) | P2.3 | ✅ In brief |
| **NEW — Watchlists:** `/gavel watch "XYZ Holdings LLC"` → alert on any new matter, permit, or filing tied to that owner, citywide | P2.5, P2.1 | 🟢 ADD — high wow, modest cost: poller already diffs new data; this is a join against a watch table. *Strong candidate for a demo beat* |
| **NEW — Spanish alerts:** per-channel language setting; Claude renders every alert bilingually | P2.2 | 🟢 ADD — nearly free with Claude, and it's the single strongest Agent-for-Good equity feature in the whole roadmap. Milwaukee's near south side is the use case in the flesh |
| **NEW — Mobilize button:** "I'm going" RSVP on hearing alerts + shareable summary card for other channels/texts | P2.4 | 🟡 STRETCH — Block Kit actions are easy, but it's a workflow feature; cut-line candidate |
| Activity log export for funder reports | P2.6 | 🔴 PARKING LOT — real product feature, invisible in a demo |

---

## Persona 3 — "The Solo Civic Journalist"

**Rachel, 41 · Writes a Milwaukee civic affairs newsletter (2-person operation) · Ex-daily-paper, laid off in 2023**

Covers city hall alone for 8,000 subscribers. Her competitive edge is catching what the shrinking dailies miss — but she physically cannot watch every committee. Her stories live or die on receipts: who said what, who voted how, what got buried.

**A day in her life:** A tip says a controversial item got quietly added to tomorrow's agenda. She scrubs through last month's 3.5-hour committee video at 2x speed hunting for one exchange. Rebuilds an alderman's voting pattern on TIF deals by opening eleven Legistar files in eleven tabs.

| # | Pain point | Severity |
|---|---|---|
| P3.1 | **The story is buried in video.** Hours of footage hide 90 seconds of news; no search over what was *said* | Critical |
| P3.2 | **Procedural burial.** Walk-on items, last-minute agenda additions, consent-agenda padding — where accountability goes to die, and exactly what's hardest to catch | Critical |
| P3.3 | **Vote-record archaeology.** Reconstructing how members voted across a matter's life is manual tab hell | High |
| P3.4 | **Receipts for publication.** Needs exact quotes + timestamps + linkable sources, not summaries | High |
| P3.5 | **Speed.** News value decays hourly; she needs answers at deadline pace | Medium |

**Features derived:**

| Feature | Pain | Status vs. brief |
|---|---|---|
| `search_transcripts` with quote + speaker + timestamped video link | P3.1, P3.4, P3.5 | ✅ In brief — Rachel is why "the receipt principle" matters; she's also the persona who'd pay |
| `get_matter_history` / `get_votes` | P3.3 | ✅ In brief |
| **NEW — Agenda-change detection:** poller diffs each agenda version; flags items added < 48h before a meeting or slipped onto consent | P3.2 | 🟢 ADD — *the insider feature.* Cheap (it's a diff on data the poller already pulls), and it's knowledge only someone who's sat through these meetings would think to build. One line in the demo — "Gavel flags that Item 22 was added yesterday afternoon" — and every judge who's touched local government feels it |
| **NEW — Vote-record compilation:** "How has Ald. X voted on demolitions this year?" → aggregated answer with file links | P3.3 | 🟡 STRETCH — aggregation across matters is real query work; ship if week 4 is kind |
| Cross-meeting topic tracking ("every time TIF #99 came up") | P3.1 | 🟡 Mostly falls out of transcript metadata — but corpus is 1 meeting for demo, so it demos thin. Post-hackathon with backfill |

---

## Synthesis — What the Personas Actually Changed

**The headline insight:** the brief was strong on *informing* (alerts, context, receipts) and thin on **equity and procedure** — the two things that turn "useful tool" into "Agent for Good." The personas surface exactly four new features worth adding to the build, all cheap, all demo-visible:

| New feature | Personas served | Effort | Demo value | Build placement |
|---|---|---|---|---|
| 1. **Spanish bilingual alerts** | Marcos (P2.2) | ~Half day (Claude does the work) | High — equity made visible in one screenshot | Week 1 (it's a prompt change + channel setting) |
| 2. **Agenda-change / walk-on detection** | Rachel (P3.2), Denise (P1.1) | ~1 day (version diff in poller) | High — the "only an insider builds this" moment | Week 3 |
| 3. **Watchlists (owner/developer)** | Marcos (P2.5), Rachel | ~1–2 days (watch table + diff join) | High — pairs with ownership-portfolio beat | Week 3–4 |
| 4. **"How to be heard" footer + Sunday Digest + escalation ping** | Denise (P1.5, P1.6, P1.1) | ~1 day combined | Medium — but it's the impact-criterion answer: information → participation | Weeks 1–5, incremental |

**Demo script amendment:** insert one beat — after the zoning RAG answer (~1:10), the alert card re-shown in Spanish with the "How to be heard" footer (5 seconds, no narration needed), and Rachel's beat: "Gavel also caught that this item was added to the agenda yesterday afternoon." Procedure + equity in under 15 seconds of video.

**What got cut (and why) — portfolio fodder:**
- Mobilize/RSVP workflows — workflow tooling, not intelligence; dilutes the agent story
- Funder activity exports — invisible in demo, real in product
- Cross-meeting analytics — needs corpus backfill the demo can't justify
- Anything homeowner-facing — still a different user, still parked

**Persona → judging criteria mapping:**
- Denise = **Potential Impact** (the disenfranchised-by-default citizen)
- Marcos = **Agent for Good** in its purest form (equity, language access, economic opportunity)
- Rachel = **Quality of the Idea / Technological Implementation** (receipts, procedure detection — the features no generic chatbot has)

One persona of each: a volunteer, a professional, a watchdog. If the submission text introduces all three in two sentences each, the judges meet the community before they meet the architecture — lead with Denise.
