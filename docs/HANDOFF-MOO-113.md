# Build Handoff — MOO-113: Meeting transcript + video memory (the third memory)

_Clean-context handoff. Written 2026-06-16. **Goal:** finish MOO-113 in a fresh session.
Steps 1–3 (ingest → diarize → chunk → embed → semantic search) are **built and live-verified
against real Milwaukee data.** What remains is the Slack-facing wiring + minutes. Everything
below is grounded in real runs, not assumptions._

**Read first, in order:** this doc → the MOO-113 Linear issue (the contract, with sub-tasks A–D) →
`docs/Gavel _ Detailed Product Requirements Document _PRD_.md` (§Vector Database Schema, §Video
Pipeline, §Transcript pipeline) → `docs/gavel-legistar-data-reference.md` (EventMedia / EventItemVideoIndex /
EventMinutesFile) → re-auth Linear → `build MOO-113`.

---

## Where we are (30 seconds)

The "three-memory model" the pitch rests on now has **all three memories real**:
1. Structured civic data — Legistar MCP (MOO-47) ✅
2a. Semantic — `zoning_code` namespace (MOO-55) ✅
2b. Semantic — **`transcripts` namespace (MOO-113) ✅ steps 1–3 live** ← this issue
3. Live community memory — RTS (MOO-49) ✅

