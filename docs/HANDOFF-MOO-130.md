# Build Handoff — Story leads rich view: filterable modal + carousel (MOO-130)

_Clean-context handoff. Written 2026-06-20. **Goal:** build MOO-130 — make the reporter
Story-leads experience genuinely browsable: the **App Home** becomes a lean triage strip
(one line per cluster) + a **`📋 Browse story leads` button → a filterable modal**, and the
**`/gavel stories` message** renders as a swipeable **`carousel`** of story cards. Everything
it builds on (MOO-127 Story Radar, MOO-128 clustering + English-default) is **merged to `main`
and deployed live** on `gavel-app`. Start at `build MOO-130`._

**Read first, in order:** this doc → **the MOO-130 contract** (`get_issue MOO-130` — Intent /
Acceptance / Out-of-scope / Dependencies) → **MOO-128's spec + plan**
(`docs/superpowers/specs/2026-06-20-app-home-declutter-design.md`,
`docs/superpowers/plans/2026-06-20-app-home-declutter.md`) → the reused code (below) → the
Slack **carousel/card** docs (links below). Then re-auth Linear and `build MOO-130`.

---

## Why this exists (the 30-second version)

MOO-127 shipped Story Radar (rank the agenda into explainable story leads for reporters).
MOO-128 deduped the App Home by **clustering** related leads (subject beat + committee) and fixed
the language. But the live Home (screenshot 2026-06-20) still reads as a vertical list of legalese
titles — the cluster groups them but doesn't *compress* them. The user (Radio Milwaukee) wants a
real browse experience and pointed at two Slack patterns: a **carousel** of cards and a
**filterable modal** (the "ticket app" template).

**The decision already made (don't re-litigate):** a carousel is for *"review these N one at a
time"* (great in a **message**); a filterable modal is for *"show me everything, my way"* (great for
**Home triage**). So:
- **App Home** = compact one-line-per-cluster + a `📋 Browse story leads` button → **modal**.
- **`/gavel stories` message** = **carousel** of cards.
- **Carousel on the App Home itself is OUT** — surface support for `carousel`/`card` in
  `views.publish` (Home tab) is **unconfirmed** in Slack's docs (blocks shipped 2026-04-16). Modal is
  the safe Home path. If you ever want carousel on the Home, **test-publish it first**.

## ⚠️ Do the feasibility spike FIRST (de-risk the carousel)

Before building the carousel render, **prove Slack renders `carousel` in a message on the deployed
app**. The `card`/`carousel`/`alert` blocks are new (2026-04-16) and the deployed stack is
`@slack/bolt 4.7.3` / `@slack/web-api 7.16.0` (from the boot logs). Gavel builds **raw JSON blocks**
(not typed builders), so they should pass through — but Slack may reject the block server-side.

Spike: post a minimal carousel to a test DM/channel via a one-off script using `SLACK_BOT_TOKEN`
(`chat.postMessage` with a `carousel` of 2 `card`s). If it renders → build it with confidence. If it
errors → keep `/gavel stories` on the existing `storyLeadCards` list and reduce MOO-130 to the modal
only (and note the carousel as blocked). **Graceful fallback is in the acceptance criteria.**

Docs: carousel block <https://docs.slack.dev/reference/block-kit/blocks/carousel-block/> · card block
<https://docs.slack.dev/reference/block-kit/blocks/card-block/> · changelog
<https://docs.slack.dev/changelog/2026/04/16/block-kit-new-blocks/>. (The doc pages do **not** publish
a surface-compatibility table — the spike is the real source of truth.)

## The MOO-130 contract (what to build)

**Surface A — App Home (modal).**
- Compress `storyLeadsSection` (in `agent/blockkit/story-leads.js`) so each cluster/single is **one
  line** (`*🛡️ Police & public safety* — 5 items` + the meta context line), **no member titles
  inline**, + a single `📋 Browse story leads` button (new `action_id: story_browse`).
