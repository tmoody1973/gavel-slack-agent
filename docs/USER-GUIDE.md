# Gavel — User Guide

**Gavel watches Milwaukee city hall and comes to *you*.** It reads every committee agenda, permit, and property record, translates the legalese into plain English (and Spanish) *before* the vote, and posts it in your Slack channel — unprompted. You don't have to ask, log in to a city portal, or know what a "Class B Tavern license revocation" means. Gavel tells you what's coming to your block and how to speak up.

This guide is organized by who you are. Jump to your section.

- [Judges & first-time testers — start here](#judges--first-time-testers)
- [If you're a resident or neighborhood association](#residents--neighborhood-associations)
- [If you're an organizer](#organizers)
- [If you're a reporter](#reporters)
- [How Gavel works (the short version)](#how-gavel-works)
- [Command reference](#command-reference)

---

## Judges & first-time testers

You have sandbox access — here's the 2-minute path that shows the whole thing:

1. **Open a seeded channel** — e.g. `#clarke-square` (Spanish-preference) or `#sherman-park`. Scroll up: Gavel has already posted plain-English/Spanish **alerts** about real Milwaukee agenda items, each with a *"How to be heard"* footer.
2. **Type `/gavel help`** — a role-aware guide modal opens; switch personas with the buttons at the top.
3. **Ask in a thread** — reply to any alert or DM Gavel: *"what did the committee say about the Punta Cana license?"* It returns the real quote, who said it, and a ▶ timestamped video clip.
4. **Browse the proof** — `/gavel video` lists meeting footage Gavel can search; `/gavel stories` ranks what's newsworthy on the upcoming agenda.

Everything is sourced live from Milwaukee's official Legistar records. What's seeded vs. live is disclosed in the project's demo notes.

---

## Residents & neighborhood associations

**You want to know what's coming to your block before it's decided — and how to be heard.**

**Quickstart**
1. Make sure Gavel is in your neighborhood channel (`/invite @Gavel`).
2. Subscribe the channel to your area's committees/topics (an admin can set this, or use the App Home).
3. That's it — alerts start posting automatically.

**What to try**
- **Watch a specific thing:** `/gavel watch 2000 S 13th St` (or a file number, or a developer's name). Gavel pings the channel whenever it moves through the record.
- **Search the record:** `/gavel search 2000 S 13th St` — Gavel searches city mail, agendas, minutes, and zoning at once (put a phrase in "quotes" for an exact match).
- **Ask anything in plain language:** reply in an alert's thread or DM Gavel — *"what meetings are coming up this week?"* It answers in your language.
- **Check your setup:** `/gavel status` shows this channel's committees, topics, and language.

**The point:** every alert tells you *when and where* the hearing is and *how to comment* — turning "I found out too late" into "I showed up."

---

## Organizers

**You cover several neighborhoods, often in Spanish, and you're tired of being the manual detective.**

**Quickstart**
1. Set up one channel per neighborhood; set each channel's language (English or Español).
2. Add the owners, developers, and addresses you track to watchlists.
3. Let Gavel route the right items to the right channel automatically.

**What to try**
- **Spanish, natively:** set a channel to Español and every card is *written* in Spanish (not machine-translated).
- **Who's behind this?** Ask Gavel about an address — it pulls ownership, the parcel, and recent permits from city records.
- **Community memory bridge:** when your group has been discussing something that lands on the agenda, Gavel connects the two — *"you've been talking about this; it's up this week."*
- **Watchlists + escalation:** `/gavel watch <owner|developer|address>`; Gavel escalates when an item jumps from committee toward a final vote.

---

## Reporters

**You're a one- or two-person shop and the story is buried in a four-hour video with no transcript.**

**Quickstart**
1. Join a channel set up with the **reporter** role (unlocks story tools + the App Home video section).
2. Run `/gavel stories` to see what's newsworthy on the upcoming agenda.
3. On any lead, hit **📋 Brief me** for the full dossier.

**What to try**
- **Story leads:** `/gavel stories [committee|topic]` — ranked by money, accountability, and procedural anomalies (walk-ons, consent-calendar burials), grounded in the record.
- **The dossier:** **📋 Brief me** assembles angle + sponsor + history + the video moment + the outcome on one screen.
- **Search the whole record:** `/gavel search "data center"` — one query across city mail, agendas, minutes, and zoning code; quotes for an exact phrase, words for a broader hybrid search.
- **Receipts:** ask *"what did the committee say about X"* → Gavel returns the **quote**, the **speaker** (named when it can identify a council member), and a **▶ timestamped clip**. `/gavel video` browses what footage exists and what's searchable (🔍).
- **What could they build?** Ask a zoning question about a parcel — Gavel answers with the relevant code sections.

Gavel cites primary sources and never invents a quote.

---

## Case studies — Gavel in action

Three short walkthroughs of the same product serving three very different people. (The Punta Cana liquor-license item — File #260229, 2000 S 13th St — is a real Milwaukee record seeded into the demo workspace; what's live vs. seeded is disclosed in the project's demo notes.)

### Denise — a resident watching her block (English)

1. A Class B tavern license renewal lands on the Licenses Committee agenda for a property two blocks from Denise's house.
2. **Before** the hearing, Gavel posts a plain-English alert in her neighborhood channel — what it is, when and where the hearing is, and a *"How to be heard"* footer. No city portal, no legalese.
3. Denise types `/gavel watch 2000 S 13th St` to follow the address, and replies in the thread — *"what does this mean for the block?"* — getting a plain-language answer.
4. **Outcome:** she emails the committee before the deadline and shows up to comment. *"I found out too late"* becomes *"I showed up."*

### Marcos — an organizer working in Spanish (Español, #clarke-square)

1. Gavel posts the Punta Cana liquor-license item to **#clarke-square** — *written natively in Spanish*, not machine-translated (file number and address stay in English, as the official record).
2. Marcos asks in Spanish in the thread what the committee said; Gavel answers **in Spanish** with the quote, who said it, and a ▶ timestamped clip — and bridges the community memory: *"han estado hablando de esto; está esta semana."*
3. He runs `/gavel search 2000 S 13th St` to pull the full record (mail + agenda + minutes) and `/gavel watch File #260229` to track it toward the final vote.
4. **Outcome:** a Spanish-speaking block organizes around an official record it never had to translate.

### Rachel — a one-person newsroom (English)

1. Rachel runs `/gavel stories Licenses` — Gavel ranks the newsworthy items on the agenda by money, accountability, and procedural anomalies, surfacing the Punta Cana license as a lead.
2. She hits **📋 Brief me** for a one-screen dossier (angle, sponsor, history, the video moment, the likely outcome), then `/gavel search "data center"` to dig the whole civic record for a separate beat.
3. She asks *"what did the committee say about the Punta Cana license?"* → Gavel returns the **quote**, the **named speaker**, and a **▶ timestamped clip**.
4. **Outcome:** she files with primary-source receipts in minutes, instead of scrubbing a four-hour video with no transcript.

---

## How Gavel works

Gavel is **not a chatbot.** Its job is to fire alerts *unprompted*. Under the hood it fuses three kinds of memory:

1. **Official civic records** — Milwaukee's Legistar agendas/matters + city property and permit data, live via a custom Milwaukee Civic MCP server.
2. **The public spoken record** — committee-meeting transcripts and video, searchable with quote + speaker + timestamp.
3. **Your community's own memory** — your channel's discussion history, queried *live* and **never stored** (a deliberate Slack-ToS-respecting design).

Gavel *indexes the public record* and *queries the private record live* — which is exactly why a community-memory "bridge" can say "you've been discussing this" without ever copying your messages.

---

## Command reference

| Command | What it does |
|---|---|
| `/gavel help` | Open the role-aware help guide (this content, in Slack) |
| `/gavel watch <file # / address / name>` | Alert this channel whenever it appears in the record |
| `/gavel unwatch <entity>` | Stop watching (use the exact name from `/gavel status`) |
| `/gavel status` | This channel's committees, keywords, language, and watches |
| `/gavel stories [committee\|topic]` | Ranked story leads on the upcoming agenda (reporters) |
| `/gavel video [committee]` | Browse recent meeting video you can watch (and search) |
| `/gavel search <term>` | Search across city mail, agendas, minutes & zoning at once — quotes = exact phrase, words = broader hybrid search |

You can also just **talk to Gavel** — reply in any alert's thread or DM it. It answers in the language you write in, and points you at the primary source.

---

_Bilingual (EN/ES) copy throughout is pending a native-Spanish-speaker review. Sourced live from Milwaukee's official Legistar records._
