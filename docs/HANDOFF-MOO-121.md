# Build Handoff — Discovery 1: Plain-language topic chips (MOO-121)

_Clean-context handoff. Written 2026-06-18. **Goal:** build MOO-121 — let citizens
subscribe by plain-English **topics** instead of committee jargon — in a fresh session.
The Front Door series (MOO-117…120) is **merged to `main` and live**; the Discovery epic is
filed. Start at `build MOO-121`._

**Read first, in order:** this doc → **the MOO-121 contract** (`get_issue MOO-121` — Intent /
Acceptance / Verification / Out-of-scope / Dependencies) → the **Discovery epic milestone**
"Discovery — From Push to Pull" (the framing: convert context the citizen already has into civic
items) → the **Front Door spec** `docs/superpowers/specs/2026-06-18-frontdoor-onboarding-design.md`
(the onboarding this builds on) → `CLAUDE.md` (per-issue loop + Linear sync). Then re-auth Linear and
`build MOO-121`.

---

## Why this work exists (the 30-second version)

The Front Door gets people *set up*, but watch + committee-subscriptions both assume the citizen
already knows what they care about — and a fresh resident can't choose "ZONING, NEIGHBORHOODS &
DEVELOPMENT COMMITTEE." MOO-121 is the cheapest, highest-leverage **discovery** fix: a curated set
of plain-English topic chips (🏠 Housing & development · 🍺 Bars & licenses · 🚧 Streets &
construction · 🌳 Parks · 🚓 Public safety · 💰 Budget) that map *behind the scenes* to the exact
committees + keywords the matching engine already uses. It's a legibility layer over the existing
subscription mechanics — **no new storage, no change to the matcher.** It also directly sharpens the
onboarding we just shipped.

## The MOO-121 contract (what to build)

- **`agent/onboarding/topics.js`** — a **pure** map: each topic key → `{ label_en, label_es,
  committees[], keywords[] }`, using only canonical committee names (reuse the `COMMITTEES` /
  `CORE_COMMITTEES` constants already exported from `agent/onboarding/defaults.js`) + a curated
  keyword set. Must be **reversible**: a `topicsFor(committees, keywords)` that says which topics are
  "on" (needed to pre-check chips from the role defaults and to render existing config).
- **Surface the chips** in the FD-B confirm modal (`confirmModal` in `agent/blockkit/onboarding.js`)
  and/or the Home channel-config modal (`agent/blockkit/home-modals.js`). The existing
  committee/keyword controls stay available under an "Advanced" affordance.
- **Write-through:** selecting topics writes the **union** of their committees + keywords through the
  existing `normalizeSubscription` → `upsertSubscription` path. Nothing new persisted; `alerts/match.js`
  is untouched.
- **Bilingual** labels (EN/ES); committee names / file numbers stay English under the hood.

**Verification:** unit (each topic → expected committees/keywords; round-trip stability; EN/ES label
parity) + live (set up a channel via topics only → `getSubscription` shows the mapped
committees/keywords → a real matching agenda item alerts it).

## The one real design decision (worth a quick brainstorm)

FD-B's confirm modal is deliberately **2-tap and pre-filled** (pick role → "Go live"). Don't bloat it.
**Recommended approach:** render the role's defaults as **pre-checked topic chips** (a Block Kit
`checkboxes` input, `initial_options` = the role's topics via the reverse map), so the citizen sees
"Housing & development ✓ · Bars & licenses ✓" instead of raw committee names, can toggle, and Go-live
writes the union. This keeps the 2-tap floor (defaults pre-checked = just press Go live) while making
the config legible and editable. If the approach feels fuzzy, run `superpowers:brainstorming` first —
otherwise it's small enough to go straight to TDD.

**The integration seam this touches:** `makeGoLiveSubmit` in `agent/listeners/onboarding/setup.js`
currently writes `defaults.committees` / `defaults.keywords` straight from `private_metadata`. If the
chips are editable, Go-live must instead read the **selected** topic options from
`view.state.values.<block>.<action>.selected_options`, map them via `topics.js`, and write that union
(falling back to the role defaults when nothing was touched). That's the load-bearing edit — give it a
handler test.

## Architecture / file plan

**Reuses (no change):** `defaultsForRole` + `COMMITTEES`/`CORE_COMMITTEES` (`onboarding/defaults.js`),
`copyFor` + the `REQUIRED_KEYS` parity test pattern (`onboarding/copy.js`), `normalizeSubscription`
(`subscriptions/normalize.js`), `upsertSubscription` (`convex/subscriptions.ts`), `matchSubscriptions`
(`alerts/match.js`), the bilingual native-generation rule.

**New / modified:**
- `agent/onboarding/topics.js` — the pure topic↔committees/keywords map + `topicsFor()` reverse map (new).
- `agent/blockkit/onboarding.js` — add the topic checkboxes to `confirmModal` (pre-checked from role). (modify)
- `agent/listeners/onboarding/setup.js` — `makeGoLiveSubmit` reads selected topics → writes the union. (modify)
- (optional) `agent/blockkit/home-modals.js` + `agent/listeners/views/home-modals.js` — same chips in the per-channel config modal for consistency. (modify)
- `agent/onboarding/copy.js` — only if you want topic labels centralized there; otherwise labels live in `topics.js` (it already carries `label_en`/`label_es`). (maybe)
- Tests: `tests/onboarding/topics.test.js`, extend `tests/blockkit/onboarding.test.js` + `tests/listeners/onboarding/setup.test.js`.

## Gotchas you'd otherwise re-derive

