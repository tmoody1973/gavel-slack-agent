# Build Handoff — next session (continue from a clear context window)

_Clean-context handoff. Written **2026-06-21** after a big session that shipped **MOO-142** (video
discovery), **MOO-125** (the community-memory bridge — the signature differentiator), and
**MOO-129** (reporter dossier), and spec'd **MOO-143** (speaker naming). `main` is at **`4f6be97`**;
all three features are merged + deployed._

**Read first, in order:** this doc → `CLAUDE.md` (per-issue loop + Linear sync protocol) →
re-auth Linear (browser flow once, verify with "list my Gavel issues") → then either run the
**demo dry-run** (recommended) or `build MOO-143`. Deadline: **freeze July 9, submit July 13.**

---

## Where the project stands (2026-06-21)

The build is **deep and mature**. `main` @ `4f6be97`. Deployed:
- **`gavel-app`** (Fly, Socket Mode, machine `e8202d9a7d1078`, `shared-cpu-2x`/4GB — 4GB required,
  OOMs at 512MB/2GB) — all interactions: alerts, App Home, `/gavel`, story modal + dossier, video
  browse. Agent model pinned to `claude-sonnet-4-6` in `agent/agent/agent.js` (override `GAVEL_AGENT_MODEL`).
  Deploy from **repo root**: `fly deploy -c fly.app.toml --remote-only`. Confirm a deploy actually
  took via `fly logs -a gavel-app` → `[INFO] bolt-app Gavel is running!` (Fly's "good state" lies for
  Socket Mode). **Do NOT deploy gavel-app from `agent/`** — `agent/fly.toml` is the *gavel-poller* config.
- **`gavel-poller`** (Fly, supercronic on `agent/crontab`, machine `48e7d9ef2330e8`) — `*/5` poll,
  Sunday digest (`0 14 * * 0`), watch sweep (`0 13`), escalation (`0 */6`), and **NEW: the
  community-memory bridge daily at `0 15 * * *`**. Deploy from **`agent/`**: `fly deploy --remote-only`.
- **Convex dev `vivid-weasel-903`** — one shared deployment across worktrees (last-writer-wins).
- Secrets on both apps: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `CONVEX_URL`, `SLACK_BOT/APP/USER_TOKEN`,
  `DEEPGRAM_API_KEY`. (Standing item: rotate the chat-pasted Slack tokens.)

**Shipped this session (all Done in Linear, merged, deployed, screenshot-verified):**
- **MOO-142** — Video discovery: `videoModal` browse (committee dropdown built from committees-with-video),
  reporter-gated App Home "🎥 Meeting video" section, `/gavel video [committee]`. 🔍 Searchable vs
  🎥 Video-only tags. New Convex `transcripts.listIngestedEventIds`. PR #43.
- **MOO-125** — The bridge: agenda→RTS→LLM-judge → "you've been discussing this, it's on the agenda"
  proposals. Compliance-clean (Slack message content NEVER stored; only `{channelId, eventItemId}` in
  the new `bridgeProposals` table). Daily cron on gavel-poller. PR #44.
- **MOO-129** — Reporter dossier: "📋 Brief me" on a story lead → modal fusing 💡 angle + 📞 sponsor +
  🕓 history + 🎥 transcript moment + 🗳️ outcome + Watch/Send. PR #45.
- Also: ran a **live Deepgram ingest** → meeting **13370** (Community & Economic Development, clip 5200)
  is now 🔍 Searchable alongside **13441** (ZONING, clip 5210). Canceled **MOO-141** (a dup of 142).

**The pieces now compose:** a 🔍 Searchable meeting (142) opens into the dossier (129); the dossier's 🎥
receipt is where MOO-143 (speaker naming) pays off; the bridge (125) fuses community + civic memory.
The "three-memory" thesis is demonstrably real on the deployed app.

## The immediate decision — what to do next

**Recommended: a demo dry-run, not another feature (yet).** At ~18 days to freeze with a mature build,
the highest-leverage move is to walk the brief's **8-beat demo script** against the *live deployed app*,
beat by beat, and let what's broken/weak/cached become the punch-list. The only P0 is **MOO-62 (the
3-min demo video)** — de-risk it before building blind. (Tarik leaned toward building over the dry-run
last two times; offer it again now that 142/125/129 are all in.)

