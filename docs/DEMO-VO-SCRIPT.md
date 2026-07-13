# Gavel — Recording Script (one spine, ≤3:00)

_Teleprompter cut. Read this out loud. Reverified against live Legistar **2026-07-12**._
_Full reference/shot list: `DEMO-SCRIPT.md`. This file is what you **read while recording**._

**The spine, and nothing else:** `alert → understand → act.`
**One persona: the resident.** (Reporters/Story Radar go in the Devpost text, not the video.)
**Wow by 0:50.** **Never** type a question at a bot before the alert has fired.

---

## COLD OPEN — lead with the pain, not your name (0:00–0:18)

> **City Hall publishes everything.**
> **Nobody reads it.**
> **The vote happens. You find out after.**
>
> I know, because I sit on Milwaukee's City Plan Commission.
>
> Right now, a data center wants to move into a vacant Walmart — next to people's homes.
> Residents still can't find out who's behind it.
> And this thing **keeps coming back.** It got pulled once. It got held once.
> **It's back in eight days**, and almost nobody on that block knows.
>
> Gavel makes the record come to you. **Before** the vote.

*(On screen: you, on camera. No slides, no stack, no logo yet.)*

**Why this works:** three hammer sentences = the universal problem. Commissioner line = you're not a
bystander, you're inside the room. Then the stakes, then the promise. Product named at 0:18, not 0:02.

---

## BEAT 1 — The alert arrives, unprompted (0:18–0:40)

*(On screen: the demo channel. Gavel's Block Kit card posts **on its own**. Don't touch the keyboard.)*

> This is not a chatbot. **Nobody asked it anything.**
>
> Gavel watches the city's agenda system, and the moment this hit the July 20 Plan Commission agenda,
> it posted — in plain English, and in Spanish, because this is a Spanish-speaking block.
>
> What it is. Why it matters. **When the hearing is, and how to speak at it.**
>
> And look — it pulled the local reporting onto the card. *The Journal Sentinel: "Big crowd demands
> answers." Urban Milwaukee: "It's not a data center, developer says."* **The neighborhood's own
> question, right on the alert.**

**Real:** card, summary, bilingual, news block, hearing footer. **Disclose:** the alert fires on a manual
trigger during recording (it's a 5-minute cron in production).

---

## BEAT 2 — THE WOW: it remembers what *this* block already said (0:40–1:02)

*(In-thread. Ask the **opposition-framed** question — this is critical, fact-framed queries surface the
city's filing instead of the residents' voices.)*

**Type:** `Didn't we already push back on this?`

> And it knows what **this neighborhood** already said — in their own words — right next to the city's
> official filing.
>
> Gavel queries those messages **live, through Slack's Real-Time Search API — and never stores them.**
> Your neighbors' conversations are not a training set. That's a design decision, and it's the reason
> this is safe to put in a real community's Slack.

**Real:** live RTS query. **Disclose:** the community thread is real sentiment (paraphrased from
NNS/WTMJ/CBS58 reporting), posted now because Slack can't backdate.

---

## BEAT 3 — Who's behind it, and what they're calling it (1:02–1:36) ⭐ THE MONEY SHOT

*(Parcel card: **AFS MILWAUKEE LLC · RB2 · $3.5M · open building violation**. Then scroll to the
**video clip already sitting in the channel** and press play.)*

> Residents have been asking one question for months: **who is actually behind this?** The city wouldn't
> say. It made the news.
>
> Gavel answers it. It pulls the property record live: **AFS Milwaukee, LLC.** Zoned **RB2** — which
> does **not** permit this by right, so they're asking the city for a **deviation** — and the building is
> already carrying an **open violation.**
>
> And here's the part that tells you everything.
>
> **The city's filing never says "data center."**
>
> *(**hit play on the clip in the channel** — it starts at 24:15 of the June 29 webcast)*
>
> **▶ [let the clip play — the commission reads it into the record]**
>
> It calls it a **"computational research facility."**
>
> **Milwaukee publishes video of these meetings. It does not publish transcripts.** So what gets said in
> that room is, in practice, unsearchable. **Gavel transcribed it, found the moment, and clipped it — and
> it plays right here in Slack.**
>
> **You can't search for a thing when nobody will call it by its name. Gavel doesn't need you to know
> the name.**

**Real:** the footage is genuine — an actual MP4 of the **June 29 City Plan Commission**, cut from the
Granicus webcast at the exact second by **Gavel's own clipping pipeline**, playing inline in Slack
(`files.uploadV2`), backed by a real Deepgram-diarized transcript (EventId 13556).

**⚠️ SAY IT ACCURATELY.** Gavel *cut* this clip — but it was **posted ahead of the recording**, not
generated live in response to a question. The `clip_video_moment` tool is built, tested and deployed, but
**Granicus 403s our cloud host's IP for media files** (verified: 403 from Fly, 206 from a residential IP —
every header combination), so in the deployed app it **degrades to a timestamped deep link**. That
degrade is real and it's in the video's favour — it's what an honest agent does.

