# Gavel UX layer — persona-driven Block Kit (design)

_Approved 2026-06-09. Brainstormed against the hackathon Design criterion ("is the UX
well thought out; is there a balanced blend of frontend and backend") and the three PRD
personas (`docs/gavel-personas-features.md`). Slack reference:
https://slack.dev/build-richer-agent-experiences-with-block-kit/_

## Problem

Gavel's backend is deep (poller, bilingual summarizer, RTS, council directory, detectors)
but its frontend is thin: the App Home is a static paragraph, the alert card's three
buttons are stubs, and agent thread answers are prose-only. The personas each hit the gap:
Denise clicks **Watch** and nothing real happens (P1.5); Marcos has no no-typing way to
manage three neighborhoods' config (P2.3); Rachel gets paragraphs where she needs
publishable receipts — tables, timestamps, sources (P3.4).

## Decisions (brainstormed, visual companion used)

1. **Goal: complete product UX** — all three personas fully served, not just demo beats.
2. **App Home: Hybrid (option C)** — status strip up top (Denise), watches + per-channel
   config controls below (Marcos).
3. **Thread answers: prose + structured receipts (option B)** — short narrative lead,
   then vote table / sponsor card / timeline when the answer type calls for it.
4. **Card buttons: all three wired** — Watch (real row), History (timeline in thread),
   Ask Gavel (primed thread).
5. **Extras in scope:** persona prompts + error states (absorbs MOO-60), Sunday Digest
   card design (cron stays MOO-58), Mobilize/RSVP (explicit cut-line layer).
6. **Architecture: renderer library + render tool (approach 1)** — over new-blocks-first
   (availability risk) and agent-composed raw blocks (fragility).

## §1 Architecture

New pure module **`agent/blockkit/`** — one typed builder per artifact:

| Builder | Renders | Used by |
|---|---|---|
| `voteTable(votes)` | member→vote table (Data Table block if the spike passes; aligned monospace section fallback — Slack mrkdwn has no native tables) | threads |
| `sponsorCard(member)` | headshot context block (generalizes MOO-72's `buildMemberContextBlock`) | threads, alerts |
| `matterCard(matter)` | file number, title, status, links | threads |
| `historyTimeline(actions)` | date → action → result timeline | threads, History button |
| `digestCard(week)` | "📬 Your civic week" weekly card | Sunday Digest |
| `homeView(state)` | the Hybrid App Home | App Home |
| `errorReply(kind)` | designed "information unavailable" copy, EN/ES | threads |

All builders are pure functions over plain data (the `alerts/card.js` standard), unit-
tested, shared by every surface so the visual vocabulary stays coherent.

**Thread receipts mechanism — the `render_receipt` SDK tool** (MOO-49's in-process tool
pattern): Claude calls it with typed data
(`{type: 'votes' | 'sponsor' | 'matter' | 'timeline', …payload}`), Zod validates, the
handler converts via the builders and accumulates blocks in `deps`; `message.js` /
`app-mentioned.js` attach accumulated blocks via `streamer.stop({ blocks })` exactly as
feedback buttons attach today. **Claude supplies data, never raw Block Kit JSON.**

**New-blocks spike (curl-before-commit, inside UX-A):** ~30 min testing whether Slack's
new agent blocks (Card, Data Table, Alert) post successfully for app A0B8GP68PLJ via
Bolt 4.7.3. Pass → `voteTable` uses Data Table. Fail → monospace fallback. Nothing else
depends on the outcome.

## §2 Surfaces → personas

### Hybrid App Home (Denise + Marcos) — supersedes MOO-59
- **Top strip:** "🏛️ This week: N meetings touch your subscriptions · ⚠️ M added late ·
  K watch hits" — from Convex (subscriptions, watches, detected rows) + the poller's
  event window.
- **Watches section:** list + "＋ Watch" (modal input) + remove (overflow menu). Requires
  one new Convex mutation, `removeWatch` — which also un-stubs `/gavel unwatch` for free.
- **Channel config rows:** per subscribed channel — committees, keywords, language —
  with **Edit → Block Kit modal** (committee multi-select, keyword text input, EN/ES
  radio) writing through existing `upsertSubscription`/`setLanguage` mutations, then
  re-publishing the Home view.
- **Empty state:** no subscriptions → setup CTA explaining `/gavel` and channel invites,
  never a blank screen.

### Wired alert-card buttons (Denise's P1.5 action path) — replaces the MOO-44 stubs
- **👁 Watch** → `addWatch` on the card's file number → ephemeral "Watching File #X —
  I'll alert this channel when it moves."
- **🕓 History** → fetch `MatterHistory` live → `historyTimeline` posted as a **thread
  reply under the card** (the receipt stays attached to the alert).
- **💬 Ask Gavel** → primed thread reply under the card ("What would you like to know
  about File #X?") + agent session pre-seeded with the matter context; the user types in
  that thread.

### Thread receipts (Rachel)
System-prompt section: when an answer contains vote records, matter history, or sponsor
identification, call `render_receipt` with the data. Result: prose lead (streams as
today) + table/card/timeline blocks attached at stream end + source context line.

### Persona prompts + error states — absorbs MOO-60
- Suggested prompts re-cut, one per persona + ES:
  Denise "What's happening near my neighborhood this week?" · Marcos "¿Qué decisiones
  está por tomar la ciudad esta semana?" · Rachel "Show me the vote record on a file" ·
  watch-flavored "What's new on the things this channel watches?"
- `errorReply(kind)` designs the `information_unavailable` pattern: say plainly what is
  missing, say what Gavel CAN do (link the Legistar page, offer a watch), never fake.
  EN/ES per thread language.

### Sunday Digest card (Denise's P1.6) — design here, cron stays MOO-58
"📬 *Your civic week* — N items in your subscriptions, 1 needs attention" + top-3 items
as one-liners with file links + how-to-be-heard footer + "manage in App Home" context.

### Mobilize/RSVP (Marcos's P2.4) — the explicit cut-line layer (UX-E, first to cut)
- "🙋 I'm going" button on hearing alerts → increments an **anonymous count** per event
  item ("5 neighbors going") — **no Slack user IDs stored** (the subscriptions table's
  minimal-PII rule extends here; dedup is best-effort via ephemeral confirm, accepted).
- "📤 Share" → reposts the alert card to a channel the user picks (conversations select
  in a modal); the card carries no person data.

## §3 Data flow

- Home: `app_home_opened` → read Convex + cached week events → `homeView(state)` →
  `views.publish`. Modal submit → `view_submission` handler → mutation → re-publish.
- Buttons: `block_actions` → ack → mutation/fetch → ephemeral or thread reply.
- Threads: agent loop → `render_receipt(data)` (0..n calls) → blocks accumulate in deps →
  `streamer.stop({ blocks: [...receipts, ...feedback] })`.
- Digest: weekly cron (MOO-58) → same Convex reads as the Home strip → `digestCard` →
  post per subscribed channel in its language.

## §4 Error handling

- Zod-validated `render_receipt` payloads; invalid → tool returns the validation message,
  the agent corrects or falls back to prose. A failed render never loses the prose answer.
- Slack caps respected: 50 blocks/message — receipts truncated with a "full record →"
  Legistar link when long.
- Every fetch failure on Home/buttons degrades to the current behavior (static-ish view,
  ephemeral error) — never a crash, never a blank surface.
- Modal validation errors returned inline via `response_action: 'errors'`.

## §5 Testing

- Builders: pure unit tests, golden-shape assertions (the `merge.js` standard).
- Handlers: node:test fakes asserting ack-first, mutation calls, view payload shapes.
- `render_receipt`: payload validation, block accumulation, cap truncation.
- Live gates per surface (issue verification): Home screenshot with real data; real
  button clicks writing real Convex rows; a real vote-record question rendering a real
  table; digest card posted to the demo channel.

## §6 Delivery decomposition (one shippable issue each, in order)

| # | Issue | Contents | Roadmap effect |
|---|---|---|---|
| UX-A | Block Kit foundation + wired card buttons | `agent/blockkit/` core builders, new-blocks spike, three real button handlers, `removeWatch` mutation | replaces MOO-44 stubs |
| UX-B | Hybrid App Home | `homeView` + modals + empty states | supersedes MOO-59 |
| UX-C | Thread receipts + prompts + error states | `render_receipt` tool, prompt section, persona prompts, `errorReply` | absorbs MOO-60 |
| UX-D | Sunday Digest | `digestCard` + weekly cron | re-scopes MOO-58 |
| UX-E | Mobilize/RSVP | count + share, no PII | new (stretch; first to cut) |

## Out of scope

Homeowner-facing surfaces, funder activity exports, cross-meeting analytics (personas
doc parking lot). Vector/transcript surfaces (Phase 4 issues own their UX). Changing the
alert card's existing layout (MOO-43/44/51/72 work stays as shipped).
