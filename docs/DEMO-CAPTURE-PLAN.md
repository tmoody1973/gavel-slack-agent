# Gavel — Video Capture Plan (shot list) · v5

_Companion to `DEMO-VO-SCRIPT.md` (what you SAY). This is what you **capture**._
_Target ≤ 3:00. **Record each shot separately**, then assemble. Do NOT attempt one take._

> **v5 — SHOW THE AGENT WORKING.** This is an *agent* hackathon. Judges want to watch it think, not
> scroll through its leftovers. **Six of nine shots are now live agent work.** Two changes: the alert
> now **lands on camera** (it was pre-posted), and the clip beat now **leads with the agent finding the
> moment live** before you press play.

---

## ✅ Channel is reset and ready

`#general`, top → bottom: **6 neighbor messages** (so RTS has something to find) · **the alert card** ·
**the video clip**. Nothing else.

⚠️ You will **delete and re-fire** the alert card during SHOT 2. That's intentional.

---

## 🆕 What the agent looks like while it works

Every live shot shows the same three things. **Let them play — do not cut them out. This is the product.**

1. **`Thinking…`** with a rotating tool-trace: *"Reading the agenda…" · "Checking the property record…" ·
   "Searching the meeting transcript…" · "Pulling the local reporting…" · "Checking what the
   neighborhood already said…"*
2. **The answer streams in** word by word — not a canned block appearing all at once.
3. **Receipts appear underneath** — the sources it grounded on.

**Do not speed this up in the edit.** Judges are scoring agentic behaviour. This *is* the evidence.

---

## PART 0 — Pre-flight

| # | Task | Who |
|---|---|---|
| 0.1 | Second terminal open **off-camera**, ready to run the alert trigger (SHOT 2) | you |
| 0.2 | Confirm judges show **Member** (not Guest) — admin.slack.com → Users → Invitations | you |
| 0.3 | Slack **zoom +1**, sidebar collapsed, **Do Not Disturb ON** | you |
| 0.4 | Screen ≥1280×720, bookmarks bar hidden, everything else closed | you |
| 0.5 | `docs/architecture/three-memory-architecture.png` open in a tab | you |
| 0.6 | **Rehearse the VO twice with a timer.** Over 3:00 → cut SHOT 6. | you |

---

## PART 1 — The shot list

### 🎥 SHOT 1 — Camera: cold open · ~25s
- You, talking head. **No slides, no logo, no terminal.**
- Hammer the first three lines. **Pause** after *"computational research facility."* **Pause** after
  *"They won."*
- Product named only in the final line.

### 🖥️ SHOT 2 — ⭐ THE ALERT LANDS, LIVE · ~22s
**This is the thesis. Don't fake it — film it arriving.**
1. Start recording on `#general` (the neighbor conversation is the last thing visible).
2. **Off-camera**, second terminal: `cd agent && node scripts/demo-live-alert.mjs`
   → it preps, then prints **`SWITCH TO SLACK NOW. Posting in 5 seconds…`**
3. Cut to Slack and **film the card drop in.** **Hands off the keyboard.**
- **Show, in order:** headline → plain-English summary → **Spanish section** → `📰 In the local news`
  (three real headlines, ending *"Redevelopment Drops 'Data Center' Plan"*) → `🗣️ How to be heard` (July 20).
- **Disclose out loud:** *"the alert is manually triggered here so it fires on camera — in production it's a five-minute cron."*

### 🖥️ SHOT 3 — ⭐ THE RTS WOW (live) · ~22s
- Open a thread on the card. Type **exactly**: `Didn't we already push back on this?`
- **Let `Thinking…` run.** Let the answer **stream**. Let the receipts land.
- **Critical:** the question must be **opposition-framed.** A fact-framed one ("what is this item?")
  surfaces the city's filing instead of the residents' voices, and the beat dies.