- **MatterIndexes is NOT a live source** (CLAUDE.md): matters are tagged only at enactment, and Gavel
  alerts pre-vote — so the practical matching lever is **keywords on the title/subject**, not
  MatterIndexes terms. Curate each topic's `keywords[]` to catch how items actually read (e.g.
  "rezoning", "demolition", "liquor", "tavern", "permit", "pothole", "paving"). Committees stay exact
  canonical `EventBodyName`s (matched case-insensitively in `match.js`).
- **`match.js` has no wildcard** and matches committees by exact name + keywords by substring + an
  E-Notify `category`/district path. A topic's committees must be real `EventBodyName`s or they never
  fire — only use the verified constants in `defaults.js` (ZND, Licenses, CED, City Plan, Public Works).
  If a topic needs a committee not in those constants, **verify the exact spelling against live
  Legistar `/bodies` first** (don't invent — that was the kind of trap we hit elsewhere).
- **Slack action_ids must be UNIQUE within a view** — this bit FD-B in live testing (the role buttons
  shared one id and `views.open` rejected it). Give the topic checkboxes a single distinct
  `action_id`; if you add per-topic buttons anywhere, suffix the id.
- **Unit tests pass but Slack still rejects** Block Kit that's malformed — close the loop with a live
  `slack run` before calling it done (that's how the action_id bug was caught).
- **No manifest change needed** for MOO-121 (it's modals + a checkboxes action, already covered by
  interactivity) — unlike FD-C, you do **not** need an interactive `slack run` manifest sync. A normal
  `fly deploy` (or local `slack run`) is enough to test.
- **Bilingual:** keep committee names/file numbers/addresses English even in the ES label set; the
  parity test should fail if an ES label is missing.

## Worktree / env setup (a fresh worktree needs this)

`.slack/`, `.env`, `.env.local`, `node_modules`, and `convex/_generated` are **gitignored** and live
only in the main checkout `agent/`. For a new worktree off `main`:
1. `git worktree add .claude/worktrees/moo-121-topic-chips -b <linear-branch> main` (Linear gives the branch name; MOO-121 is **independent — branch off `main`**, no stacking).
2. `cd` into `agent/`, `npm ci`, copy `.env` + `.env.local` from the main `agent/`.
3. `npx convex dev --once` to generate `convex/_generated` (deployment `vivid-weasel-903`).
4. **Only if you'll run `slack run` locally:** copy `.slack/` from the main `agent/` into the worktree,
   and append `CONVEX_URL` to the worktree's `.env` — `app.js` does `import 'dotenv/config'` which loads
   **`.env` only, not `.env.local`** (CONVEX_URL lives in `.env.local`). Without this, `/gavel` fails
   with "CONVEX_URL is not configured".

## Demo workspace (for live verification)

Enterprise Grid **Hackathon** workspace `T0B8KS540G4`; app `A0B8GP68PLJ` (bot "Gavel (local)" /
`agent_local`); Convex dev deployment `vivid-weasel-903` is prod for both Fly apps. Bot scopes include
`channels:read` + `files:write`. **Configured channels that already exist** (from this session's
testing): `#clarke-square` (`C0BAPMK6HE2`, association), plus `#general` / `#sherman-park` /
`#lindsay-heights`. Use a **fresh** channel for clean topic tests so you don't clobber those.

## Commands (from `agent/`)

tests `node --test` (**bare** — a path arg under-reports) · lint `npx @biomejs/biome check .` (one
**pre-existing** error in the untouched `tests/alerts/match.test.js` — ignore it) · Convex
`npx convex dev --once`. Deploy `gavel-app`: `fly deploy -c fly.app.toml --remote-only` from repo root;
if machines are stopped, `fly machine start <id> -a gavel-app`.

## How to start

1. Re-auth Linear, verify with "list my Gavel issues."
2. `build MOO-121` → read the contract, restate intent, move → In Progress, worktree off `main`.
3. The topic map + reverse map are pure → TDD them first (RED tests → GREEN), then the confirm-modal
   chips, then the `makeGoLiveSubmit` write-through (the one handler with real risk — test it), then the
   optional Home-modal parity.
4. Live-verify in a fresh demo channel: set up via topics only → `npx convex run
   subscriptions:getSubscription '{"channelId":"<id>"}'` shows the mapped committees/keywords → a real
   matching item alerts. Screenshot. Then PR → In Review → merge → Done.

## Broader project state (the map)

- **Front Door (MOO-117…120)** — **Done, merged to `main`** (`c997b7e`, PRs #29–#32, squash). Live on
  `gavel-app`. 425/425 tests on `main`, biome clean. The duplicate-`action_id` role-modal bug was found
  in live testing and fixed across the stack (tests now assert action_id uniqueness).
- **Discovery epic** — milestone **"Discovery — From Push to Pull"** with **MOO-121–125**: 121 topic
  chips (this) · 122 onboarding sample alert · 123 "this week near you / what's big" App Home feed ·
  124 `whats_upcoming` ask-tool · 125 RTS→agenda community-memory bridge (the demo wow; carries the
  non-negotiable "never store Slack messages" guardrail). Recommended order is 121 → 122 → 123 → 124 →
  125; 121 unlocks topic-filtering for 123/124.
- **Still open / submission-critical:** MOO-62 (3-min demo video — *the* deliverable), MOO-63 (Devpost),
  the MOO-52/53/112 In-Review pile. Deadline **July 13**; internal freeze **July 9**.
- **Workstream B** (queued next UX cycle): rich Block Kit redesign (Card/Alert/Carousel/Data-Table) +
  Thinking Steps in the Ask-Gavel thread. The award-winning *wow* lives here; discovery + Front Door
  remove the disqualifier.
