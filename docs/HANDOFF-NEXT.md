# Build Handoff — next session (clean context window)

_Written **2026-06-26**. `main` @ **`57a6ace`** · **873 tests green**. Freeze ~**July 9**, submit **July 13**._

**Read first:** this doc → `CLAUDE.md` (per-issue loop + commands) → the spec linked in "THE IMMEDIATE NEXT" → re-auth Linear (browser flow; verify "list my Gavel issues").

---

## THE IMMEDIATE NEXT — two tracks, pick per priority

**Track A (recommended before anything else): the demo + submission.** The build is over-built for a 3-min
window; the score now moves in **packaging**, not features. The single highest-leverage action is recording
the demo (MOO-62). The demo pivoted to the **Midtown data center** — see `docs/DEMO-SCRIPT.md` (v2). All its
facts are **verified real**: June 29 **City Plan Commission** agenda (Final) has #260142 (citywide data-center
ordinance) + #260029/#260030 (the 5825 W Hope site); parcel = **AFS MILWAUKEE LLC, RB2, open violation**. The
Punta Cana fallback is preserved at `docs/DEMO-SCRIPT-fallback-puntacana.md` (don't delete until v2 is recorded).

**Track B (a fresh feature, spec'd + approved, NOT yet planned): Civic News Enrichment.**
- **Spec:** `docs/superpowers/specs/2026-06-26-civic-news-enrichment-design.md` (brainstormed + approved this session).
- **Next step:** invoke `superpowers:writing-plans` to turn it into a TDD task plan, then build. No code yet.
- **What it is:** one news-fetch service behind a `NewsSource` interface (Google News RSS now, Exa adapter
  later), **query + Claude relevance gate** for matching, surfaced two ways — enrich the alert card + a 5th
  `news` lane in `/gavel search`. Read-through Convex cache, real-links-only, graceful degrade on alerts.
- **Honest call:** it's good, but it competes with the demo. Slot it **after** the submission is locked unless
  you specifically want news in the demo.

---

## WHAT SHIPPED THIS SESSION (all merged to main)

1. **UX Mastery Curve** (PR #49 → `fabc5ac`): bilingual `/gavel` command surface (no English cliffs),
   one-next-step audit (fixed a zero-nudge gap in federated-card), App Home / one-tap guard tests.
2. **Help-search coverage** (PR #50): `/gavel search` added to the role-aware help modal + USER-GUIDE +
   per-persona case studies (the modal/guide were missing the headline `search` command).
3. **Civic Comment Submission tool — "✍️ Make my voice heard"** (MOO-171, PR #51 → `cbe8dd4`, deployed):
   from an alert, a resident drafts a bilingual public comment, reviews it, and files it. **Live-verified
   end-to-end** (real click in #general → modal with real Legistar title → submit → delivered to the test
   inbox). Guardrails: never fabricate a constituent, daily cap, demo-safe test-inbox override, safe-degrade.
4. **Demo pivot** to the Midtown data center + the resident-sentiment beat (DEMO-SCRIPT v2).
5. **Marketing copy** in `docs/marketing/linkedin-post.md` (LinkedIn launch post + a tech-stack companion post).

---

## DEPLOYED / ENV STATE

- **`gavel-app`** (Fly, Socket Mode) — **v47**. Runs the interactive agent incl. the civic-comment handlers.
  Secret **`CIVIC_COMMENT_TEST_INBOX=tarik@agentmail.to`** is set (all comment sends go there, never a real
  clerk). Deploy from **repo root**: `fly deploy -c fly.app.toml --remote-only`.
- **`gavel-poller`** (Fly, supercronic on `agent/crontab`) — **v10**. Posts alert cards via `poll-once.mjs`
  every `*/5`. **It now includes the ✍️ button** (was the bug this session: only gavel-app had been
  redeployed). Deploy from **`agent/`**: `cd agent && fly deploy --remote-only` (uses `agent/fly.toml`, app =
  gavel-poller). **Two apps — redeploy BOTH when alert-card or shared code changes.**
- **Convex dev `vivid-weasel-903`** — has the new `civicComments` table (audit + daily cap). `_generated` is
  gitignored but **image-baked** from the build context, so run `npx convex dev --once` before any deploy that
  touches a new table/function.
- Commands (from `agent/`): tests `node --test` (**873 green**) · lint `npx @biomejs/biome check .` · Convex `npx convex dev --once`.

## OPEN THREADS

- **MOO-171 stays In Review** for one demo-polish item: the modal opens on a **template** comment, then the
  Claude draft swaps in via `views.update` a beat later. In the live test the user submitted before the
  repaint, so the email carried the template. **Fix:** open with a "✨ Gavel is drafting…" placeholder
  (non-editable) → swap in the Claude draft, so a bare template can't be submitted. ~20 min TDD. The Beat 7 wow
  depends on it.
- **Real-recipient wiring (MOO-171 follow-up, not built):** comments currently only go to the test inbox.
  To actually reach the city you'd wire a per-committee clerk directory + pull the contact from the agenda,
  then remove the test-inbox override. Safe-degrade (no recipient → no send) is already built.
- **MOO-62 (demo video, P0):** record DEMO-SCRIPT v2. The human bottleneck. RTS wow needs an opposition-framed
  question (memory `rts-query-framing`).
- **MOO-63 (submission):** Devpost text + judge sandbox (slackhack@salesforce.com + testing@devpost.com). Fold
  in the civic-comment + data-center beats.
- **Civicmail Tue/Fri cron** is committed **disabled** — enable post-demo.
- **Test posts left in channels** (#general, #sherman-park, #clarke-square): button-bearing data-center alerts
  posted for screenshots. Delete them when done (the user has the bot token / I can chat.delete by ts).

## DECISIONS / GOTCHAS (durable)

- **Two Fly apps, redeploy both.** `gavel-app` (interactive) and `gavel-poller` (posts the cards). A change to
  a shared card builder (e.g. `alerts/card.js`) needs **both** redeployed or the live cards lag behind.
- **Subagent cwd leaks to main** (memory `subagent-cwd-leaks-to-main`): in worktree subagent-driven dev,
  implementer commits land on `main` unless you chain the absolute `cd` per command + a post-commit branch check.
- **AgentMail is REST, not the SDK in the app.** The `agentmail` npm package is in package.json but the app
  sends/reads via `fetch` to `https://api.agentmail.to/v0/inboxes/{inbox}/messages/send` (`{to:[...],subject,text}`,
  Bearer). The SDK import would crash boot. Inboxes: `mke-alerts@agentmail.to` (civic-mail), `tarik@agentmail.to` (test).
- **Org-wide Slack install** needs `team_id=T0B8KS540G4` on `users.conversations`/`conversations.list`; bot
  lacks `groups:read` (public channels only). Bot is in #general #random #lindsay-heights #clarke-square
  #sherman-park #zoning.
- **Story Radar covers all upcoming agendas (all committees), not minutes.** `/gavel stories` scores
  newsworthiness over `detectedAgendaItems` (un-subscription-gated). A retrospective minutes/transcript story
  analyzer is NOT built (plausible post-hackathon extension).
- **Demo facts** verified: data center = File #260030 (+#260029, +citywide ordinance #260142), CPC June 29
  Final; parcel 5825 W Hope = AFS MILWAUKEE LLC, RB2, $3.5M, open violation.

## MEMORIES (see `MEMORY.md`)
`subagent-cwd-leaks-to-main`, plus prior `demo-hero-item-260229`, `rts-query-framing`,
`civicmail-digest-recurring-not-raze`, `agentmail-enotify-real-shape`, `convex-codegen-before-deploy`,
`slack-grid-scopes`.
