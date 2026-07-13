# Demo Video Pipeline — Design (2026-07-13)

**Goal:** produce the ≤3:00 Gavel submission video with an automated pipeline — Playwright-captured
Slack shots (real agent responses), ElevenLabs voice-over (Tarik's voice clone), HyperFrames assembly
with kinetic typography, zooms, and pans. Deadline: **today**; time budget 4–6 hours.

**Sources of truth:** `docs/DEMO-VO-SCRIPT.md` (v4 words) · `docs/DEMO-CAPTURE-PLAN.md` (v5 shots).
This pipeline changes the *delivery* of the demo, not its story, shot order, or honesty posture.

## Decisions (locked with Tarik)

| Decision | Choice |
|---|---|
| Camera shots 1 & 9 | Replaced with kinetic typography of the script's exact lines |
| VO voice | ElevenLabs clone, voice ID `bMytOVfoTSi5oJ3DEe8q` (`ELEVENLABS_API_KEY` on machine) |
| Capture | Playwright, headed Chromium, persistent profile; Tarik logs into Slack web once by hand |
| Assembly | HyperFrames (OpenMontage) — environment default; Remotion rejected (setup cost, no gain) |
| gstack browser | Rejected — adds bootstrap, no capability beyond Playwright persistent profile |
| Fallback | If automated capture fights us **>1h total**, Tarik screen-records per the existing shot plan; assembly is unchanged |
| Music bed | Skipped; add only if time remains |

## Architecture — three stages, audio is the master clock

```
DEMO-VO-SCRIPT.md ──► [1 VO]       ElevenLabs ─────────────► 9 MP3s + measured durations
Slack (live agent) ──► [2 CAPTURE] Playwright per-shot ────► 6 MP4s (webm→mp4 via ffmpeg)
both              ──► [3 ASSEMBLY] HyperFrames ────────────► demo-video/render/gavel-demo.mp4
```

VO is generated **first**; each timeline segment's length = max(VO duration, minimum capture length).
Target ≤3:00; **Segment 6 (Beat 4, citywide rules) is the pre-marked cut** if over.

### Layout

```
demo-video/
  scripts/        # committed: vo-generate.mjs, capture-*.mjs, cursor-overlay.js
  vo/             # gitignored: per-segment MP3s + durations.json
  captures/       # gitignored: shot MP4s
  assembly/       # committed: HyperFrames composition (HTML/JS)
  render/         # gitignored: final MP4
  .browser-profile/  # gitignored: logged-in Chromium profile
```

Production tooling, not app code — nothing under `agent/` changes for this pipeline.

## Stage 1 — VO (ElevenLabs)

- **VO source v5:** the four disclosures are currently stage directions, not spoken lines. Inline all
  four as spoken sentences in their beats: (1) manual alert trigger / 5-min cron in production,
  (2) neighbor thread is real documented sentiment posted fresh, (3) comment goes to a test inbox,
  never a real clerk, (4) Gavel cut the clip but it was posted ahead of recording. No other script
  changes — v4 already leads with the problem and names the product last.
- One MP3 per segment (9 segments), `eleven_multilingual_v2`, voice `bMytOVfoTSi5oJ3DEe8q`.
- Measure durations (ffprobe) → `vo/durations.json` drives the assembly timeline.

## Stage 2 — Capture (Playwright)

Headed Chromium, persistent profile. **Injected CSS cursor + click ripple** (Playwright recordings do
not show the OS cursor). Each shot is its own recording — a flubbed shot is a re-run, not a re-record.
Viewport ≥1920×1080; Slack web with sidebar collapsed.

| # | Capture script does | Notes |
|---|---|---|
| S2 | Sit on `#general`; spawn `agent/scripts/demo-live-alert.mjs` as child process; film the bilingual card land | Card is EN + ES (fixed `ed6b71b`) |
| S3 | Open thread on card; type `Didn't we already push back on this?`; wait for streamed answer + receipts | Opposition framing is load-bearing |
| S4 | Type `Who owns 5825 W Hope Ave?` | Verified live: AFS MILWAUKEE LLC |
| S5 | Type `What did the Plan Commission actually call it on June 29?`; wait; scroll to clip; click play | See audio note below |
| S6 | `/gavel search "data center"` → #260142 | Verified live: on July 20 agenda, Final |
| S7 | `#clarke-square`: `¿Qué significa esto para nuestro barrio?` → stream → click **`✍️ Haz oír tu voz`** (ES label, per plan) → wait for draft swap → pick position → **edit a word** → type name → **Send to the city** → confirmation with 🧪 notice | Modal label fix `a549aee` must be deployed first |

- **Streaming waits:** wait for DOM quiescence of the answer block + receipts context block; generous
  timeouts (90s); never cut the thinking/streaming out — it is the evidence judges score.
- **S5 audio:** Playwright records no audio, and the money shot *is* audio. The capture shows the real
  click on the real clip in Slack; assembly then cuts to the **actual clip MP4 (with its own audio)**
  near-full-bleed for the playback seconds. Same file, same moment, audible.
- **Ordering constraint:** deploy the modal fix **now**; no deploys within 15 min of capture (Socket
  Mode reconnect churn can eat a thread reply).

## Stage 3 — Assembly (HyperFrames)

1920×1080 @ 30fps. Bootstrap via the hyperframes-cli skill (not installed yet).

| Seg | Content | Treatment |
|---|---|---|
| 1 | Cold open | Kinetic typography of the script's exact lines; pauses ("computational research facility…", "They won.") as typographic beats; real headlines as texture |
| 2–7 | Shot MP4s | Keyframed zoom/pan (GSAP transforms): zoom to ES section on "and in Spanish", news block, receipts, owner name, #260142 row, 🧪 demo-mode notice |
| 5b | The clip itself | Full-bleed clip MP4 with original audio; VO silent ("press play — then be quiet") |
| 8 | `docs/architecture/three-memory-architecture.png` | Slow pan; highlight rings on ★ MCP + ★ RTS badges, then the compliance bar |
| 9 | Close | Kinetic typography |

Audio: VO MP3s laid per segment; clip audio for 5b; no music bed.

## Verification

- `/watch` the render against `DEMO-CAPTURE-PLAN.md` PART 3: **≤3:00** · wow lands by ~1:10 ·
  agent visibly thinking/streaming in S2–S7 · **all four disclosures audible in the VO** ·
  no terminal/code/IDE visible.
- Upload early; open the link logged-out in incognito to confirm it is public.

## Out of scope

Story Radar, watchlists, digest, App Home in the video (Devpost text only, per script) · music bed ·
re-recording the talking-head shots · any change to agent behavior or the demo story.