- **Disclose:** the neighbor thread is real documented sentiment, posted fresh (Slack can't backdate).

### 🖥️ SHOT 4 — Who's behind it (live) · ~14s
- Same thread: `Who owns 5825 W Hope Ave?`
- Watch *"Checking the property record…"* → **AFS MILWAUKEE LLC** streams in.
- ⚠️ **Spot-check once before you roll.** If it doesn't render well, fall back to `/gavel search 5825 W Hope Ave`.

### 🖥️ SHOT 5 — ⭐ THE MONEY SHOT — live find, then press play · ~30s
**Two halves. The first is live. That's the fix.**
1. **LIVE:** ask in-thread: `What did the Plan Commission actually call it on June 29?`
   → watch *"Searching the meeting transcript…"* → the real quote **streams in**, with a timestamp and a
   ▶ link. **This is the agent doing the work, on camera.**
2. **THEN:** scroll to the clip and **press play. Be quiet.** Let the commission read
   *"computational research facility"* into the record. Land your line. **Pause.**
- ⚠️ **Honesty:** *"Gavel clipped this moment out of the webcast"* — **true.** Do **NOT** imply the agent
  generated the clip live on request; it was posted ahead of recording. (The clip tool ships and is
  tested, but Granicus 403s our cloud host's IP for media, so in production it degrades to the deep link
  — which is exactly what you just watched it do in step 1.)

### 🖥️ SHOT 6 — The fight isn't over · ~14s — **CUT THIS FIRST IF LONG**
- `/gavel search "data center"` → **#260142**, the **citywide rules for data centers**, still to be voted
  **July 20**. They beat it on *their* block; the city-wide rule is still live.

### 🖥️ SHOT 7 — ⭐ ACT: file the comment (live) · ~28s
1. In `#clarke-square` (Spanish) or the thread, ask **in Spanish**: `¿Qué significa esto para nuestro barrio?`
   → Gavel answers **in Spanish.** Let it stream.
2. Click **`✍️ Make my voice heard`**.
3. Modal opens on **"✨ Gavel is drafting your comment…"** → **wait** → the real draft swaps in.
4. Pick a position, **edit a word or two** (proves the human is in the loop), type a name.
5. **Send to the city.**
- Show the **🧪 Demo mode** notice on the modal **and** the confirmation.
- ⚠️ **Say out loud:** *"in this demo it goes to a test inbox — never a real city clerk."*

### 🖥️ SHOT 8 — Architecture · ~20s
- `three-memory-architecture.png`, full screen. Point at the **★ Custom MCP server** and **★ Slack RTS
  API** badges, then the **"Compliance by design"** bar.

### 🎥 SHOT 9 — Camera: the close · ~18s
- Land the commissioner line and the last sentence.

---

## PART 2 — Assembly

| # | Shot | Live? | Runs | Ends |
|---|---|---|---|---|
| 1 | Cold open (camera) | — | 0:25 | 0:25 |
| 2 | **Alert lands** | 🟢 | 0:22 | 0:47 |
| 3 | **RTS wow** ⭐ | 🟢 | 0:22 | **1:09** |
| 4 | Who owns it | 🟢 | 0:14 | 1:23 |
| 5 | **Transcript find + clip** ⭐ | 🟢 (half) | 0:30 | 1:53 |
| 6 | Citywide rules *(cuttable)* | 🟢 | 0:14 | 2:07 |
| 7 | **File the comment** ⭐ | 🟢 | 0:28 | 2:35 |
| 8 | Architecture | — | 0:20 | 2:55 |
| 9 | Close (camera) | — | 0:18 | **3:13** ⚠️ |

**You're ~13s over.** Cut **SHOT 6** → lands at **2:59** ✅
**Never cut:** 3 (RTS) · 5 (clip) · 7 (act).

---

## PART 3 — Before you upload

- [ ] ≤ **3:00**
- [ ] Wow lands by **~1:10** (SHOT 3)
- [ ] **The agent is visibly thinking and streaming** in shots 2–7 — don't edit it out
- [ ] **All four disclosures** said out loud: manual alert trigger · seeded neighbor thread · test inbox ·
      clip cut by Gavel but posted ahead of recording
- [ ] **No terminal, no code, no IDE** on screen — the trigger runs off-camera
- [ ] Upload → **open the link in an incognito window, logged out.** If it asks you to sign in, it's
      **private** and the judges cannot watch it.
- [ ] Upload **early** — processing takes time.
