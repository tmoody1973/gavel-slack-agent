# Build Handoff — MOO-77 (UX-E) & MOO-54 (sandbox seeding)

_Focused handoff to start the next build in a clean context window. Written 2026-06-15,
after the UX layer reached 4 of 5 shipped (MOO-73/74/75/76 all Done & deployed)._

**Read first, in order:** this doc → `CLAUDE.md` (the per-issue loop + Linear sync
protocol) → for MOO-77: `docs/superpowers/specs/2026-06-09-ux-blockkit-design.md` §2
"Mobilize/RSVP" → for MOO-54: `docs/Gavel _ Detailed Product Requirements Document
_PRD_.md` ("Real vs. Cached for Demo" table) + `docs/gavel-personas-features.md`.
Then re-auth Linear and pick an issue below.

---

## Where the project stands (2026-06-15)

**The persona-driven Block Kit UX layer is 4 of 5 done**, all live on prod and verified
against real Milwaukee data:

- **MOO-73 (UX-A)** — `agent/blockkit/` builder library + the three alert-card buttons
  wired for real (Watch → Convex, History → live Legistar timeline, Ask Gavel → primed
  thread); `removeWatch` + `/gavel unwatch`. (PR #14)
- **MOO-74 (UX-B)** — Hybrid App Home: status strip, watches (＋Watch/⋮remove), per-channel
  config Edit modal with a committee typeahead over 169 city bodies, graceful fallbacks.
  Files: `agent/blockkit/home-view.js`, `home-modals.js`, `agent/home/{state,publish,deps}.js`,
  `listeners/actions/home-buttons.js`, `listeners/views/home-modals.js`. (PR #15)
- **MOO-75 (UX-C)** — `render_receipt` in-process SDK tool: thread answers render native
  Data Tables / timelines / sponsor cards. `agent/agent/receipts/tool.js`; accumulator
  threaded through `runAgent` → `streamer.stop({blocks})`. Persona prompts re-cut. (PR #16)
- **MOO-76 (UX-D)** — Sunday Digest: `agent/blockkit/digest-card.js` (bilingual, quiet-week
  variant) + `agent/digest/build.js` + `agent/scripts/digest-once.mjs` + crontab
  `0 14 * * 0` on gavel-poller. (PR #17, `7209f05`)

Apps: `gavel-app` (Socket Mode agent/buttons/home/threads) + `gavel-poller` (supercronic:
poll every 5 min + the new Sunday digest) both live on Fly, current with main. Convex dev
deployment `vivid-weasel-903` is prod for both. 227/227 tests on main. Demo channel
**#general `C0B8KS5VCCC`**: 5 committees (ZND/City Plan/Licenses/CED/Board of Zoning Appeals),
keywords rezoning/demolition/zoning, **language `en`** (Tarik switched it Jun 10), watch
"Punta Cana LLC".

## ⚠️ Worktree + deploy checklist (two real outages came from skipping this)

Per-issue setup: `git worktree add` off `origin/main` → `npm ci` in `agent/` → copy `.env`
+ `.env.local` from the main checkout → **`npx convex dev --once`** (the generated
`agent/convex/_generated/` is gitignored but baked into the Docker image; skipping codegen
ships a crash-looping image) → baseline `node --test`. Verify deploys via `fly releases` /
machine uptime / `fly ssh console -C "cat /app/crontab"` — **NOT** the deploy exit code:
Fly reports "good state" for crash-looping Socket Mode apps, and log delivery lags minutes.
Full detail in memory `convex-codegen-before-deploy` (also covers the supercronic CRON_TZ
gotcha — use fixed-UTC cron expressions, never an inline `CRON_TZ=Zone` token).

## ⚠️ Standing human items (not blockers, but pinned)

1. **Rotate the chat-pasted Slack tokens** — `agent/.env` AND Fly secrets on BOTH
   `gavel-app` and `gavel-poller`. Sanity: `cd agent && node scripts/rts-smoke.mjs "test"`.
2. **MOO-43 ES fluency review** — `cd agent && node scripts/bilingual-verify.mjs` prints 3
   real cards; a native speaker signs off, then MOO-43 → Done.
3. Optional: interactive `slack` manifest sync to grant the bot `channels:read` (already in
   `agent/manifest.json`; the App Home currently uses the user token for channel names).

---

## ▶ RECOMMENDED NEXT: MOO-54 — Sandbox seeding (the demo-video blocker)

**Why first:** labeled P0 / demo-video blocker. With the July 13 deadline, the polished
agent is worth little without a believable sandbox to film and for judges to test. The RTS
"community memory" wow-beat (MOO-49/75) only lands if a channel actually contains prior
discussion to surface.

**Start with `superpowers:brainstorming`** — this is the one issue in the queue that isn't
obvious, because of the no-backdating wrinkle. Decisions to settle before any seeding:

1. **The hard constraint:** the Slack API CANNOT post messages with historical timestamps.
   So "2024-25 history" must be **real messages posted now, content-dated in the text**
   (e.g. "_[March 2024]_ Anyone know what's happening with the old foundry site?") and
   **disclosed as staged** in the demo (the PRD "Real vs. Cached for Demo" contract). Decide
   the content-dating convention so it reads believable AND honest.
2. **Tie the planted threads to REAL Legistar items** so the civic side and community side
   connect on camera. The digest/alerts already surface real files (e.g. the rezoning files
   #260176/#260175/#260047, and the existing "Punta Cana LLC" watch). Plant community chatter
   about those same entities so `search_community_memory` returns a thread that matches a
   live alert. The demo's developer/LLC thread should name an entity that also appears in the
   official record.
3. **The boundary-polygon criterion needs re-scoping.** The acceptance asks for "2-3
   hand-drawn boundary polygons," but the current Convex subscription schema supports only
   `boundary: {type: 'district', value}` (no polygons), and geo-matching is Phase 3 / was
   deprecated from the App Home (MOO-59 canceled). Flag this in the plan: either cut the
   polygon criterion (geo isn't built) or stub district boundaries only. Don't build geo
   infra for a seeding ticket.
4. **Seeding mechanism:** a scripted `agent/scripts/seed-sandbox.mjs` (WebClient
   `chat.postMessage` loop, like `poll-once.mjs`) posting the staged messages, vs. manual.
   Scripted is repeatable and re-runnable for a fresh sandbox.

**Acceptance (from the issue):** 2-3 neighborhood channels (e.g. #sherman-park,
#lindsay-heights), ≥1 set to Spanish preference (per-channel `language: 'es'` via
`upsertSubscription`/the App Home), plausible 2024-25 history incl. the developer/LLC thread
the demo surfaces, 2-3 boundary polygons (see #3 — likely re-scoped), staged-disclosure.
**Verify:** an RTS query against a seeded channel returns the planted thread; a judge/guest
account finds the same history (access works).

**Out of scope:** real production workspace data; backfilling a full message corpus.

**Watch out:** seeding writes real Slack messages into the workspace — that's fine (it's the
sandbox), but channel subscriptions must be set (`upsertSubscription`) or alerts/digests
won't reach the new channels, and the bot must be invited to each. RTS queries the workspace's
own history live and never stores it — seeding feeds RTS, it doesn't change the no-persistence
rule.

---

## ALTERNATIVE: MOO-77 — UX-E Mobilize/RSVP (the stretch / first-to-cut layer)

**Why maybe-not-now:** explicitly the cut-line layer (Low priority). It completes the UX set
but adds the least. Do it for completeness if MOO-54 is handled and there's runway.

**Intent:** turn hearing alerts into light collective action — an anonymous "🙋 I'm going"
count and a "📤 Share" button — with **zero person data stored** (the minimal-PII rule that
governs the whole project extends here).

**Shape it like the prior UX issues** (deps-injected factory handlers, the MOO-73/74 pattern):

- **New Convex table** (e.g. `eventRsvps`) storing ONLY `{client, eventItemId, count}` — **no
  Slack user IDs, ever.** Mutation `incrementRsvp({eventItemId})` → returns new count. Query
  `getRsvpCount`. This is the load-bearing constraint: if the design ever needs a user ID to
  work (e.g. real dedup), STOP and re-design — the issue says so explicitly.
- **🙋 I'm going button** added to alert cards in `agent/alerts/card.js`'s `actions` block
  (the card already carries `eventItemId` as the button value — reuse it). Handler in
  `listeners/actions/` (new `rsvp-buttons.js` or extend `alert-buttons.js`): ack → increment
  Convex → `chat.update` the card to add/refresh a "🙋 N neighbors going" context block →
  ephemeral confirm ("You're marked as going"). Dedup is best-effort via that ephemeral only
  (clicking twice double-counts — accepted limitation, stated in the issue).
- **📤 Share button** → opens a modal with a `conversations_select` → on `view_submission`,
  repost the card's blocks to the picked channel (carry no person data). Modal builder goes in
  `agent/blockkit/` (alongside `home-modals.js`); submission handler in `listeners/views/`.
- Failures degrade to ephemeral errors, never a crash (the established `postEphemeralSafe`
  pattern from `alert-buttons.js`).

**Decision to make in the plan:** which cards get the buttons — all alert cards, or only ones
tied to a hearing with a date/location? And how the count renders (chat.update the card to add
a context block is cleanest, since the count must "update on click").

**Verify (from the issue):** click "I'm going" on a real alert → paste the Convex row proving
it stores only `{eventItemId, count}` (no user IDs); count visibly increments (screenshot);
Share a real card to a second channel via the modal (screenshot); `node --test` green; deploy
`gavel-app`.

**Out of scope:** RSVP rosters, reminders, calendar invites, ANY per-user storage.

---

## Other unblocked roadmap (after the above)

MOO-53 watchlist sweep (the `watches` table is live and waiting), MOO-50 parcel MCP tools,
MOO-52 escalation ping. **Deadline: July 13, 2026.**
