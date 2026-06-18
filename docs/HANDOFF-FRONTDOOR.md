# Build Handoff — Front Door (onboarding + adaptive channel model): MOO-117…120

_Clean-context handoff. Written 2026-06-18. **Goal:** build the persona-driven onboarding
"front door" in a fresh session. The design is **done and approved**; four Linear contracts
exist; nothing is built yet. Start at `build MOO-117`._

**Read first, in order:** this doc → **the approved spec**
`docs/superpowers/specs/2026-06-18-frontdoor-onboarding-design.md` (the source of truth) →
`docs/gavel-personas-features.md` (Denise/Marcos/Rachel — the design is persona-driven) →
`docs/superpowers/specs/2026-06-09-ux-blockkit-design.md` (the existing App Home / Block Kit
layer this builds on) → `CLAUDE.md` (per-issue loop + Linear sync). Then re-auth Linear and
`build MOO-117`.

---

## Why this work exists (the 30-second version)

Gavel is a **capabilities layer without a product layer**: every feature works and is
verified, but there's no front door — no first-run, no per-persona on-ramp, no channel
model. Map the personas onto a journey (Discover → Onboard → Channels → Daily value → Act)
and the whole gap is the **left side**; Daily-value/Act are green. This blocks the "best UX"
goal. This series builds the missing left side. (The rich Block Kit + Thinking Steps surface
redesign is the deliberate **next cycle**, "workstream B" — out of scope here.)

## The design, decided (full detail in the spec)

1. **Anchor = the Front Door** (onboarding + channel model). Rich surfaces = workstream B, next.
2. **Channel model = Adaptive default.** Everyone starts at one `#civic-alerts`; the IA
   *grows* (per-area channels, `#gavel-watchlist`) only when needed, **proposed** by Gavel
   via a guided checklist. No auto-create — Grid has no `channels:manage`.
3. **Audience = admin setup _and_ member welcome.** Both.
4. **Flow shape = Hybrid.** Warm agent intro → one role question → role-prefilled confirm.
5. **Trigger = nudge → modal; App Home = hub.** App Homes are passive/can't be opened
   programmatically, so the active step is a **modal** (`views.open`) driven by a nudge.
6. **2-taps-to-live.** Pick role → "Go live" with defaults; everything else deferred to the Home.

The load-bearing idea: a pure **role→smart-defaults** engine that turns setup into
*confirming* and routes already-built capabilities (subscriptions, language, watchlists, the
MOO-113 transcript/video memory) to the right persona. Per-persona use of the transcript/video
memory is spec §3.1 (Denise = clips delivered to her · Marcos = bilingual "what was said" +
shareable clips · Rachel = transcript search as her home base).

## The Linear contracts (build in this order)

| Issue | What | Blocked by | Notes |
|---|---|---|---|
| **MOO-117** FD-A | Role→defaults engine + EN/ES copy (pure) | — *(ready)* | small → straight to TDD, no plan needed |
| **MOO-118** FD-B | Nudge → modal → Convex write + App Home states | FD-A | **load-bearing**; chunky → `writing-plans` first |
| **MOO-119** FD-C | Member welcome card + dedup | FD-A | parallel with FD-B after A |
| **MOO-120** FD-D | Adaptive-growth guided checklist | FD-B | **cut-line** — drop first if July 13 tightens |

Each issue has Intent/Acceptance/Verification and links the spec. FD-A unblocks B and C.

## Architecture / file plan (spec §1)

**Reuses (no change):** hybrid App Home (MOO-54), `view_submission` modal handlers,
per-channel `subscriptions`/`language` in Convex, `/gavel` commands, `agent/blockkit/`
renderer library, the bilingual native-generation rule.

**New, small:**
- `agent/onboarding/defaults.js` — pure `defaultsForRole(role)` → `{committees, language, extras, channelShape}` (FD-A).
- `agent/onboarding/copy.js` — curated EN/ES static strings (FD-A).
- `agent/blockkit/onboarding.js` — pure builders: `nudgeCard`, `roleModal`, `confirmModal`, `memberWelcomeCard`, `growChecklistCard`, `homeFirstRun`/`homeConfigured` (FD-B/C/D).
- `agent/listeners/onboarding/*` — nudge trigger · `views.open` · `view_submission` write · `member_joined_channel` welcome (FD-B/C).

**Convex data-model additions** (fields on the existing per-channel config doc — do NOT make
a parallel store): `configured: boolean`, `role?`, `onboardedAt?`, `welcomePostedAt?` (dedups
the member card). Run `npx convex dev --once` to deploy — and per the shared-deployment
hazard, make sure the branch schema is a **superset** before deploying (the `matterOutcomes`,
`transcriptChunks`, `civicNotifications` tables must still be present).

## Gotchas you'd otherwise re-derive

