# Build Handoff — Video discovery: browse available meeting videos (MOO-142)

_Clean-context handoff. Written 2026-06-20. **Goal:** build MOO-142 — give reporters a way to
**discover** what meeting video exists, instead of the current query-only video feature that
silently returns nothing when a meeting isn't transcribed. Two surfaces: a reporter-gated App Home
**"🎥 Meeting video"** section, and a **`/gavel video`** command that opens a **filterable browse
modal** with a committee dropdown (so a journalist who doesn't know the committee term picks from
what's actually available). Everything it builds on is **merged to `main` and deployed**. Start at
`build MOO-142`._

**Read first, in order:** this doc → **the MOO-142 contract** (`get_issue MOO-142` — Intent /
Acceptance / Verification / Out-of-scope) → **MOO-130's modal code** (`agent/blockkit/story-modal.js`
+ `agent/listeners/actions/story-buttons.js` — this is the pattern you clone) → **MOO-113's video
memory** (`docs/HANDOFF-MOO-113.md` for the `EventMedia` gotchas; `agent/transcripts/video.js` +
`agent/convex/transcripts.ts`) → `docs/gavel-legistar-data-reference.md` (EventMedia /
EventItemVideoIndex). Then re-auth Linear and `build MOO-142`.

---

## Why this exists (the 30-second version)

The video feature (MOO-113: `search_transcripts` / `get_video_moment`) is **query-only**. A reporter
has to already know what to ask, and gets silence when a meeting isn't transcribed — with no signal
that the video simply wasn't processed (the worst failure mode: *looks empty, isn't*). And a typed
`/gavel video zoning` assumes they know the committee term.

The fix is the same **legibility move** as MOO-121 (topic chips) and MOO-131 (neighborhood picker):
**show them the options instead of making them guess the jargon.** A browse modal with a committee
dropdown — populated from committees that actually have video — turns "ask and hope" into "see what's
there, pick your beat, dig in." This is the *Pull* in the "From Push to Pull" milestone.