- **New `agent/blockkit/story-modal.js`** — a pure builder `storyModal(entries, { language, filter })`
  → a `type: 'modal'` view: a `static_select` **filter** (All · by committee · by MOO-121 topic · by
  district), then leads **grouped by beat** (theme header → member rows), each row a `section` +
  `overflow` (`👁 Watch` · `📋 Brief me`/dossier). Classic blocks only (guaranteed in modals, ≤100
  blocks). Bilingual (reuse `THEME_LABEL`/`TAG_LABEL` from `story-leads.js` — consider extracting them
  to a shared `agent/blockkit/story-labels.js` so both the Home and the modal import them).
- **New action handlers** (in `agent/listeners/actions/`): `story_browse` → `client.views.open({
  trigger_id, view: storyModal(...) })` (copy the pattern from `makeHomeEditChannel` /
  `makeDiscoverWatch` in `listeners/actions/home-buttons.js`, which already do `views.open` with a
  `trigger_id`). The filter `static_select` → an `app.action(...)` that recomputes entries for the
  chosen filter and `client.views.update({ view_id, view })`. The per-lead `overflow` → `views.push`
  the pre-filled add-watch modal (the Home/modal has no channel context — same constraint Watch
  always has here; reuse the add-watch-modal pattern).
- The modal's data = the same clustered leads: fetch `listUpcoming` + `listSubscriptions` (for
  boundaries + language) → `selectStoryLeads(upcoming, { boundaries })` → `clusterLeads(leads)` →
  `storyModal(entries, …)`. (Reuse `createHomeDeps` boundaries; no new persistence.)

**Surface B — `/gavel stories` message (carousel).**
- Convert the `/gavel stories` response (currently `storyLeadCards(composed, …)` in
  `agent/blockkit/story-leads.js`, called from `runStories` in
  `agent/listeners/commands/gavel.js`) into a single `carousel` block of `card`s (≤10): title = matter
  title; subtitle = `committee · date`; body = the grounded **angle** (`hook` + `whyStory`, already
  generated by `composeLeadAngles`); actions = `👁 Watch` + `📋 Brief me`. **Fallback:** if the spike
  shows carousel is rejected, keep `storyLeadCards`.

**Per-lead affordances (requested 2026-06-20 — build these in):**
- **Meeting date** — every lead has `item.eventDate`. Add it to the **Home** cluster header + singles
  (`🗓 Tue Jun 23`), and to the modal/card rows. Cheap, LLM-free, no fetch — fine on the Home.
- **💬 Ask Gavel** — a per-lead action on the **modal/carousel** (NOT a bare Home button — the Home has
  no channel/thread). Reuse the `makeAlertAsk` prime pattern (`primeStore.setSession`) but open a
  **primed DM** with the item context (bot has `im:write`). Lets a reporter ask "what's the history
  here?" and Gavel answers with its civic-record tools.
