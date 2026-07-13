# Gavel — Recording Script (one spine, ≤3:00)

_Teleprompter cut. Read this out loud. **Reverified against live Legistar + news on 2026-07-13.**_
_Shot list: `DEMO-CAPTURE-PLAN.md`. Full reference: `DEMO-SCRIPT.md`._

> **⚠️ v4 — THE STORY CHANGED. This is the true one.**
> The old script said *"a data center wants to move in, the vote is in 8 days."* **That is now false.**
> On **July 6–8** the developer **dropped the data center** from the Midtown plan after a 7-hour hearing
> and sustained resident pushback (Urban Milwaukee, WISN, TMJ4, Business Journals, Milwaukee Record).
> **The residents won.** That is a *better* story, and it's the one you tell.
> Still live and still on the **July 20** agenda: the redevelopment itself, and **#260142 — the citywide
> rules for data centers.** So "be heard before the vote" is still literally true.

**The spine:** `alert → understand → act.` **One persona: the resident.** **Wow by 1:00.**
**Never** type a question at a bot before the alert has fired.

---

## COLD OPEN — camera · 0:00–0:25

> **City Hall publishes everything.**
> **Nobody reads it.**
> **The vote happens. You find out after.**
>
> I know. I sit on Milwaukee's City Plan Commission.
>
> This spring, a data center was headed for a vacant Walmart — **right next to people's homes.**
> And the city's own filing **never called it a data center.**
> It called it a **"computational research facility."**
>
> The neighborhood figured it out anyway. They packed a **seven-hour hearing.**
> And two weeks ago — **the developer dropped it.**
>
> **They won.**
>
> But they had to do all of it **in the dark.** Gavel is so the next block doesn't have to.

**Direction:** hammer the first three lines. **Pause after "computational research facility."** Pause
again after **"They won."** Product named only at the very end.

---

## BEAT 1 — The alert arrives, unprompted · 0:25–0:47

*(Screen: `#general`. The Block Kit card is already there. **Hands off the keyboard.**)*

> This is not a chatbot. **Nobody asked it anything.**
>
> Gavel watches the city's agenda system. It posts in plain English — **and in Spanish**, because that's
> who lives on this block.
>
> What it is. Why it matters. **When the hearing is, and how to speak at it.**
>
> And it pulls the local reporting right onto the card — *residents push back… commission punts…*
> **"Redevelopment drops data center plan."** The whole fight, on one card, **before** you have to go
> looking for it.

**Real:** card · bilingual summary · news block (3 gated, real headlines) · hearing footer.
**Disclose:** the alert fires on a manual trigger while recording (5-minute cron in production).

---

## BEAT 2 — ⭐ THE WOW: it knows what *this* block already said · 0:47–1:09

*(Screen: open a thread on the card. Type the **opposition-framed** question — this is critical.)*

**Type:** `Didn't we already push back on this?`

> And it knows what **this neighborhood** already said — **in their own words** — right next to the
> city's official filing.
>
> Gavel queries those messages **live, through Slack's Real-Time Search API — and never stores them.**
> Your neighbors' conversations are **not a training set.** That's a design decision, and it's the reason
> this is safe to put in a real community's Slack.

**Real:** live RTS. **Disclose:** the neighbor thread is real, documented sentiment (NNS/WTMJ/CBS58),
posted fresh because Slack can't backdate.

---

## BEAT 3 — ⭐ THE MONEY SHOT: what they called it · 1:09–1:40

*(Screen: ask `Who owns 5825 W Hope Ave?` → parcel answer. Then **scroll to the video clip and press
play.**)*

> Residents asked one question for months: **who is actually behind this?** Nobody would say.
>
> Gavel just answers it — it pulls the property record live. **AFS Milwaukee, LLC.**
>
> And then there's **what they called it.**
>
> *(**press play — then be quiet and let it run**)*
>
> **▶ [the commission reads it into the record]**
>
> A **"computational research facility."**
>
> **Milwaukee publishes video of these meetings. It does not publish transcripts.** So what gets said in
> that room is, in practice, **unsearchable.** Gavel transcribed it, found the moment, and clipped it.
>
> **You cannot fight a thing that nobody will call by its name. Gavel doesn't need you to know the name.**

