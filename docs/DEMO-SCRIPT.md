# Gavel — 3-Minute Demo Script v2 (MOO-62) · The Midtown Data Center

_Recording-ready shot list. Target ≤ 3:00, **wow by 0:60**, open on the unprompted alert — never a
question typed at a bot._

> **v2 pivot (2026-06-23):** replaces the Punta Cana liquor-license story with the **Midtown data
> center** — more topical (data centers are the 2025–26 national civic flashpoint), higher stakes, and
> the vote is **real and imminent (June 29)** so "before the vote" is literal. The fully-verified Punta
> Cana script is preserved as the fallback at `docs/DEMO-SCRIPT-fallback-puntacana.md` — do **not**
> delete it until v2 is recorded.

## The through-line: one real story, a vote 6 days out

> **AFS Milwaukee LLC** wants to put a **data-processing facility** in the **former Walmart at 5825 W
> Hope Ave** (Midtown, NW side — vacant since 2016). The site is zoned **RB2** with an **open building
> violation**. Residents have pushed back hard — the item was **pulled from the May 18 Plan Commission
> agenda** amid opposition, and a **June 22 WTMJ story** asked *"who's behind AFS Milwaukee LLC?"* On
> the **June 29 City Plan Commission** agenda, the city is **writing the citywide data-center rules
> (File #260142) AND deciding this exact site (#260029 / #260030) back to back.** Gavel surfaces all of
> it — before the vote.

**Why it beats a liquor license:** a judge gets the stakes in two seconds (a data center next to homes,
and nobody will say who owns it), the procedural beat is **real and news-documented** (not staged), and
the parcel beat answers the **literal question in yesterday's headline**.

### The problem, in residents' own words (real, verified — use for the hook + the RTS seed)

The honest framing is **not** "they found out after the vote" — residents here mobilized and got the item
**pulled**. The real grievance is that **they were never given enough information and still can't find out
who's behind it**, and they don't trust a process moving without them. That is exactly the gap Gavel
closes: early, plain-language, who-owns-it transparency before the vote.

- **Ald. Mark Chambers** (district rep, on why it was pulled): residents "have not received nearly enough information about this proposal."
- **Mabel Lamb**, exec director, Sherman Park Community Association: "People want to know everything... they should be allowed to ask questions and have some clarity."
- A resident at the community meeting: "it's hard to trust... the process." Another: "This is a no go for us."
- The core opacity: officials repeatedly declined to **name the company** behind the facility → the WTMJ June 22 headline, *"who's behind it?"* (Gavel answers it: **AFS Milwaukee LLC**.)

**Verified real (2026-06-23):**
- Legistar June 29 **City Plan Commission** (EventId 13556), agenda status **Final** → Gavel's poller catches it for real.
  - **#260142** — *"A substitute ordinance relating to the building of data centers"* (citywide rule, 1:45 PM hearing)
  - **#260029** — *"…deviation from the performance standards established by the Midtown Center…"* (2:00 PM)
  - **#260030** — *"…changes to the site and existing building previously occupied by Walmart located at 5825 [W Hope Ave]"*
- Parcel (live MPROP, `node scripts/parcel-card-verify.mjs '5825 W Hope Ave'`): **Owner AFS MILWAUKEE LLC · Zoning RB2 · District 2 · Assessed $3,511,700 · 161,022 sq ft · open building violation.**

**Channel:** record in a Midtown / **#sherman-park** channel (English-preference). Bilingual is shown via
the **per-thread language override** (a resident asks in Spanish, Gavel answers in Spanish in the same
thread) — a sharper Design beat than a pre-set Spanish channel.

---

## Pre-record checklist (stage every hero output — no live failures on camera)

- [ ] **Subscribe the demo channel** to the City Plan Commission / Zoning committee + keyword `data center` so the alert is real.
- [ ] **Stage the alert** for #260030 in the demo channel (card "fires" on manual trigger — disclose). Bilingual EN card + "How to be heard" footer ready to drop.
- [ ] **RTS opposition seed is live + verified** in the demo channel — top-level neighbor messages that mirror the **real, verified sentiment** (NNS/WTMJ/CBS58): *"who is AFS Milwaukee — why won't they say?"*, *"we still haven't gotten real answers"*, *"hard to trust this process"*, *"air, water, noise — and no jobs for us"*, *"this is a no-go for us"*, *"they pulled it once and it's back"*. (Seed faithful paraphrases of real public statements, not invented outrage.) **Critical: the wow question must be opposition/sentiment-framed** (*"did we already push back on this?"*) — fact-framed queries rank the official filing higher (memory `rts-query-framing`).
- [ ] **Cache the parcel card:** `node scripts/parcel-card-verify.mjs '5825 W Hope Ave'` → AFS MILWAUKEE LLC · RB2 · $3.5M · open violation. Screenshot.
- [ ] **Cache the zoning answer:** `node scripts/zoning-answer-verify.mjs` for 5825 W Hope Ave → does RB2 permit a data-processing facility, or is a deviation required? (spot-check before record).
- [ ] **Connect-the-dots:** confirm Gavel surfaces #260142 (citywide rule) and #260029/#260030 (this site) on the same June 29 agenda.
- [ ] **Agenda-pull proof:** the item was pulled from the May 18 agenda — confirm Gavel's version-diff shows the removal/return, or stage the draft/final pair (disclose).
- [ ] **Document receipts:** confirm #260029/#260030 have a staff-report PDF attachment Gavel can read (`?Attachments=1`); cache the summarized "what the staff report says."
- [ ] **[If shipped] Statement tool:** the submit-a-comment flow drafts a bilingual public comment for #260030 and sends to a **test inbox** (never the real clerk) — disclose. + "📅 Add to calendar" deep link for the June 29 hearing.
- [ ] **Architecture diagram** open (MOO-61) for the architecture beat.
- [ ] Screen at 1280×720+, Slack zoom up one notch, notifications silenced.

---

## Beat-by-beat (≈3:00)

| # | Time | On screen | Voiceover (say this) | Real / staged |
|---|------|-----------|----------------------|---------------|
| **1 Hook** | 0:00–0:14 | Tarik on camera | "I'm a Milwaukee City Plan Commissioner. A data center wants to move into a vacant Walmart next to people's homes. Residents say they were never given enough information — they still can't even find out who's behind it — and the vote is in six days. This is the problem Gavel exists for." | live, on-camera |
| **2 Unprompted alert** | 0:12–0:30 | Demo channel: Gavel's Block Kit card posts on its own — File #260030, plain English, *"How to be heard"* footer | "Gavel posts this **before** the vote — not a chatbot you ask. A data-processing facility at the old Walmart on Hope Ave, in plain language, with when and how to speak up." | summary/card **real**; alert fired on manual trigger *(disclose)* |
| **3 RTS wow** | 0:30–0:50 | In-thread, ask an **opposition-framed** question — *"didn't we already push back on this?"* → Gavel surfaces the channel's own words beside the official record | "And it remembers what **this** neighborhood already said — their own words, next to the city's filing. Gavel queries those messages live and **never stores them.**" | **real** RTS query over the seeded thread *(thread disclosed as staged)* — **the wow, by 0:50** |
| **4 Ownership intel** | 0:50–1:08 | Parcel card for 5825 W Hope Ave: **AFS MILWAUKEE LLC · RB2 · $3.5M · open violation** | "Who's behind it? Gavel pulls the property record live — owner **AFS Milwaukee LLC**, the exact name residents can't get answers about. Zoned **RB2**, already carrying an open building violation." | **real** (live MPROP) |
| **5 Zoning + connect-the-dots** | 1:08–1:28 | Zoning answer for RB2; then both file numbers on the June 29 agenda | "RB2 doesn't allow this by right — they're asking the city for a **deviation**. And Gavel caught the bigger picture: the same meeting is **writing the citywide data-center rules** 15 minutes earlier. Two votes, one agenda, one neighborhood." | **real** (zoning RAG + live agenda #260142 / #260029) |
| **6 Procedure (real)** | 1:28–1:42 | Agenda-change flag: pulled from the May 18 agenda | "This already got **pulled from the agenda once** after residents objected. Gavel tracks the procedure — what's added late, what disappears, what comes back." | agenda-diff logic **real**; news-documented removal |
| **7 Action — submit your comment** | 1:42–2:08 | A resident replies **in Spanish**; Gavel drafts a bilingual public comment for #260030; resident confirms; "✅ filed" + 📅 calendar | "And Gavel closes the loop. A neighbor asks in Spanish — Gavel answers in Spanish — and **drafts her public comment, in her words**, ready to file with the city before the hearing. Information becomes action." | bilingual **real**; comment send to a **test inbox** *(disclose)* — *requires statement tool (see spec)* |
| **8 Architecture** | 2:08–2:32 | Three-memory diagram; RTS / MCP / AI callouts | "Three memories, one agent: the official record, the public spoken record, and the community's own — *it indexes the public record and queries the private one live.* That ToS-aware design is why this works." | diagram |
| **9 Impact close** | 2:32–3:00 | Back to camera / logo | "A neighborhood that was going to find out too late now shows up — in any language. Works in 300-plus Legistar cities; the Milwaukee Civic MCP server is open source today. Built by a Plan Commissioner, for every block that deserves a say." | live |

**Fallback if the statement tool isn't built by record day:** collapse Beat 7 to the bilingual thread
answer + the "How to be heard" footer + the 📅 calendar deep link (still a real action beat), and give
the reclaimed ~15s to the impact close.

---

## Real vs. staged (for honest disclosure in the Devpost text)

| Real | Staged / cached (disclosed) |
|---|---|
| Legistar items #260142 / #260029 / #260030 on the Final June 29 agenda; parcel/MPROP (AFS MILWAUKEE LLC, RB2, open violation); zoning RAG; bilingual Claude generation; agenda-diff logic; (if built) the statement-tool draft + AgentMail send | The alert "fires" on a manual trigger during recording |
| The May 18 agenda removal is real and news-documented | The community thread is real content posted now, dated earlier (Slack can't backdate) |
| The statement tool drafts a genuine comment | The demo send goes to a **test inbox**, never the real city clerk |
| — | **No meeting video** (June 29 is in the future) → document receipts (staff-report PDF) stand in for the video-clip beat |

---

## Notes / open choices

- **Timing risk (flag honestly):** this item was pulled once and could slip again. If June 29 moves, the "before the vote" line wobbles — but a second postponement **is** the agenda-change story, so it partly self-heals. Keep the Punta Cana fallback recordable until v2 is in the can.
- **Bilingual home:** Midtown/Sherman Park isn't Spanish-preference, so Spanish rides the **per-thread override** (Beat 7) rather than a pre-set channel — a more dynamic Design demonstration of "respond in the language the user wrote in."
- **The citywide ordinance (#260142)** is an optional depth beat. Keep it in Beat 5 as the "connect-the-dots" line; don't spin it into its own story (protect the single-thread cohesion).
- **News (WTMJ June 22 "who's behind it?"):** curate the real link into the seeded context / Devpost rather than building a news tool (muddies the clean three-memory framing).