- ✅ Safe to say: *"Gavel clipped this moment out of the webcast."* — true.
- ❌ Do **not** say or imply: *"watch Gavel generate this clip live for me right now."* — it didn't.

**Direction:** let the clip play. **Do not talk over it.** Then land "computational research facility"
and **pause.** This is the beat a judge repeats to another judge.

**Pre-flight:** the clip is already posted in `#general` — `gavel-clip-13556-1455.mp4`, *"CITY PLAN
COMMISSION — moment at 00:24:15."* Confirm it plays inline before you roll.

---

## BEAT 4 — The dots nobody connected (1:36–1:48) — **cut this first if you run long**

*(Both file numbers, same agenda.)*

> Here's what nobody caught. On that **same agenda**, fifteen minutes earlier, the city is writing the
> **citywide rules for data centers** — and then voting on **this one.**
>
> **Two votes. One meeting. One neighborhood.** Gavel surfaced both, because it reads the whole agenda —
> not just the item you already knew to look for.

**Real:** live agenda #260142 (citywide rule) + #260029 / #260030 (this site), July 20, status Final.

---

## BEAT 5 — ACT. The loop closes. (1:48–2:16)

*(A neighbor replies **in Spanish**. Gavel answers in Spanish. Then click **✍️ Make my voice heard**.)*

> Knowing isn't enough. **You have to be able to answer back.**
>
> A neighbor asks in Spanish — Gavel answers in Spanish. Not translated. **Written in Spanish.**
>
> And then it drafts her public comment — **in her words, her position** — and files it with the city
> before the hearing. She edits it. She sends it. **A human is always in the loop.**
>
> Information becomes **action**. That's the whole point.

**Real:** bilingual generation + the comment draft. **Disclose on screen and out loud:** in this demo the
comment goes to a **test inbox, never a real city clerk.**

---

## BEAT 6 — Why it's built this way (2:12–2:34)

*(Architecture diagram.)*

> Three memories, one agent. The **official record** — a custom MCP server over Milwaukee's Legistar and
> property data. The **public spoken record** — meeting transcripts and the zoning code. And the
> **community's own memory** — live, through Slack's Real-Time Search.
>
> **It indexes the public record. It queries the private one live, and never stores it.**
>
> Take Real-Time Search away and Gavel either goes deaf to its own neighborhood — or it starts
> warehousing people's messages. **That's not a feature I bolted on. It's the reason the architecture
> is shaped like this.**

---

## CLOSE (2:34–3:00)

> A neighborhood that was going to find out too late now shows up. **In any language.**
>
> Milwaukee runs on Legistar. So do **three hundred other cities** — Gavel points at any of them by
> changing one string. The Milwaukee Civic MCP server is **open source today.**
>
> I sit on the commission that votes on this stuff. I watch people find out **after**.
>
> **Gavel is how they find out before.**

---

## Pre-flight (do these before you hit record)

- [ ] **Judges invited as Members** — `slackhack@salesforce.com`, `testing@devpost.com`
- [ ] RTS opposition thread seeded in the demo channel (paraphrased real sentiment, not invented outrage)
- [ ] Alert card ready to trigger; parcel + zoning answers spot-checked
- [ ] Notifications silenced · Slack zoom +1 · screen ≥1280×720
- [ ] **Rehearse twice out loud with a timer.** If you're over 3:00, cut Beat 4 (the dots) — it's the
      most compressible. Never cut Beat 2 (RTS) or Beat 5 (act).

## Say-it-out-loud disclosures (honesty is a scoring asset, not a tax)
1. The alert fires on a manual trigger during recording (production = 5-min cron).
2. The community thread is real sentiment, posted now — Slack can't backdate.
3. The public comment goes to a **test inbox**, never a real clerk.

## What is NOT in this video (on purpose)
Story Radar · watchlists · Sunday digest · App Home · civic-mail digest · the full video browser.
They all ship. They live in the **Devpost text**, one line each. **The video proves one spine.**

*(The meeting transcript appears only as the one receipt in Beat 3 — as evidence for the story, not as
a feature tour. Don't demo `/gavel video`.)*