**Real:** live property record; a real Deepgram-diarized transcript of the **June 29 City Plan
Commission** (EventId 13556); a real MP4 cut from the webcast, playing inline in Slack.

**⚠️ SAY IT ACCURATELY:** *"Gavel clipped this moment out of the webcast"* — **true.** Do **NOT** imply the
agent generated it live on request. It was posted ahead of recording. (`clip_video_moment` ships and is
tested, but Granicus 403s our cloud host's IP for media, so in production it degrades to a timestamped
deep link — which is what an honest agent does.)

---

## BEAT 4 — The fight isn't over · 1:40–1:54 — **cut this first if you run long**

> They beat the data center on **their** block. But on **July 20**, the city is writing the **rules for
> data centers everywhere in Milwaukee** — file **#260142** — and it's on the **same agenda** as this site.
>
> **That vote is still coming. Most of the city has no idea.**

**Real:** #260142 + #260029/#260030, July 20 City Plan Commission agenda, status Final.

---

## BEAT 5 — ⭐ ACT. The loop closes. · 1:54–2:22

*(Screen: a neighbor asks **in Spanish** → Gavel answers **in Spanish**. Then click **✍️ Make my voice
heard**.)*

> Knowing isn't enough. **You have to be able to answer back.**
>
> A neighbor asks in Spanish — Gavel answers in Spanish. Not translated. **Written in Spanish.**
>
> Then it drafts her public comment — **in her words, her position** — ready to file with the city before
> the hearing. She edits it. She sends it. **A human is always in the loop.**
>
> **That's the whole point. Information becomes action.**

**Real:** bilingual generation + the comment draft.
**⚠️ Say out loud:** *"in this demo it goes to a test inbox — never a real city clerk."*

---

## BEAT 6 — Why it's built this way · 2:22–2:42

*(Screen: the architecture diagram.)*

> Three memories, one agent. The **official record** — a custom MCP server over Milwaukee's Legistar and
> property data. The **public spoken record** — meeting transcripts and the zoning code. And the
> **community's own memory** — live, through Slack's Real-Time Search.
>
> **It indexes the public record. It queries the private one live, and never stores it.**
>
> Take Real-Time Search away and Gavel either goes **deaf to its own neighborhood** — or it starts
> **warehousing people's messages.** That's not a feature I bolted on. **It's the reason the architecture
> is shaped like this.**

---

## CLOSE — camera · 2:42–3:00

> That neighborhood won because a handful of people **worked out what a "computational research facility"
> was**, and showed up.
>
> **Most blocks don't get that lucky.** They find out after.
>
> Milwaukee runs on Legistar. So do **three hundred other cities.** The Milwaukee Civic MCP server is
> **open source today.**
>
> I sit on the commission that votes on this. I watch people find out **after**.
>
> **Gavel is how they find out before.**

---

## Say-it-out-loud disclosures (honesty scores — it does not cost you)
1. The alert fires on a **manual trigger** during recording (5-minute cron in production).
2. The neighbor thread is **real documented sentiment, posted fresh** — Slack can't backdate.
3. The public comment goes to a **test inbox, never a real clerk.**
4. **Gavel cut the clip** — but it was posted **ahead of recording**, not generated live on request.

## What is NOT in this video (on purpose)
Story Radar · watchlists · Sunday digest · App Home · civic-mail digest · the video browser.
They all ship. One line each in the **Devpost text**. **The video proves one spine.**

## Never cut
**Beat 2 (RTS)** · **Beat 3 (the clip)** · **Beat 5 (act).** Cut Beat 4 first, then trim Beat 6.