Plus MOO-69 (AgentMail E-Notify ingestion) shipped this session and is **merged to main** (PR #27),
so the `civicNotifications` table + `transcriptChunks` table coexist on the shared dev deployment.

**Branch:** `tarikjmoody/moo-113-meeting-transcript-video-memory` (pushed; includes merged main).
**Tests:** 349 pass / 0 fail. **MOO-40** (Deepgram acoustic gate) closed → Done.

---

## What's BUILT and live-verified (steps 1–3)

Proven end-to-end on the real **ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE** meeting,
**EventId 13441**, June 16 2026 (Granicus clip `5210`):

```
node scripts/transcript-ingest.mjs 13441 1200
  → 247 diarized utterances → 33 chunks across 5 agenda items → embedded → stored

semantic query "the sale of the West Hopkins Street property to former owners"
  → item 2 @00:13:07 "...this is just a repurchase back to the former owner...
     Alderman Jackson moves approval"
  → ▶ https://milwaukee.granicus.com/MediaPlayer.php?clip_id=5210&starttime=787
```

### File map (all under `agent/`)
| File | What it is | Tests |
|---|---|---|
| `transcripts/chunk.js` | Pure. Assign Deepgram utterances to agenda items by `EventItemVideoIndex` boundaries → 30–60s speaker-turn windows w/ overlap + per-chunk metadata. | `tests/transcripts/chunk.test.js` (7) |
| `transcripts/deepgram.js` | Nova-3 batch boundary (`diarize+utterances+smart_format`), injected `fetchFn`. | `tests/transcripts/deepgram.test.js` (5) |
| `transcripts/video.js` | `granicusMediaUrl` · `videoMomentDeepLink` (tier-1) · `buildClipArgs` + `clipVideoMoment` (tier-2 yt-dlp section download, injected runner). **Proven live.** | `tests/transcripts/video.test.js` (5) |
| `convex/schema.ts` | `transcriptChunks` vector namespace (1536-dim, filterFields `eventId`/`eventBodyName`; indexes `by_event`, `by_event_item`). | — |
| `convex/transcripts.ts` | `insertChunks` · `clearEvent` (idempotent re-ingest) · `countByEvent` · `fetchChunks` (internalQuery) · `search` (action: vectorSearch → receipts w/ score). | — (live-verified) |
| `scripts/transcript-ingest.mjs` | Orchestration: Legistar event → yt-dlp audio window → ffmpeg 16kHz wav → Deepgram → `buildTranscriptChunks` → `embedTexts` → `clearEvent`+`insertChunks`. | live |

### Reused, not forked
- Embeddings: `zoning/embed.js` `embedTexts`/`embedQuery` (text-embedding-3-small, 1536 — matches the index).
- Vector-namespace pattern mirrors `convex/zoning.ts` (search action → internalQuery hydrate).

---

## What's LEFT (sub-tasks, in recommended order)

### 1. Tier-2 clip → Slack (highest demo impact)
The clip mechanics are proven (`clipVideoMoment` → local MP4 via `yt-dlp --download-sections`).
Wire it to Slack so a ~90s clip of the debate drops **inline**:
- Use `@slack/web-api` `WebClient.files.uploadV2({ channel_id, file, filename, title })` — see
  `scripts/alert-verify.mjs` for the existing Slack client pattern. `DEMO_CHANNEL_ID=C0B8KS5VCCC`.
- `clipVideoMoment({ eventMedia, startSeconds, durationSeconds: 90, outPath }, { run })` where
  `run = promisify(execFile)`. Then upload `outPath`. Verify it plays inline (screenshot for the demo).
- Build a small `scripts/transcript-clip-demo.mjs` mirroring `agentmail-demo-post.mjs`.

### 2. Expose as agent tools (`search_transcripts`, `get_video_moment`)
So it works in a Slack thread, not just the ingest script. Mirror how `ask_zoning_code` is wired
(look at `agent/agent.js` tool registration + the zoning answer path; `scripts/zoning-answer-verify.mjs`).
- `search_transcripts(query, { eventId?, committee? })`: `embedQuery` → `convex.action(api.transcripts.search)`
  → format each hit as "Speaker N said «quote» on item X (date) → ▶ deep link" using
  `videoMomentDeepLink(eventMedia, startTime)`.
- `get_video_moment(eventItemId)`: resolve the item → `{ eventMedia, videoIndex }` (Legistar
  `/eventitems/{id}` gives `EventItemVideoIndex`; the event gives `EventMedia`), then return tier-1
  deep link, or tier-2 clip via #1. Consider a small Convex query to resolve item→eventMedia, or
  fetch from Legistar live.

### 3. D. Minutes / vote-record ingestion
Per-item outcomes are already in Legistar (no transcription needed):
`EventMinutesFile` (PDF) + `EventItemActionName` / `EventItemActionText` / `EventItemPassedFlagName` /
`EventItemMover` / `EventItemSeconder` / `EventItemTally`. Decide storage: a small structured table
(e.g. `matterOutcomes`) or fold onto `detectedAgendaItems`. This is the "what was decided" layer
(the PRD's "vote-record compilation"). Verified present on EventId 13441 (action=`RECOMMENDED FOR
ADOPTION`, passed=`Pass`).

---

## Key facts & gotchas (hard-won this session)

- **`EventMedia` is the Granicus clip id.** The single-event endpoint returns it as a **string**
  (`"5210"`); the list endpoint as a number. `Number(event.EventMedia)` and guard `Number.isFinite`.
- **Granicus video URL:** `https://milwaukee.granicus.com/MediaPlayer.php?clip_id=<EventMedia>` →
  yt-dlp resolves a 720p HLS stream. **Raw ffmpeg on the resolved archive-stream URL 403s** — let
  yt-dlp do the download (`--download-sections "*START-END"` handles Granicus auth/referer).
- **`EventItemVideoIndex`** = seconds into the webcast where the item begins. Populated on ~5/13
  items for EventId 13441; the @769s utterance lined up with `videoIndex=770` → validates slicing.
- **Deepgram** params that worked: `model=nova-3&diarize=true&utterances=true&smart_format=true&punctuate=true`,
  `Authorization: Token <key>`, body = 16kHz mono WAV. Response → `results.utterances[]`
  `{speaker, transcript, start, end}`. ~2.5s for 90s audio. `DEEPGRAM_API_KEY` is in `agent/.env`.
- **Tier-1 deep link param:** `&starttime=<seconds>` on the MediaPlayer URL. **Still needs a human
  visual eyeball** to confirm the player actually seeks to that second (the URL builds correctly;
  playback position wasn't visually verified).
- **Shared dev deployment hazard (important):** `vivid-weasel-903` is one Convex deployment shared
  across all worktrees, last-writer-wins. Deploying a branch whose schema lacks another branch's
  tables/functions **removes them**. This is why MOO-69 was merged to main and pulled into this
  branch — so `civicNotifications` + `transcriptChunks` coexist. **Before `npx convex dev --once`
  from any worktree, make sure the branch contains every table you want to keep live.**
- The `node --test <dir>` aggregator under-reports (shows "1 fail"); run explicit test files for
  true counts, or `node --test` (no path) for the full suite.

---

## How to continue (per-issue loop)

1. **Worktree:** the work is on `tarikjmoody/moo-113-meeting-transcript-video-memory` (already pushed,
   already has main merged in). Either reuse `.claude/worktrees/moo-113-transcripts` or make a fresh
   worktree off that branch.
2. **Env:** copy `agent/.env` + `agent/.env.local` into the worktree's `agent/`. Required keys (all
   present in the main checkout): `DEEPGRAM_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`,
   `CONVEX_URL`, `AGENTMAIL_API_KEY`, `SLACK_BOT_TOKEN`. `DEMO_CHANNEL_ID=C0B8KS5VCCC`.
3. **Setup:** `npm install` · `npx convex codegen` (or `npx convex dev --once` to deploy) · baseline
   `node --test` (expect ~349 pass).
4. **Re-verify the ingest is live** (idempotent): `node scripts/transcript-ingest.mjs 13441 1200`,
   then the search check below.
5. TDD each remaining sub-task RED→GREEN, commit per task referencing **(MOO-113)**.

### Reproduce the semantic-search verify
```js
// node --input-type=module -e "...":  (loads dotenv .env.local + .env)
import { ConvexHttpClient } from 'convex/browser';
import { api } from './convex/_generated/api.js';
import { embedQuery } from './zoning/embed.js';
import { videoMomentDeepLink } from './transcripts/video.js';
const convex = new ConvexHttpClient(process.env.CONVEX_URL);
const vec = await embedQuery('the sale of the West Hopkins Street property', { apiKey: process.env.OPENAI_API_KEY });
const hits = await convex.action(api.transcripts.search, { embedding: vec, eventId: 13441, limit: 2 });
for (const h of hits) console.log(h.score.toFixed(3), h.agendaNumber, videoMomentDeepLink(h.eventMedia, h.startTime), h.text.slice(0,120));
```

### Commands (from `agent/`)
tests `node --test` · lint `npx @biomejs/biome check .` · Convex `npx convex dev --once`
(deployment `vivid-weasel-903`) · ingest `node scripts/transcript-ingest.mjs <eventId> <windowSeconds>`.

---

## Broader project state (the submission is the win — July 13)

- **MOO-69** AgentMail ingestion — merged to main; webhook live; remains **In Review** pending a
  native-Spanish eyeball + a posting cron (see its Linear comments). One real bilingual card already
  posted to `C0B8KS5VCCC`.
- **MOO-40** Deepgram gate — Done.
- **MOO-113** — In Progress, steps 1–3 done.
- **Still open / submission-critical:** MOO-62 (record the 3-min demo video — the actual deliverable;
  MOO-113 transcript search + tier-2 clip is a hero beat), MOO-61 (arch diagram, In Progress — add
  the AgentMail source), MOO-63 (submission package, In Review). In-Review pile to close: MOO-52,
  MOO-53, MOO-112.
- The strongest single demo beat now: ask Gavel *"what did the committee say about the Hopkins
  Street sale?"* → quote + speaker + a clip that plays inline. Finishing sub-tasks 1–2 above makes
  that live in Slack.

_Design doc for the broader feature: PRD §Video Pipeline / §Transcript pipeline. The transcript
namespace + tools are the last load-bearing piece of the three-memory story._