- **📄 View in Legistar / agenda / 🎥 video link** — `EventInSiteURL` (meeting's public Legistar page),
  `EventAgendaFile` (PDF), `EventVideoPath` are mapped in `poller/legistar.js` but **only via
  `getEvent(eventId)` enrichment** — detected rows don't store them. So these links live on the
  `/gavel`/**modal** path (which enriches), not the fetch-free Home. Add them to the card/overflow.

**Invariants (carry from MOO-127/128):** reporter-gated · bilingual (committee/proper names stay
English) · **no new persistence** · LLM only where already afforded (angles on `/gavel`, never on the
Home/modal synchronous render) · `action_id`s unique within a view.

## Architecture / file plan

**Reuse (no change unless noted):**
- `agent/stories/cluster.js` — `clusterLeads(leads)` → entries `{kind:'cluster', theme, committee,
  tags:[{kind}], district?, members:[lead], topScore}` | `{kind:'single', district?, ...lead}`.
  `THEME_FAMILIES`, `themeOf(title)`. **This is the spine for both surfaces.**
- `agent/stories/leads.js` — `selectStoryLeads(upcoming, {boundaries, cap})` (pure, LLM-free),
  `filterByCommitteeOrTopic(upcoming, query)`, `composeLeadAngles(leads, {enrich, generate, members,
  language, countTranscript})` (async, for the carousel angles).
- `agent/blockkit/story-leads.js` — `storyLeadsSection` (Home; **modify** → 1-line clusters + browse
  button), `storyLeadCards` (the `/gavel stories` list; **modify/replace** → carousel), `THEME_LABEL`,
  `TAG_LABEL`, `tagText`, `storyWatchButton`, `COPY`, `metaLine`. Extract shared labels if both Home +
  modal need them.
- `agent/listeners/actions/home-buttons.js` + `index.js` — the `views.open(trigger_id)` pattern and
  registration site for the new `story_browse` / filter / overflow handlers.
- `agent/blockkit/home-modals.js` (`addWatchModal`, `channelConfigModal`) — modal-builder + index
  export pattern to copy for `story-modal.js`.
- `agent/listeners/commands/gavel.js` — `runStories` (the `/gavel stories` path that feeds the
  carousel).
- `agent/home/deps.js` (`createHomeDeps`) / `agent/home/state.js` — boundaries + `listUpcoming`
  (fromDate = today) wiring.

**New:**
- `agent/blockkit/story-modal.js` — pure `storyModal(entries, {language, filter})` builder + tests.
- `agent/blockkit/story-labels.js` (optional) — shared theme/tag/district label tables.
- Carousel builder (in `story-leads.js` or a new `agent/blockkit/story-carousel.js`) + tests.
- Action handlers `story_browse`, `story_modal_filter`, `story_lead_overflow` + tests under
  `agent/tests/listeners/actions/`.
- A feasibility spike script (throwaway) for the carousel.

## Gotchas you'd otherwise re-derive

- **App Home / modal has no channel context** — Watch can't resolve a target channel like an alert
  card can. Every Watch path here opens the **pre-filled add-watch modal** (`makeDiscoverWatch`
  pattern). From inside the modal, use `views.push` to stack it.
- **Filter re-render = `views.update`** (need the `view_id` from the action body), not a new
  `views.open`.
- **`action_id`s must be unique within a view** (this bit FD-B + topic chips before). Give the modal's
  filter, overflow, and per-row buttons distinct ids; suffix per-item if needed.
- **No manifest/scopes change needed** for modals (`views.open/update/push` use the existing bot
  token + `trigger_id`). Carousel needs no new scope either — it's just a block. So **no manifest
  sync** required (same as `/gavel stories`).
- **Reporter gating** lives in `home-view.js` (`channels.some(c => c.role === 'reporter')`) and
  `home/state.js`. The modal should be reachable only when the section shows.
- **Language** is now **English-default, ES only if every channel is ES** (`home-view.js`,
  `channels.every(...)`). Match that in the modal.
- **biome:** one **pre-existing** error in the untouched `tests/alerts/match.test.js` — ignore it.
  `node --test` is **bare** (no path) for the full suite.

## Worktree / env setup (a fresh worktree needs this)

`.slack/`, `.env`, `.env.local`, `node_modules`, `convex/_generated` are **gitignored** and live only
in the main checkout `agent/`. For a new worktree off `main`:
1. `git worktree add .claude/worktrees/moo-130-rich-view -b tarikjmoody/moo-130-... origin/main`
   (MOO-130 is independent — branch off `main`, which has MOO-127/128 merged).
2. `cd agent`, `npm ci`, copy `.env` + `.env.local` from the main `agent/`, ensure `CONVEX_URL` is in
   `.env` (`app.js` loads `.env` only).
3. `npx convex dev --once` to generate `convex/_generated` (deployment `vivid-weasel-903`).
4. **npm ci gotcha:** if agent-SDK tests fail with `ERR_MODULE_NOT_FOUND
   @anthropic-ai/claude-agent-sdk`, re-run `npm ci`. Confirm `node_modules/@anthropic-ai/claude-agent-sdk`
   exists.

## Commands (from `agent/`)

tests `node --test` (**bare**) · lint `npx @biomejs/biome check .` (ignore the pre-existing
`match.test.js` error; `--write <files>` to auto-format your own) · Convex `npx convex dev --once`.
Deploy `gavel-app`: `fly deploy -c fly.app.toml --remote-only` from repo root (machine
`e8202d9a7d1078`). **Only if running `slack run` locally:** copy `.slack/` from main `agent/` and pause
Fly first (`fly machine stop e8202d9a7d1078 -a gavel-app`; restart after).

## Demo workspace (for live verification)

Enterprise Grid **Hackathon** workspace `T0B8KS540G4`; app `A0B8GP68PLJ` (bot "Gavel (local)"); Convex
dev deployment `vivid-weasel-903` = prod for both Fly apps. **Channels (live):** `#general`
(`C0B8KS5VCCC` — **role reporter**, EN, configured → exercises Surface A), `#sherman-park`
(`C0BARPFBGLS`, district 7), `#lindsay-heights` (`C0BAA9FUYQ7`, district 6), `#clarke-square`
(`C0BAPMK6HE2`, role organizer, **ES**, district 12), `#zoning` (`C0BBS06KKGE`, role association).
The reporter channel already exists, so the Story-leads section + browse button render today.

**Live data reality (this week):** `selectStoryLeads` returns ~6 leads → `clusterLeads` →
`🛡️ Police & public safety — 5 items` (one cluster, COMMON COUNCIL) + the Benzel BID #41 appointment as
a single with **📍 District 3**. 0 walk-on/consent anomalies this week. Verify with
`node scripts/story-radar-verify.mjs` (prints the ranked leads, the clustered App-Home view, and real
Claude angles for spot-checking).

## How to start

1. Re-auth Linear, verify with "list my Gavel issues."
2. **Feasibility spike** (above): prove `carousel` renders in a message on the deployed app. This
   decides whether Surface B ships or degrades.
3. `build MOO-130` → read the contract → brainstorm the modal layout + carousel card shape (the
   *surface* decision is made; the *layout* still wants a quick design) → worktree off `main` → spec →
   plan → TDD. The pure builders (`storyModal`, the carousel builder) come first (RED→GREEN), then the
   action handlers (`story_browse` / filter `views.update` / overflow `views.push`), then live verify
   on the reporter Home + `/gavel stories`, screenshot, PR → In Review → merge → deploy → Done.

## Broader project state (the map)

- **Shipped + deployed this session:** MOO-127 (Story Radar — pure newsworthiness scorer + grounded
  angles + App Home section + `/gavel stories`), MOO-128 (clustering by subject beat + district facet +
  English-default Home). Both merged to `main`, live on `gavel-app`, **In Review pending a Slack
  screenshot** (the only thing between them and Done).
- **MOO-130 (this)** — rich view (modal + carousel). High priority; the demo "wow" for the reporter
  persona.
- **MOO-129** — reporter **dossier** (tap a lead → video moment / transcript / minutes / votes,
  assembled from MOO-113/52/72). Backlog. MOO-130's modal links to it.
- **Discovery epic remaining:** MOO-124 (`whats_upcoming` ask-tool), MOO-125 (RTS→agenda
  community-memory bridge — carries the "never store Slack messages" guardrail).
- **Submission-critical:** MOO-62 (3-min demo video — *the* deliverable), MOO-63 (Devpost). Deadline
  **July 13**; internal freeze **July 9**.
- **Slack app store copy** (short + long description) was drafted this session — in the chat log if
  needed for the Devpost/marketplace listing.

## The one design decision worth a quick think (for MOO-130's brainstorm)

The modal's **filter** is a `static_select`, and changing it must re-render via `views.update`. But the
*data* (this week's leads) is fixed per open — so the filter is a **client-side-ish re-slice** of the
already-fetched `entries`, not a refetch. Decide: refetch `listUpcoming` on each filter change (simple,
a little slow) vs. stash the leads and re-filter (faster, needs the leads in `private_metadata` or a
re-`selectStoryLeads`). Recommended: re-run the cheap pure pipeline (`listUpcoming` is one Convex query,
~100 rows) on filter change — keeps it stateless, no `private_metadata` juggling. Confirm during the
brainstorm.
