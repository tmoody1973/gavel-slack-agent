# Gavel — 3-Minute Demo Script (MOO-62)

_Recording-ready shot list. Grounded in the **live deployed app** + the cached assets made during the
2026-06-21 dry-run (see `docs/DEMO-DRY-RUN.md`). Target ≤ 3:00, **wow by 0:60**, open on the unprompted
alert — never a question typed at a bot._

## The through-line: one real story (decided 2026-06-21)

Instead of the brief's multi-item placeholder tour, the whole demo rides **one real, fully-seeded
thread** — which is tighter to follow and 100% honest:

> **File #260229** — a liquor license for **Punta Cana** at **2000 S 13th St**, in front of the
> **Licenses Committee** — on a property that is **zoned RT4 (residential)**, owned by **SHAAN REAL
> ESTATE INC**, with an **open code violation** — and the **#clarke-square** neighborhood (Spanish-
> preference) had **already organized about it in their own channel**.

Every beat is real and verified: the parcel (live MPROP), the zoning answer (live RAG), the community
thread (seeded, disclosed), the bilingual card (native ES — it's a Spanish channel), the video clip
(real Granicus footage, pre-cut). The tension — *a bar license on residential-zoned property the
neighbors opposed* — is a genuine civic-transparency story, not a contrived demo.

**Channel:** record in **#clarke-square** (ES). Bilingual is then native throughout, so the equity
beat is free.

---

## Pre-record checklist (cache every hero output — no live failures on camera)

- [ ] **Stage the alert** for #260229 in #clarke-square (the card "fires" on manual trigger — disclose). Have the bilingual EN/ES card with the "How to be heard" footer ready to drop.
- [ ] **Seed the RTS thread is already live** in #clarke-square (the Punta Cana opposition thread — Feb 2025, incl. *"We should show up. Last time a license like this went through with zero neighborhood input."*). Confirm RTS surfaces it (re-index lag ~20s).
- [ ] **Cache the parcel card:** `node scripts/parcel-card-verify.mjs '2000 S 13th St'` → SHAAN REAL ESTATE INC · RT4 · open violation · 5 units · 1884. Screenshot.
- [ ] **Cache the zoning answer:** `node scripts/zoning-answer-verify.mjs` (case: 2000 S 13th St) → RT4 = two-family residential; a tavern is not by-right. Screenshot.
- [ ] **Clip is posted:** 90s hero clip already in #clarke-square (`demo-assets/hero-clip-260229-punta-cana-revocation.mp4`, ▶ at 16288s). Confirm it plays inline.
- [ ] **Agenda-change pair** staged (draft→final) for the "added late" procedure beat (disclose — staged if no live walk-on).
- [ ] **Architecture diagram** open (MOO-61, PR #25) for beat 8.
- [ ] **Canvas** (`/gavel help` → 📖 Full guide) reachable if you want a B-roll flash of the guide.
- [ ] Screen at 1280×720+, Slack zoom up one notch for legibility, notifications silenced.

---

## Beat-by-beat (≈3:00)

| # | Time | On screen | Voiceover (say this) | Real / cached |
|---|------|-----------|----------------------|---------------|
| **1 Hook** | 0:00–0:10 | Tarik on camera, printed agenda packet | "I'm a Milwaukee City Plan Commissioner. This is one week of city government — and almost nobody finds out in time." | live, on-camera |
| **2 Unprompted alert** | 0:10–0:28 | #clarke-square: Gavel's Block Kit card posts on its own — File #260229, plain-English + Spanish, *"How to be heard"* footer visible | "Gavel posts this **before** the vote — not a chatbot you have to ask. A new liquor license at 2000 South 13th, in plain English and Spanish, with when and how to speak up." | summary/card **real**; alert fired on manual trigger *(disclose)* |
| **3 RTS wow** | 0:28–0:48 | In-thread: *"didn't we already raise this?"* → Gavel surfaces the channel's **own Feb-2025 thread** beside the matter record | "And it remembers what **this** neighborhood already said — their own words, from months ago, next to the official record. Gavel never stores those messages; it queries them live." | **real** RTS query over seeded thread *(thread disclosed as staged)* — **the wow, by 0:48** |
| **4 Parcel intel** | 0:48–1:05 | Parcel card for 2000 S 13th St: SHAAN REAL ESTATE INC · **RT4** · **open violation** | "Who's behind it? Gavel pulls the property record — owner, and the land is zoned **RT4, residential** — with an open code violation already on file." | **real** (live MPROP) |
| **5 Zoning RAG** | 1:05–1:22 | Ask: *"what does RT4 allow here?"* → answer cites code sections | "So Gavel asks the zoning code: RT4 is **two-family residential** — a tavern isn't by-right here. That's the question the neighborhood deserves to ask before the vote." | **real** (live zoning RAG) |
| **6 Equity + procedure** | 1:22–1:40 | Highlight the ES card; voiceover the agenda-change flag | "This card is in Spanish because this channel is — written natively, not translated. And Gavel caught that this item was **added to the agenda late**." | bilingual **real**; agenda-change logic real, runs on a staged draft/final pair *(disclose)* |
| **7 Video clip** | 1:40–2:00 | The 90s clip plays inline in-channel | "A four-hour licenses meeting. Gavel hands you the 90 seconds about the bar on your block — the real quote, with a one-click jump to the footage." | **real** footage, pre-cut *(disclose)* |
| **8 Architecture** | 2:00–2:30 | Three-memory diagram; RTS / MCP / AI callouts | "Three memories, one agent: the official record, the public spoken record, and the community's own — *indexes the public record, queries the private record live.* That ToS-aware design is why this works." | diagram |
| **9 Impact close** | 2:30–3:00 | Back to camera / logo | "Works in any of 300-plus Legistar cities. The Milwaukee Civic MCP server is open source today. Built by a Plan Commissioner — for every neighborhood that finds out too late." | live |

---

## Real vs. cached (for honest disclosure in the Devpost text)

| Real | Cached / staged (disclosed) |
|---|---|
| Parcel/MPROP lookup, zoning RAG, RTS query, bilingual generation, the matter record, the video footage | The alert "fires" on a manual trigger during recording |
| Bilingual EN/ES is live Claude output | The #clarke-square community thread is real content posted now, dated as 2024–25 (Slack can't backdate) |
| Agenda-change detection is real version-diff logic | If no live walk-on in the window, the diff runs on a staged draft/final pair |
| The 90s clip is genuine Granicus footage | Pre-cut with ffmpeg, not generated live |

---

## One open editorial choice — Beat 7 clip

- **On-thread (recommended):** the **#260229 / Event 13632** clip already posted in #clarke-square — keeps the single story, but the speaker is role-labeled ("the chair / committee staff") because the revocation hearing had messy audio.
- **Cleaner named alternative:** the **13441 / Ald. Bauman** clip (`demo-assets/hero-clip-13441-bauman-hopkins-st.mp4`) — a *named* alderman + clean audio, but a different matter (breaks the one-story thread).

Recommendation: stay **on-thread (13632)** for cohesion; mention named-speaker attribution as a capability in Beat 8 rather than switching matters mid-story. Swap to Bauman only if you want a named-alderman flash.
