# Gavel — Devpost Description (DRAFT in your voice)

> ## ⚠️ READ THIS ALOUD BEFORE YOU PASTE IT
>
> The organizers said: *"Don't let an AI write your entire description. Judges read a lot of these.
> AI-generated boilerplate is obvious and forgettable."*
>
> I wrote this **from your facts, in your cadence** — short sentences, plain words, no throat-clearing.
> But it is still a draft written by a machine.
>
> **Read every line out loud.** Anywhere it doesn't sound like something you'd actually say to a
> neighbor, **change it.** Especially **Inspiration** — that section is yours, and a judge can smell a
> fake one instantly. Two minutes of your own words there beats anything I can generate.
>
> Delete this box before pasting.

---

## Tagline

**Gavel tells your neighborhood what City Hall is about to do — before the vote, in your language.**

---

## What it does · who it's for · why it matters *(the first paragraph — they read this and decide)*

Gavel is a Slack agent that watches Milwaukee city government and tells a neighborhood what's about to
happen to their block — before the vote, in plain English and in Spanish. It's for neighborhood
associations, block clubs, and the residents in them: people with jobs and kids who are never going to
read a 200-page agenda PDF. It matters because the information is already public and it still doesn't
reach anybody. The city publishes. Nobody reads it. The vote happens. You find out after.

---

## Inspiration

**← THIS SECTION IS YOURS. Rewrite it. Here's the scaffold with the real facts in it.**

I sit on Milwaukee's City Plan Commission. I'm the guy on the other side of the table, and I watch
people find out too late. Every meeting.

This spring a data center was headed for a vacant Walmart at 5825 W Hope Avenue, next to people's
homes. Here's the part that got me: **the city's filing never called it a data center.** It called it a
"computational research facility." That's the language in the record. That's what you'd have to know to
search for.

The neighborhood worked it out anyway. They showed up. They asked who was behind it — nobody would say.
They packed a seven-hour hearing on June 29 and the Commission punted. And in early July, the developer
dropped the data center from the plan.

**They won.**

But think about what that took. A handful of people had to decode a euphemism, organize in the dark, and
give up their whole day to sit in a hearing room. Most blocks don't have that. They find out after.

I built Gavel so the next neighborhood doesn't have to get lucky.

---

## What it does

Gavel is **proactive**. It is not a chatbot you go ask.

- **It posts before the vote.** It polls Legistar every five minutes. When something lands on an agenda
  that touches your committees, your keywords, or an address you're watching, it posts a Block Kit card
  in your channel — in **plain English and Spanish**, generated natively, not translated.
- **It tells you how to be heard.** Every alert carries the hearing date, the room, and how to speak.
- **It pulls in the local press.** Real reporting about *that specific item*, relevance-checked by Claude
  so a wrong match never shows. It links to reporters' work; it never rewrites it.
- **It answers "who's actually behind this?"** — live from the city's property records. On our item:
  **AFS Milwaukee, LLC.**
- **It remembers what your neighborhood already said**, live through Slack's Real-Time Search API.
- **It gives you the footage.** Milwaukee publishes meeting *video* but no *transcripts*, so what's said
  in that room is effectively unsearchable. Gavel transcribes the webcast, finds the moment, and clips it
  — that's how it surfaced "computational research facility" out of a three-hour meeting.
- **It files your public comment.** From the alert, a resident drafts a comment in their own words and
  their own language, edits it, and sends it to the city before the hearing. A human is always in the
  loop. Gavel never fabricates a constituent.

---

## How I built it

TypeScript, Slack Bolt, Convex, Claude, Fly.io. **920 tests.**

The architecture is one idea: **three memories, one agent.**

1. **The official record** — a custom **Milwaukee Civic MCP server** wrapping Legistar (agendas, matters,
   sponsors, vote history) and the city's CKAN datastore (parcels, owners, permits, zoning). Without it
   Gavel has no senses. **It's open source.**
2. **The public spoken record** — meeting webcasts transcribed with Deepgram and the zoning code, chunked
   into a Convex vector database.
