# Devpost — Fact Sheet + Skeleton (YOU write the prose)

> **Read this first:** the organizers said *"Don't let an AI write your entire description. Judges read a
> lot of these. AI-generated boilerplate is obvious and forgettable. Write in your own voice, even if it's
> tough."*
>
> **You are a broadcaster and a sitting Plan Commissioner.** Your voice is the single biggest unfair
> advantage in this submission. Do not trade it for polish. This file is **facts and prompts** — not
> paragraphs to paste.

---

## The three questions their first paragraph must answer

Answer these in your own words, in this order. Don't be clever — be clear.

1. **What does it do?**
2. **Who is it for?**
3. **Why does it matter?**

**Prompt to write from (say it out loud, then type what you said):**
> *"If I ran into a neighbor at the grocery store and they asked what I built — what would I say in two
> sentences, without using the word 'AI'?"*

---

## Impact — be SPECIFIC (they called this out for Agent for Good)

❌ Vague: *"helps neighborhoods engage with local government."*
✅ Specific: name the gap, the mechanism, and the outcome.

**The real, verified impact story:**
- Milwaukee's City Plan Commission publishes a **200+ page agenda PDF** days before it votes.
- A data-processing facility is proposed for a **vacant Walmart at 5825 W Hope Ave**, next to homes.
- Residents **could not find out who was behind it.** The owner is **AFS Milwaukee, LLC** — Gavel pulls
  that from the property record in seconds.
- **May 18:** pulled from the agenda after residents objected.
  **June 29:** 7-hour hearing → Plan Commission **punts** the decision.
  **July 6-8:** the developer **DROPS the data center** after resident pushback (Urban Milwaukee, WISN, TMJ4).
  **July 20:** the redevelopment AND the **citywide data-center rules (#260142)** are still on the agenda.
  *(All verifiable in Legistar + the press.)*
- **The residents WON — and they had to do it in the dark.** That is the Agent-for-Good story: not "here is
  a threat," but "here is a community that beat one, and the tool that makes the win repeatable."
- Clarke Square is a heavily **Spanish-speaking** neighborhood. The city publishes in English only.
- Gavel turns that into: **a plain-English + Spanish alert the day the agenda drops, and a public comment
  filed before the hearing.**

**Prompt:** *"What does a resident on that block get, that they did not have before? Say it as a
before/after, not as a feature."*

---

## Why the required tech is load-bearing (their test: "would this be meaningfully worse without it?")

Say this plainly — most submissions can't.

- **Custom MCP server (Milwaukee Civic MCP).** Wraps Legistar (agendas, matters, sponsors, vote history)
  + the city's CKAN datastore (MPROP parcels, owners, permits, zoning). **Without it Gavel has no civic
  data at all.** It is the product's senses. Open source.
- **Slack Real-Time Search API.** Gavel answers "what did *this* neighborhood already say?" by querying
  the workspace's own history **live**. **Without RTS, Gavel either goes deaf to its own community — or it
  has to store people's Slack messages, which violates Slack's ToS.** We deliberately rejected mem0 for
  exactly this reason.
  > **The line:** *"It indexes the public record. It queries the private one live, and never stores it."*
  > That is an architectural stance, not a checkbox.
- **Slack AI / agent surface.** Block Kit alert cards, modals, App Home, assistant threads with suggested
  prompts.

---

## Honest disclosures (put these IN the description — honesty scores)

1. Alerts run on a 5-minute cron against the live Legistar API; in the demo video the alert is **manually
   triggered** so it fires on camera.
2. The neighbor conversation in the demo is **real sentiment** (paraphrased from NNS / WTMJ / CBS58
   reporting), posted fresh because Slack can't backdate messages.
3. Public comments in demo mode go to a **test inbox — never a real city clerk.**
4. Meeting-video **transcription is batch-ingested** (Deepgram bills per hour of audio), so a subset of
   meetings are transcript-searchable; discovery covers all of them.

5. **On-demand video clipping degrades in the deployed app.** Gavel can cut the real footage out of a
   webcast and post it playing inline in Slack (`clip_video_moment`, built + tested + deployed). But
   Granicus **403s our cloud host's IP for media files** (verified: 403 from Fly, 206 from a residential
   IP, every header combination), so in production the agent **degrades to a timestamped deep link plus
   real transcript quotes** rather than failing. Clips in the demo were cut by the same pipeline from a
   non-blocked network. Fixing it means an allowed egress or caching clips at ingest — not header tuning.

---

## Reach / "why this isn't just Milwaukee"

- Milwaukee runs on **Legistar**. So do **300+ other cities** — Gavel points at a new city by changing one
  string (`/v1/milwaukee` → `/v1/{client}`).
- The **Milwaukee Civic MCP server is open source** and useful on its own, outside Slack.

---

## What's next (shows you know your own roadmap — this SCORES)

- **On-demand transcription from Slack** — a `🎙️ Make this searchable` button on the video browser that
  queues a Deepgram job (today it's a batch CLI ingest).
- Real clerk delivery for public comments (today: demo test inbox + a per-committee clerk directory).
- Multi-city rollout via the MCP `{client}` parameter.

---

## Everything Gavel does (ONE line each — this is the list the *video* deliberately leaves out)

Keep the video to one spine; let the text carry the breadth.

- Proactive bilingual agenda alerts (Block Kit, EN + ES, "How to be heard" footer)
- Federated `/gavel search` — civic mail · agendas · meeting minutes · zoning code · local news
- Civic news enrichment — real local reporting, relevance-gated, linked on the alert
- File a public comment with the city from inside Slack (human always in the loop)
- Property/ownership lookup — who actually owns the parcel
- Zoning answers cited to the code section
- Story Radar — ranked story leads for reporters covering the beat
- Meeting video + speaker-attributed transcript deep links
- Watchlists, agenda-change / walk-on detection, escalation pings
- App Home dashboard

---

## Submission checklist

- [ ] Project **name**: `Gavel` — keep it. (It's a real word, civic, memorable — not a generic AI name.)
- [ ] **Tagline** — one line, benefit-first. Prompt: *"finish this sentence: Gavel tells your neighborhood
      ______ before ______."*
- [ ] Description written **in your voice** (not this file, not an LLM)
- [ ] **Architecture diagram** uploaded via the Devpost **file upload field** — NOT the image carousel.
      File: `docs/architecture/three-memory-architecture.png`
- [ ] Video **public** — check in an incognito window, logged out
- [ ] Video uploaded **with 24h to spare**
- [ ] Judges have **Member** access (not Guest): `slackhack@salesforce.com`, `testing@devpost.com`
- [ ] Testing instructions → `docs/JUDGE-TESTING.md`