**The decision already made (don't re-litigate):** the dropdown lists **only committees that have
recent video** (≈10–30 bodies), NOT all ~169. That keeps it a small `static_select` (under Slack's
100-option cap) with **no typing required** — which is the whole point. An all-169 `external_select`
typeahead is explicitly OUT (it would force typing the term you don't know).

## The MOO-142 contract (what to build)

**Surface A — the data source (Legistar).**
- A client method on `createLegistarClient` (e.g. `listRecentMeetingsWithVideo({ days = 30, committee })`)
  → recent **past** events that have a Granicus webcast: `{ eventId, eventBodyName, eventDate, eventMedia }[]`.
- Video is a *look-back* surface (footage exists after the meeting), so query a **past** window — the
  inverse of `buildEventsQuery` (which is future-only: `EventDate ge now … lt now+window`). Add a past
  variant: `EventDate ge now-days and EventDate lt now`, `$orderby=EventDate desc`.
- **Map `EventMedia`** — `mapEvent` does NOT currently carry it; add `eventMedia: raw.EventMedia`.
  Filter to meetings where it's a real clip id (`Number.isFinite(Number(eventMedia)) && Number(eventMedia) > 0`)
  — many events have `EventMedia` null/0 (no webcast).

**Surface B — searchable-vs-not tag (Convex).**
- Mark each meeting **🔍 Searchable** (Gavel has transcript chunks) or **🎥 Video only** (footage, not
  yet transcribed) via `convex/transcripts.ts` `countByEvent(eventId)`.
- **Perf:** don't call `countByEvent` once per meeting (N round-trips). Add a small query that returns
  the set of ingested eventIds once — e.g. `listIngestedEventIds()` (distinct `eventId` over
  `transcriptChunks`) — and tag in memory. (One query, not N.)

**Surface C — the filterable browse modal** (the no-jargon picker; clone MOO-130).
- New pure builder `agent/blockkit/video-modal.js` → `videoModal(meetings, { language, committee })`,
  mirroring `story-modal.js`:
  - a committee `static_select` (`action_id: 'video_filter'`) whose options are built **from the
    distinct committees present in `meetings`** (+ "All committees", with counts in labels, e.g.
    "ZONING… (3)"), `initial_option` = active filter;
  - one row per meeting: `committee · 🗓 date` + a **▶ Watch on Granicus** link
    (`granicusMediaUrl(eventMedia)` from `transcripts/video.js`) + the 🔍/🎥 tag;
  - `private_metadata` carries `{ language, committee }` (like story-modal); classic blocks, ≤100,
    bilingual. Reuse `dateLabel` from `blockkit/story-labels.js`.
- Action handlers (new `agent/listeners/actions/video-buttons.js`, mirror `story-buttons.js`):
  - `video_browse` → `client.views.open({ trigger_id, view: videoModal(...) })` (refetch the cheap
    pipeline, like `makeStoryBrowse`);
  - `video_filter` → `client.views.update({ view_id: body.view.id, view: videoModal(...) })` (refetch +
    re-slice by the selected committee, like `makeStoryModalFilter`; read `language` from
    `private_metadata`).
- Register both in `agent/listeners/actions/index.js` (same block as `story_browse`/`story_modal_filter`).

**Surface D — App Home section.**
- In `agent/blockkit/home-view.js`, add a reporter-gated "🎥 Meeting video" section: a compact preview
  of the most recent N meetings (committee · date · 🔍/🎥) + a **📋 Browse videos** button
  (`action_id: 'video_browse'`) → the modal. Reporter gate = `channels.some(c => c.role === 'reporter')`
  (same switch the Story-leads section uses). English-default (ES only if every channel ES).
- Data: add a `meetingsWithVideo` slice to `agent/home/state.js` (gated on `hasReporter`, like
  `storyLeads`), fetched via the home deps (add `listRecentMeetingsWithVideo` + `listIngestedEventIds`
  to `agent/home/deps.js`). Keep the Home fetch-light — a small cap (e.g. 5 preview rows).

**Surface E — `/gavel video [committee]` command.**
- Add `'video'` to `KNOWN_SUBCOMMANDS` in `agent/listeners/commands/gavel.js`; route to a `runVideo`
  (model it on `runStories`).
- **Gotcha (important):** `handleGavelCommand({ command, ack, respond, logger }, deps)` does NOT
  currently destructure `client` or `body`. The registration
  (`app.command('/gavel', (args) => handleGavelCommand(args, deps))`) already passes the full Bolt
  `args` — so **add `client` and `body` to the destructure** and use `body.trigger_id` to open the
  modal. No-arg `/gavel video` → `client.views.open({ trigger_id: body.trigger_id, view: videoModal(...) })`;
  `/gavel video <committee>` → an ephemeral list filtered directly (reuse the `/gavel stories`
  arg-parse). Don't make the modal mandatory.

**Invariants (carry from MOO-127/130/131):** reporter-gated · bilingual (committee/proper names stay
English) · **no new persistence required** (live Legistar + existing `transcriptChunks`; the only new
Convex code is the read-only `listIngestedEventIds` query) · LLM-free (lookup + links only) ·
`action_id`s unique within a view.

## Architecture / file plan

**Reuse (the pattern to clone):**
- `agent/blockkit/story-modal.js` — `storyModal` builder + `static_select` `option_groups` built from
  the data + `decodeFilter` + `private_metadata`. **This is the template for `video-modal.js`.**
- `agent/listeners/actions/story-buttons.js` — `makeStoryBrowse` (views.open), `makeStoryModalFilter`
  (views.update). **The template for the video handlers.**
- `agent/blockkit/story-labels.js` — `dateLabel` (reuse for the row's 🗓 date).
- `agent/transcripts/video.js` — `granicusMediaUrl(eventMedia)` for the ▶ link.
- `agent/convex/transcripts.ts` — `countByEvent` (and add `listIngestedEventIds`).
- `agent/poller/legistar.js` — `createLegistarClient`, `buildEventsQuery`, `mapEvent` (add
  `listRecentMeetingsWithVideo` + `eventMedia` mapping).
- `agent/blockkit/home-view.js` + `agent/home/state.js` + `agent/home/deps.js` — reporter-gated section
  placement + state slice + deps wiring (copy the `storyLeads` path exactly).
- `agent/listeners/commands/gavel.js` (`parseGavelCommand`, `runStories`, `handleGavelCommand`) +
  `agent/listeners/commands/index.js` (deps construction; `args` already carries `client`/`body`).

**New:**
- `agent/blockkit/video-modal.js` (pure `videoModal` + the Home section builder, or split) + tests.
- `agent/listeners/actions/video-buttons.js` (`makeVideoBrowse`, `makeVideoFilter`) + tests.
- `listRecentMeetingsWithVideo` on the Legistar client; `listIngestedEventIds` in `convex/transcripts.ts`.
- `runVideo` in `gavel.js` (+ `'video'` subcommand) + tests.
- `scripts/video-discovery-verify.mjs` — live: list real meetings-with-video, tag searchable, render
  the modal/section, print block counts (mirror `scripts/story-rich-verify.mjs`).

## Gotchas you'd otherwise re-derive

- **`EventMedia` shape:** number on the **list** endpoint, **string** on the single-event endpoint
  (MOO-113). `Number(eventMedia)` + `Number.isFinite` + `> 0`; skip null/0 (no webcast).
- **Past window:** `buildEventsQuery` is future-only — write a past-window variant; keep
  `EventAgendaStatusName eq 'Final'`. Confirm the list endpoint returns `EventMedia` during the build
  (MOO-113 only proved it on the single-event endpoint; add `$select` if Legistar omits it).
- **Slash-command → modal needs `trigger_id`:** thread `client` + `body` into `handleGavelCommand`
  (currently not destructured). A command's `trigger_id` is `body.trigger_id`, valid ~3s — open the
  modal promptly (ack first).
- **Don't N+1 the searchable tag:** one `listIngestedEventIds()` query, tag in memory — not
  `countByEvent` per meeting.
- **Dropdown from committees-with-video** (not all 169) → small `static_select`, no typeahead. Build the
  options from the fetched meetings (mirror `story-modal.js` `filterBlock`).
- **Modal ≤100 blocks:** cap meetings (~30) + the dropdown narrows. Home preview stays ~5 rows.
- **Reporter gating** lives in `home-view.js` + `home/state.js` (`role === 'reporter'`). The Home
  section + Browse button only render for reporter channels; the `/gavel video` command can stay open to
  anyone in a subscribed channel (it's pull, not push).
- **Language:** English-default, ES only if every channel ES (`home-view.js` `channels.every`).
- **Shared Convex deployment hazard (MOO-113):** `vivid-weasel-903` is one deployment shared across
  worktrees, last-writer-wins. If you add `listIngestedEventIds`, `npx convex dev --once` from a branch
  whose schema lacks other live tables **removes them** — branch off `main` (which has them all) and
  don't push a partial schema. (This issue needs no schema change, only a new query function.)
- **biome:** one **pre-existing** error in the untouched `tests/alerts/match.test.js` — ignore it.
  `node --test` is **bare** (no path) for the full suite.

## Worktree / env setup (a fresh worktree needs this)

`.slack/`, `.env`, `.env.local`, `node_modules`, `convex/_generated` are **gitignored** and live only
in the main checkout `agent/`. For a new worktree off `main`:
1. `git worktree add .claude/worktrees/moo-142-video-discovery -b tarikjmoody/moo-142-video-discovery origin/main`
   (MOO-142 is independent — branch off `main`, which has MOO-113/127/130/131 merged).
2. `cd agent`, `npm ci`, copy `.env` + `.env.local` from the main `agent/`.
3. `npx convex codegen` (or copy `convex/_generated` from main). If you add `listIngestedEventIds`,
   `npx convex dev --once` to push it — but see the shared-deployment hazard above.
4. **npm ci gotcha:** if agent-SDK tests fail with `ERR_MODULE_NOT_FOUND @anthropic-ai/claude-agent-sdk`,
   re-run `npm ci`.

## Commands (from `agent/`)

tests `node --test` (**bare**) · lint `npx @biomejs/biome check .` (ignore the pre-existing
`match.test.js` error; `--write <files>` to format your own) · Convex `npx convex codegen` /
`npx convex dev --once`. Deploy `gavel-app`: `fly deploy -c fly.app.toml --remote-only` from repo root
(machine `e8202d9a7d1078`); verify boot in `fly logs -a gavel-app` (look for `bolt-app Gavel is
running!`, not just Fly's "good state").

## Demo workspace + live-data anchor (for verification)

Enterprise Grid **Hackathon** workspace; app `A0B8GP68PLJ` ("Gavel (local)"); Convex dev
`vivid-weasel-903`. Reporter channel: `#general` (`C0B8KS5VCCC`, role reporter) — exercises the App
Home section. **Verification anchor:** **EventId 13441** (ZONING, NEIGHBORHOODS & DEVELOPMENT
COMMITTEE, June 16 2026, Granicus clip `5210`) is the one meeting MOO-113 actually ingested — it must
show **🔍 Searchable**; any other recent meeting with video shows **🎥 Video only**. ▶ link:
`https://milwaukee.granicus.com/MediaPlayer.php?clip_id=5210`.

## How to start

1. Re-auth Linear, verify with "list my Gavel issues."
2. `build MOO-142` → read the contract → quick brainstorm only on the modal layout (the *surface*
   decision is made: dropdown-from-committees-with-video) → worktree off `main` → TDD. Order: Legistar
   `listRecentMeetingsWithVideo` + `eventMedia` mapping (RED→GREEN, verify against real data first) →
   `listIngestedEventIds` → `videoModal` builder → the two action handlers → the Home section → the
   `/gavel video` command (thread `client`/`body`) → live verify (`scripts/video-discovery-verify.mjs`,
   anchor on EventId 13441) → deploy → screenshot → PR → In Review → Done.

## Broader project state (the map)

- **Shipped + on `main` + deployed (gavel-app v34):** MOO-127 (Story Radar), MOO-128 (clustering),
  MOO-130 (story-leads rich view: Browse modal + carousel + Ask-Gavel DM), MOO-131 (neighborhood
  picker). MOO-113 (transcript+video memory) steps 1–3 live; `search_transcripts`/`get_video_moment`
  agent tools wired.
- **MOO-142 (this)** — video discovery surface. Reuses MOO-130's modal + MOO-113's video memory.
- **MOO-132** — neighborhood/alderperson display enrichment (blocked on MOO-131, now unblocked).
- **MOO-129** — reporter dossier (the deep view a 🔍 Searchable meeting links into). MOO-142 is its
  front door.
- **Submission-critical:** MOO-62 (demo video), MOO-63 (Devpost). Deadline **July 13**; freeze **July 9**.
