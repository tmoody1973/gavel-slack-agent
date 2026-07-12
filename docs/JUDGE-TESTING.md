# Gavel — Testing Instructions for Judges

**Time needed: ~7 minutes.** Nothing to install. You are already a member of the Slack workspace,
and the Gavel app is installed org-wide.

---

## What Gavel is (30 seconds)

Gavel is a **proactive** Slack agent for Milwaukee neighborhood associations. It watches city
government (agendas, permits, property records, meeting video), translates legalese into plain
English **and Spanish** *before the vote*, and fuses official civic records with the community's own
Slack discussion.

**It is not a chatbot.** The primary experience is an alert that arrives unprompted. The commands
below let you explore what it knows — but the headline is Test 1.

---

## Test 1 — See a real proactive alert ⭐ (the core idea)

1. Open **`#general`**.
2. Scroll to the most recent **Gavel** alert card (headline mentions a **data center at 5825 W Hope Ave**).

**What to look for:**
- A plain-English summary + **"Why it matters"** — generated from the real Legistar record, not a template.
- **🗣️ How to be heard** footer — the real hearing date, time, and location.
- Action buttons on the card.

> This is a real City Plan Commission item (**File #260030**, the former Midtown Walmart site).
> Every fact on the card is pulled live from the city's Legistar API.

---

## Test 2 — Local news, connected to the item 📰

On that same alert card, find the **`📰 In the local news`** block.

**What to look for:** real, clickable headlines from **Milwaukee Journal Sentinel** and **Urban Milwaukee**
about this specific agenda item — including two opposing framings of the same project.

> Every article is passed through a Claude relevance gate ("is this about *this* item?") before it
> shows. Gavel links to reporters' work — it never rewrites or summarizes their articles.

---

## Test 3 — File a public comment with the city ✍️ (the payoff)

This is the loop closing: alert → understand → **act**.

1. On the alert card, click **`✍️ Make my voice heard`**.
2. A modal opens showing **"✨ Gavel is drafting your comment…"**, then swaps in a real Claude-written
   public comment grounded in the actual agenda item.
3. Pick a position (Support / Oppose / Neutral / Question), **edit the text freely**, add your name.
4. Click **Send to the city**.

**What to look for:**
- The comment is **editable** — a human is always in the loop; there is no auto-send.
- A **🧪 Demo mode** notice on the modal, and again in the confirmation.

> ⚠️ **Safety:** in demo mode every comment is delivered to a **test inbox**, never to a real city
> clerk. Gavel will not send without a real name, and caps one submission per person per item per day.

---

## Test 4 — Federated search across the civic record 🔎

In **`#general`**, run:

```
/gavel search "data center"
```

**What to look for:** one query, results grouped by source —

| Source | What it is |
|---|---|
| 📬 Civic mail | City E-Notify notices (via AgentMail) |
| 🏛️ Upcoming agendas | Live Legistar agenda items |
| 🎙️ Meeting minutes | Transcribed council meeting video (vector search) |
| 📖 Zoning code | The city zoning code (vector search) |
| 📰 Local news | External reporting, relevance-gated |

Try also: `/gavel search 5825 W Hope Ave` · `/gavel search tavern`
(Quotes = exact phrase.)

---

## Test 5 — Bilingual, natively 🇪🇸

1. Open **`#clarke-square`** (a Spanish-language channel — ~30% of this neighborhood speaks Spanish at home).
2. Run:

```
/gavel help
```

**What to look for:** Gavel responds in **Spanish**. Language is a per-channel setting, not a
translate button — alerts, summaries and commands are all generated natively in Spanish. File
numbers, addresses and committee names correctly stay in English (they're official identifiers).

---

## Test 6 — Ask the community's memory 💬 (Real-Time Search API)

Open a thread on the alert card (or the **Gavel** app's assistant pane) and ask:

```
What are neighbors saying against the data center?
```

**What to look for:** Gavel answers using **the workspace's own conversation history**, surfaced live
through Slack's **Real-Time Search API** — alongside the official record.

> **Compliance note (important):** Gavel *indexes* the public record (zoning code, transcripts,
> agendas) but *queries* Slack messages **live and never stores them**. No community message is ever
> copied into a database.

---

## Test 7 — Story Radar (the reporter's view) 🗞️

```
/gavel stories
```

**What to look for:** upcoming agenda items ranked by newsworthiness, with a suggested angle —
built for local reporters covering a beat with no time to read 200 pages of agendas.

---

## Test 8 — Watch something, proactively 👁️

```
/gavel watch 5825 W Hope Ave
/gavel status
```

**What to look for:** `status` shows the channel's committees, keywords, language, and your new
watch. From then on, anything touching that address alerts this channel unprompted — which is the
whole point of Gavel.

Undo with `/gavel unwatch 5825 W Hope Ave`.

---

## Test 9 — Meeting video 🎥

```
/gavel video
```

**What to look for:** recent council meeting video, with transcript-backed deep links so you can jump
to the moment an item was actually discussed.

---

## Test 10 — App Home 🏠

Click **Gavel** in the sidebar → **Home** tab. A one-tap dashboard: what this channel watches, what's
coming up, and a way to add a watch without learning a command.

---

## Full command reference

```
/gavel help                    Show all commands
/gavel search <term>           Search city mail, agendas, minutes, zoning & news
/gavel watch <entity>          Alert this channel when a file #, address, or name appears
/gavel unwatch <entity>        Stop watching
/gavel status                  This channel's committees, keywords, language, watches
/gavel stories [committee]     Ranked story leads on the upcoming agenda
/gavel video [committee]       Browse recent meeting video
```

---

## Where the required technologies show up

| Requirement | Where you see it |
|---|---|
| **Custom MCP server** | The Milwaukee Civic MCP server wraps Legistar (agendas/matters/votes) + the city's CKAN datastore (property, permits, zoning). It powers Tests 1, 4, 7, 8. |
| **Real-Time Search API** | Test 6 — community memory queried live from Slack, never stored. |
| **Slack AI / agent surface** | The assistant thread + suggested prompts (Test 6), Block Kit alert cards, modals (Test 3), App Home (Test 10). |

---

## Honest disclosures

- **Alerts are on a cron** (every 5 minutes against the real Legistar API). A brand-new alert only
  posts when the city publishes a new agenda item, so you may not catch one live — the card in
  `#general` (Test 1) is a real one already delivered.
- **Civic comments go to a test inbox in demo mode**, never to a real city clerk (Test 3).
- Meeting-video transcription is enabled for a subset of recent meetings (cost), not the full archive.

---

## Channels the Gavel bot is in

`#general` (English) · `#clarke-square` (**Spanish**) · `#sherman-park` · `#zoning` ·
`#lindsay-heights` · `#random`

Questions? Contact **tarik@radiomilwaukee.org**.