**If building instead, ranked options (all unblocked):**
1. **MOO-143 — Speaker naming** (High, *spec ready*): map Deepgram "Speaker 2" → council members via
   spoken cues + the `councilMembers` directory. Turns the 🎥 receipt from "useful" to *publishable*
   (the journalist's whole value). Cheap to verify — 13370 + 13441 already transcribed, their
   transcripts full of "Alderman Russell/Chambers/Moore" cues. **Best feature-pick if shipping.**
2. **MOO-132 — Neighborhood + alderperson enrichment** (Medium): make every "District 6" human;
   personalize the "How to be heard" footer. Smaller, broad polish.
3. **MOO-124 — Ask "what's coming up?"** (Medium): conversational agenda discovery.
4. **MOO-68 — Permit & license alerts** (High): extend proactive alerts beyond legislation (CKAN sweep).

Submission-critical, human-driven: **MOO-62** (demo video, P0) + **MOO-63** (Devpost; needs judge
sandbox access to slackhack@salesforce.com).

## Per-issue loop (unchanged — see CLAUDE.md)

`linear-build` is the engine: `build MOO-XX` → read contract → (brainstorm only if fuzzy) → worktree
off `main` → TDD → live-verify against real data → PR → Linear In Review → screenshot → Done. Honor each
issue's "Out of scope." **Tarik's working preference (saved to memory `momentum-over-long-brainstorm`):**
make the reasonable call and keep moving — one load-bearing question only when an architecture fork
genuinely needs his input, then lock defaults and proceed. Still confirm before outward/irreversible
actions (prod deploys that enable proactive posting).

## Worktree + env setup (every new worktree needs this)

`.env`, `.env.local`, `node_modules`, `convex/_generated` are gitignored and live only in the main
checkout `agent/`. For a fresh worktree off `main`:
1. `git worktree add .claude/worktrees/moo-XXX -b tarikjmoody/moo-XXX origin/main`
2. `cd agent` then: **symlink** node_modules (`ln -s <main>/agent/node_modules node_modules`),
   **copy** `convex/_generated` as a REAL dir (`rm -rf convex/_generated && cp -R <main>/agent/convex/_generated convex/_generated` — NOT a symlink, or `convex dev`/codegen pollutes the main checkout), and `cp` `.env` + `.env.local`.
3. Commit files **explicitly** (never `git add -A`) — the node_modules symlink shows as untracked and
   must not be committed.
4. After PR squash-merges: `git -C <main> merge --ff-only origin/main` to advance local main, then
   `git worktree remove … --force` + `git branch -D …`. Squash merges leave the branch "unmerged" to
   `git branch --merged` — confirm via `git ls-remote origin main` before deleting.

Commands (from `agent/`): tests `node --test` (bare) · lint `npx @biomejs/biome check .` (`--write <files>`
to format your own; one pre-existing error in `tests/alerts/match.test.js` — ignore it) · Convex
`npx convex dev --once` (pushes schema+functions; safe from a main-branched worktree — additive only).
Full suite is **682 tests** as of `4f6be97`.

## Gotchas discovered this session (durable — don't re-derive)

- **`expired_trigger_id` on slow modals (MOO-129).** Slack trigger_ids expire in **~3s**. Any modal
  doing slow work on click (Claude call, multi-fetch) MUST push a **loading modal instantly**, then
  `views.update` it once ready — never assemble-then-push. The dossier (`openDossier`) does this.
  **`dossier_watch` / `dossier_send` were NOT UI-tested** — lighter work (no Claude), likely fine, but
  if Watch shows delay-then-nothing it's the identical fix.
- **Legistar `EventMedia` is a string on BOTH endpoints** (list + single), e.g. `"5210"` — handoffs
  wrongly said number-on-list. Always `Number()`-coerce (`videoClipId`); no `$select` needed. (Memory:
  `legistar-eventmedia-string-both-endpoints`.)
- **Bridge candidate selection is by channel relevance, not salience (MOO-125).** The live agenda is
  mostly local items (appeals, namings, dept policies) with great entities but no money/legislation
  "salience" signal — gate on `matchSubscriptions`, use salience only to order within.
- **RTS is query-driven** (`assistant.search.context(query)` — no "fetch all messages"), which is *why*
  the bridge runs agenda→RTS. New seeded messages get indexed within ~20s (tested live).
- **Transcript ingest is a manual script today:** `node scripts/transcript-ingest.mjs <eventId> [windowSeconds]`
  (yt-dlp + ffmpeg + Deepgram Nova-3 diarized + OpenAI embed → `transcriptChunks`). yt-dlp/ffmpeg present
  on the dev box. On-demand-from-Slack transcription is an explicit non-built follow-up (see the chat
  analysis: lazy/item-scoped is the right model).

## Open items / latent risks

- **Dossier `dossier_watch` / `dossier_send`** — unit-tested, NOT clicked live (trigger-latency risk above).
- **Bilingual ES copy** on the new surfaces (video modal, bridge card, dossier) is in place but wants a
  **native-speaker review** — standing project open item (originally MOO-43).
- **Bridge posts proactively daily now** (15:00 UTC). Sandbox has one dedup row (eventItem 492235); to
  re-demo that exact item, clear its `bridgeProposals` row.
- **Demo data thin:** only two meetings are 🔍 Searchable (13370, 13441). For a richer demo, ingest a few
  more so the dossier 🎥 section and `/gavel video` tags don't look sparse.

## Linear (team Moodyco, project "Gavel") — state

Discovery milestone "From Push to Pull" is nearly complete (127/128/130/131/142/125/129 Done). Open/
unblocked: **MOO-143** (speaker naming, spec ready), **MOO-132**, **MOO-124**, **MOO-68**, **MOO-66**,
**MOO-67**. Submission: **MOO-62** (demo video, P0), **MOO-63** (Devpost). Every shipped issue carries a
full evidence trail in its Linear comments (live output, screenshots, deferred items).
