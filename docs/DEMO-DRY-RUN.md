# Demo Dry-Run — beat-by-beat readiness (2026-06-21)

_Walked the brief's 8-beat demo script (§11) against `main` @ `c01922d` and the live deployed
`gavel-app`. Goal: turn weak/cached/broken spots into a punch-list before recording **MOO-62** (the
P0 3-min demo video). This is a readiness audit from code + seeded data + deploy health — items
marked **[CLICK]** still need a manual Slack walk-through I can't do from here._

## Verified green
- **All 8 beats' features are merged to `main`** (parcel, zoning RAG, transcripts/video, bilingual,
  agenda-change, RTS, dossier, bridge). The open `moo-110/112/55/113/61` worktrees are stale
  leftovers of merged PRs — features are live, not stranded.
- **`gavel-app` is deployed and healthy** — `[INFO] bolt-app Gavel is running!` at 13:05 UTC,
  active Slack events at 13:10. Socket Mode connected.
- **Demo corpus seeded** — 3 channels: `#sherman-park` (en/d7), `#lindsay-heights` (en/d6),
  `#clarke-square` (es/d12), each with plausible 2024–25 RTS history (disclosure pinned).

## 🔴 The headline finding — the hero item is NOT what the brief says

The brief's script uses a **placeholder** hero ("2700 W Wisconsin, RT4→commercial rezone"). The
**actually-seeded real hero matter** is:

> **Punta Cana LLC** · liquor license · **2000 S 13th St** · **File #260229** · Licenses Committee
> — with **EN + ES opposition history seeded in `#clarke-square`** (the corpus is intentionally
> built so community-memory search surfaces this thread; see `agent/sandbox/corpus.js`).

Beats 2–6 are deliberately wired around #260229 and land cleanly. **Action: rewrite the demo
script around #260229** (it's real Legistar data and fully seeded) rather than the placeholder.
A nice bonus: because the hero history lives in the ES channel, the **RTS + bilingual + community-
memory beats naturally fuse on one real matter**.

## 🔴 Beat 7 (video clip) is the one broken link in the through-line

Only **two meetings are transcribed/searchable**: **13441** (ZONING) and **13370** (Community &
Economic Development). The hero matter **#260229 is Licenses Committee → no transcript**. So
"*what did the alderman say about [the hero item]?*" cannot use the hero item — the single-story
spell breaks exactly at the receipt beat (the Best-Technical-Implementation pitch).

**✅ RESOLVED — hero meeting transcribed; Beat 7 lands on the hero item.** File #260229 → Matter
74127 → **Event 13632** (Licenses Committee, 2026-06-09), `EventMedia 5194`, public video. The hero
item sits at **video index 16288s (~4h32m)** — a contested revocation held until the end — so a
targeted segment was ingested (`scripts/transcript-ingest-segment.mjs 13632 15800 16403`, timestamps
offset to absolute). 16 chunks now live in Convex; `search_transcripts` returns the real receipt at
`▶ clip_id=5194&starttime=16288` ("…revocation of class b tavern … 2000 South 13th Street … Punta
Cana…"). Speaker stays role-labeled (no alderman confidently named in the messy-audio hearing — the
conservative gate). Outcome per transcript: the license was **surrendered/revoked**.

## 🟡 Beat 7 also needs MOO-143 (speaker naming) to be publishable

Without MOO-143 the receipt reads "**Speaker 2** said…" but the script promises "*what did the
**alderman** say*." MOO-143 maps Deepgram speakers → `councilMembers` so the receipt reads
"**Alderman X** said…" — the journalist's whole payoff. The dry-run and the handoff converge here:
**the highest-value remaining build (MOO-143) + transcribing the hero meeting both serve Beat 7**,
the demo's one weak link.

## Beat-by-beat punch-list

| # | Beat | Status | Action |
|---|------|--------|--------|
| 1 | Hook (on-camera) | ✅ human | none |
| 2 | Unprompted alert + "How to be heard" footer + Watch/History/Ask buttons | ✅ built; alert "fires" on manual trigger (disclosed) | **[CLICK]** stage the #260229 alert in `#clarke-square`; confirm footer + 3 buttons render. `scripts/alert-verify.mjs` |
| 3 | RTS wow ("didn't we oppose this?") + MCP prior record | ✅ seeded around #260229 | **[CLICK]** confirm RTS surfaces the Punta Cana thread + MCP returns File #260229 record |
| 4 | Parcel intelligence (ownership portfolio, permit, `/gavel watch`) | ✅ built | **[CLICK]** confirm 2000 S 13th St ownership/permit returns; `/gavel watch` adds LLC. `scripts/parcel-card-verify.mjs` |
| 5 | Zoning RAG ("what could they build?") parcel-conditioned + citations | ✅ built | confirm zoning namespace ingested; `scripts/zoning-answer-verify.mjs` |
| 6 | Equity + procedure — bilingual ES card in `#clarke-square` + agenda-change | ✅ built; **ES copy wants native-speaker review** (standing) | **[CLICK]** confirm bilingual render; stage a draft/final pair for the walk-on diff if no live walk-on |
| 7 | Video clip ("what did the alderman say?") + inline 90s clip | ✅ hero item (13632) transcribed + searchable; speaker naming (MOO-143) live | pre-cut + cache the 90s clip at 16288s; speaker is role-labeled (revocation hearing, no named alder) |
| 8 | Architecture (three-memory diagram) | ✅ MOO-61 | confirm diagram is final/exported |
| 9 | Impact close (narration) | ✅ human | none |

## Standing submission items (human-driven, not blockers to recording)
- **MOO-62** — the 3-min demo video itself (P0). Cache every hero beat (wow-fail backup).
- **MOO-63** — Devpost writeup + grant judge sandbox access to `slackhack@salesforce.com`
  and `testing@devpost.com`.
- **ES native review** of bilingual copy (originally MOO-43) — now demo-critical since the hero
  story runs through the ES channel.
- **Dossier `dossier_watch` / `dossier_send`** — unit-tested, never clicked live (trigger-latency risk).

## Recommended next concrete step
Make Beat 7 whole on the hero item: **(1)** check whether #260229's Licenses Committee meeting has
Granicus video and transcribe it, then **(2)** build **MOO-143** so the receipt names the alderman.
That single thread closes the one gap in an otherwise end-to-end-wired single-story demo.