3. **The community's own memory** — **Slack's Real-Time Search API**, queried live over the workspace's
   own conversation.

And one rule that shapes all of it:

> **Gavel indexes the public record. It queries the private one live — and never stores it.**

Your neighbors' Slack messages are not a training set. We deliberately rejected a memory layer that would
have persisted them, because it would have meant copying people's conversations into a database. That's
not a feature I bolted on to satisfy a requirement. **Take Real-Time Search away and Gavel either goes
deaf to its own neighborhood, or it starts warehousing people's messages.** There's no third option. It's
the reason the architecture is shaped the way it is.

---

## Challenges I ran into

- **The record is written to be unsearchable.** "Computational research facility." You cannot search for
  a thing when nobody will call it by its name. That's *why* the transcript layer exists.
- **Legistar has no geocoding.** Not one field. Addresses hide inside title text, so Claude extracts them
  and the Census geocoder resolves them.
- **Milwaukee publishes video, not transcripts.** So we had to build the searchable record ourselves.
- **A one-word bug nearly cost me the truth.** My news query was leaking the word "Conditional" out of an
  agenda title into the search. It took a real query from 10 articles to zero — and it was hiding the
  coverage that the data center had been *dropped*. I found it the day before submission. That is exactly
  the kind of quiet failure that makes a civic tool worse than useless, and it's why the relevance gate
  and the honest "information_unavailable" paths matter more than any feature.

---

## Accomplishments I'm proud of

- It runs on **real Milwaukee data, live.** Nothing in the demo is a mock.
- **Bilingual by design, not by translation API.** Language is a per-channel setting; Claude writes the
  Spanish. File numbers, addresses and committee names stay in English, because that's what you have to
  say out loud at the hearing.
- The **compliance stance**. Indexing the public record and querying the private one live is a harder way
  to build it, and it's the right one.
- It **closes the loop.** Most civic tech stops at "here's the information." Gavel gets you to "your
  comment is filed."

---

## What I learned

That the gap isn't data. **All of this was already public.** The gap is that public and *accessible* are
not the same word, and nobody has been paid to close the distance.

Also: an agent that hedges is worthless here. If Gavel doesn't know, it has to say so — every tool can
return `information_unavailable`, and it is never allowed to invent a quote, a link, or a fact. In civic
information, a confident wrong answer is worse than silence.

---

## What's next

- **Auto-transcription on the poller.** The city publishes video; we publish the searchable record.
- **Real clerk delivery** for public comments (today it's a safe test inbox).
- **The next city.** Milwaukee runs on Legistar. So do **300+ others** — Gavel points at a new one by
  changing a single string. The MCP server is useful on its own, outside Slack, today.

---

## Honest disclosures

I'd rather tell you than have you find it:

1. Alerts run on a five-minute cron against live Legistar. **In the video the alert is manually triggered**
   so it fires on camera.
2. The neighbor conversation in the demo is **real, documented resident sentiment** (from NNS, WTMJ and
   CBS58 reporting), **posted fresh** — Slack can't backdate messages.
3. Public comments in demo mode go to a **test inbox. Never a real city clerk.**
4. **Gavel cut the video clip** you see — but it was **posted ahead of the recording**, not generated live
   on request. The on-demand clip tool ships and is tested, but Granicus blocks our cloud host's IP for
   media files, so in production it degrades to a timestamped deep link into the city's own player.
5. Meeting transcription is **batch-ingested** (Deepgram bills by the hour), so a subset of meetings are
   transcript-searchable. Discovery covers all of them.

---

## Try it

Full walkthrough: **`docs/JUDGE-TESTING.md`** in the repo. The short version:

1. Open **#general** → the data-center alert card.
2. In a thread, ask: **"Didn't we already push back on this?"**
3. Run: **`/gavel search "data center"`**
4. Go to **#clarke-square** and run **`/gavel help`** — Gavel answers in Spanish.
5. Click **✍️ Make my voice heard** and file a comment. (It goes to a test inbox.)