- **No `channels:manage`** on the Grid bot token (confirmed) → Gavel can't create channels.
  "Grows to per-area" = a guided checklist (names + `/invite @Gavel`), not a button. This is
  load-bearing for FD-D.
- **App Homes are passive** — you cannot open one programmatically. The active onboarding
  surface is a **modal** (`views.open`), which is why FD-B is nudge→modal, not "first-run Home".
- **Install detection is fuzzy for a Socket Mode app.** Don't depend on a clean "app
  installed" event — lean on first `/gavel`, `app_home_opened` (first time), and the bot being
  added to a channel as the nudge triggers.
- **FD-C needs a manifest change:** the `member_joined_channel` bot event must be added to
  `agent/manifest.json` → event subscriptions, then synced via the interactive `slack run`
  (human step; manifest pushes aren't automated). Flag it early in the FD-C plan.
- **Bilingual:** onboarding copy is static → a curated EN/ES string set in `copy.js`, **not**
  Claude calls. Keep file numbers/committee names/addresses in English (the existing rule).
- **Block limits / patterns** carry over from the 2026-06-09 UX spec: 50 blocks/message;
  `view_submission` errors via `response_action: 'errors'`; **re-publish the Home after every
  mutation**; card buttons historically carry only `eventItemId` as value.
- **Deploys:** modals/Home/listeners live in **`gavel-app`** (`fly deploy -c fly.app.toml
  --remote-only` from repo root). The poller is untouched by this series.
- **Worktrees:** one per issue (Linear hands you the branch name). `npm ci` in `agent/`, copy
  `.env` + `.env.local` from the main checkout. cwd drifts in compound commands — use absolute
  paths. `OPENAI_API_KEY` is exported in the shell but **not** in `.env` (only matters if you
  touch embeddings; FD doesn't).

## Demo workspace (for live verification)

Enterprise Grid **Hackathon** workspace `T0B8KS540G4`; demo channel `C0B8KS5VCCC` (#general),
language `es`, committees ZND/City Plan/Licenses/CED, watch "Punta Cana LLC". App
`A0B8GP68PLJ`, bot `agent_local`. Convex dev deployment `vivid-weasel-903` is prod for both
Fly apps. Bot scopes now include `files:write` (added + reinstalled this session).

## Commands (from `agent/`)

tests `node --test` (bare — a path arg under-reports) · lint `npx @biomejs/biome check .` ·
Convex `npx convex dev --once` (deployment `vivid-weasel-903`).

## How to start

1. Re-auth Linear (`linear auth`), verify with "list my Gavel issues."
2. `build MOO-117` → read the contract, restate intent, move → In Progress, make a worktree
   off `main` (`tarikjmoody/moo-117-…`). FD-A is pure (defaults map + EN/ES copy) → write the
   acceptance criteria as RED tests, implement to GREEN, no separate plan needed.
3. Then `build MOO-118` (FD-B) — **chunky, so write a plan first** (`superpowers:writing-plans`):
   nudge triggers, the `views.open` role→confirm modal, the Convex write, both App Home states.
   This is the issue that earns the "best UX" cohesion; give it the most care and a live demo run.
4. FD-C (welcome) and FD-D (growth, cut-line) after.

Honor each issue's **Out of scope**. Keep the **2-taps-to-live** bar as a scope discipline —
it's also what protects runway for workstream B before **July 13**.

## Broader project state (so the next session has the map)

- **MOO-113** (third memory: transcripts/video/minutes) — **Done, merged** (PR #28, squash `5680d66`).
- **MOO-61** (architecture diagram) — **In Review, PR #25** updated this session to promote the
  transcripts memory to a real box + add the AgentMail source (`4ea1750`). Awaiting human merge.
- **Front Door design** — spec committed (`787792a` on `main`); issues MOO-117…120 created (this doc).
- **Still open / submission-critical:** MOO-62 (record the 3-min demo video — *the* deliverable;
  the MOO-113 transcript→clip beat is the hero), MOO-63 (Devpost submission, In Review),
  MOO-52/53/112 (In Review pile to merge). Deadline **July 13**.
- **Workstream B** (the queued next UX cycle): rich Block Kit redesign (Card · Alert · Carousel ·
  Data Table) + **Thinking Steps** in the Ask-Gavel thread (`chat.*Stream`, Plan/Timeline, URL
  Sources). Two Slack posts to mine: `slack.dev/build-richer-agent-experiences-with-block-kit`
  and `slack.dev/slack-thinking-steps-ai-agents`. This is where the best-UX *wow* actually lives —
  the Front Door removes the disqualifier; B wins the points.

_Design mockups from the brainstorm persist in `.superpowers/brainstorm/50262-1781808135/content/`
(gitignored): cohesion-map · channel-model · onboarding-audience · onboarding-flow · frontdoor-journey._
