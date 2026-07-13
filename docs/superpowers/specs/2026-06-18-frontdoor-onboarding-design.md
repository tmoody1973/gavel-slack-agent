# Gavel Front Door — onboarding + adaptive channel model (design)

_2026-06-18 · companion to `gavel-personas-features.md` and the 2026-06-09 UX spec.
Brainstormed with the visual companion; mockups persist in
`.superpowers/brainstorm/50262-1781808135/content/` (cohesion-map, channel-model,
onboarding-audience, onboarding-flow, frontdoor-journey)._

## Problem

Gavel is a **capabilities layer without a product layer**. Every feature is built and
live-verified — alerts, zoning RAG, transcript search, watchlists, RTS, parcel tools,
receipts, bilingual — but there is no *front door*. Mapping the three personas onto a
journey (Discover → Onboard → Channels → Daily value → Act), the whole gap is the **left
side**: Discover/Onboard are empty and the channel model is undefined, while Daily-value
and Act are green. A new neighborhood association cannot get from "install" to "first
alert" without insider knowledge, and an everyday resident who joins a channel meets a
bot with no introduction.

This is the thing that makes Gavel feel like a bag of tools instead of one product — and
it directly blocks the "best UX" goal, because judges feel a product in its first 30
seconds, and Gavel's first 30 seconds are currently "a bot appeared."

This spec designs **the Front Door only**: onboarding + the channel model. The rich
Block-Kit surface redesign is the deliberate next cycle (see Out of scope).

## Decisions (brainstormed via visual companion)

1. **Anchor = the Front Door** (onboarding + channel model). The rich Block Kit redesign
   (Card/Alert/Carousel/Data Table) and Thinking Steps in the Ask-Gavel thread are
   **workstream B**, the next cycle — out of scope here. Activation before polish.
2. **Channel model = Adaptive default.** Everyone starts at one `#civic-alerts`. The
   information architecture *grows* (per-area channels, `#gavel-watchlist`) only when the
   user needs it, and Gavel **proposes** the structure via a guided checklist. No
   auto-create — the Grid install has no `channels:manage` and the org won't grant it.
3. **Audience = admin setup _and_ member welcome.** The installer gets the rich guided
   flow; every resident gets a 5-second welcome the first time they meet Gavel.
4. **Flow shape = Hybrid.** A warm agent intro → one human question (your role) →
   role-prefilled confirmation of the structured config.
5. **Surface/trigger = App Home is the hub; the active moment is a nudge → modal.** App
   Homes are passive and cannot be opened programmatically, so betting activation on
   "they'll open the Home" is the one place this design could quietly fail. The active
   onboarding step is a **modal** (`views.open`, the only on-demand Slack surface), driven
   by a nudge; the App Home holds persistent status, re-entry, and a first-run fallback.
6. **2-taps-to-live.** Pick role → "Go live" with defaults. *Everything* else (tweak
   committees, language, area, add channels) is optional and deferred to the App Home.
   Denise is busy and non-technical; the defaults exist so the floor is two taps.

## §1 Architecture

**Reuses (no change):** the hybrid App Home (MOO-54), `view_submission` modal handlers,
per-channel `subscriptions` + `language` in Convex, `/gavel` commands, the `agent/blockkit/`
renderer library, and the bilingual native-generation rule.

**New, small:**

| Unit | Purpose | Pure? |
|---|---|---|
| `agent/onboarding/defaults.js` | `defaultsForRole(role)` → `{committees[], language, extras[], channelShape}` — the engine | ✅ pure |
| `agent/onboarding/copy.js` | curated EN/ES static onboarding strings (mostly static → no Claude calls) | ✅ pure |
| `agent/blockkit/onboarding.js` | builders: `nudgeCard`, `roleModal`, `confirmModal(role,defaults)`, `memberWelcomeCard(lang)`, `growChecklistCard`, `homeFirstRun` / `homeConfigured` | ✅ pure |
| `agent/listeners/onboarding/*` | nudge trigger · `views.open` on button · `view_submission` write · `member_joined_channel` welcome | I/O |

**Convex data-model additions** (fields on the existing per-channel config doc; do not
create a parallel store):

- `configured: boolean`
- `role?: 'association' | 'organizer' | 'reporter'`
- `onboardedAt?: number`
- `welcomePostedAt?: number` — dedups the member welcome
- (`subscriptions`, `language` already exist)

Keep a minimal per-workspace install marker only if needed to fire the first nudge once.

## §2 Surfaces & flow

### Trigger / nudge (active)
On install, first `/gavel`, or Gavel being added to a channel → DM the installer **and**
post one line in the channel: *"👋 I'm Gavel — I watch Milwaukee city hall so your
neighbors don't have to. [Set up Gavel]"*. The button does `views.open`.

### Setup modal — the 2-tap core
- **View 1 — one question:** "What do you run?" → three role buttons (👵 Association ·
  📣 Organizer · 📰 Reporter).
- **View 2 — confirm (pushed):** pre-filled from `defaultsForRole(role)` — committees,
  language, area. Primary button **"Go live"** (tap 2). A secondary "Customize…" reveals
  the optional fields, but the default path is two taps.
- **On submit:** write `subscriptions` + `language` + `role` + `configured=true` +
  `onboardedAt`; republish the Home (configured state); post a *"✅ You're live — here's
  what I'll watch for you"* confirmation in `#civic-alerts`.

### App Home (the hub)
- **First-run state** (landed here before setup): warm intro + a "Set up Gavel" button
  (same modal) — the fallback path.
- **Configured state:** status strip (✅ `#civic-alerts` · committees · language · digest),
  "Set up another channel," watches, and the existing per-channel config modals.

### Member welcome (passive, once per channel)
`member_joined_channel` for a human in a configured civic channel → post the welcome card
**once** (guard with `welcomePostedAt`): *"I watch Milwaukee city hall for your block.
You'll see plain-language alerts here before the vote. Ask me anything in a thread or DM."*
Bilingual per the channel's `language`. Actions: **Ask Gavel** (opens a thread) ·
**What can you do?**. The "What can you do?" reply surfaces a concrete transcript example
(*"Try: what did the committee say about the Hopkins Street sale?"*) so the third memory is
discoverable, not hidden (see §3.1). v1 posts once per channel (not per joiner) to avoid spam.

### Adaptive growth (guided checklist, deferred — no auto-create)
- On the **first** successful `addWatch` → append *"Want watch-hits in their own
  `#gavel-watchlist`? [How →]"* → a checklist card (create the channel · `/invite @Gavel` ·
  done).
- Role = organizer, or a Home action "I cover multiple neighborhoods" → proposes per-area
  channels: suggested names + per-channel language + invite steps. Gavel proposes; the
  human creates.

## §3 Role → defaults (the engine, the cohesion fix)

`defaultsForRole(role)` is the single source of truth; onboarding just writes its output.
This is the mechanism that turns setup into *confirming* and routes already-built
capabilities to the right person.

| Role | Committees (pre-filled) | Language | Channel shape | Extras on |
|---|---|---|---|---|
| 👵 **Association** (Denise) | Zoning (ZND) · Licenses · CED | English | one channel | Sunday digest · "how to be heard" · ▶ meeting clips in alerts |
| 📣 **Organizer** (Marcos) | Zoning · Licenses · permits | Spanish | multi-area prompt + watchlist | watchlists · ownership tools · bilingual transcript search |
| 📰 **Reporter** (Rachel) | all committees | English | one channel + Ask-thread | agenda-change / walk-on · transcript-search primer |

Defaults are a starting point, fully editable in the confirm modal and later in the Home.

### §3.1 Persona use of the transcript & video memory (MOO-113)

The third memory — the `transcripts` namespace + `search_transcripts` / `get_video_moment`
+ the inline 90-second clip + `matterOutcomes` ("what was decided") — is already shipped.
The Front Door's job is to **route each persona to it the way they actually use it**. The
three personas relate to it completely differently, and onboarding should reflect that. (The
*rich presentation* — the clip card, Thinking Steps showing search receipts live — is
workstream B; here we only introduce and route.)

| Persona | How they use video / transcripts | How the Front Door routes them |
|---|---|---|
| 👵 **Denise** | Can't attend weekday afternoon, 4-hour webcasts (P1.3). Wants the **90-second clip + "what was said"** delivered to her — never searches. | Association alerts about her items carry **"▶ watch the 90s where they discussed this"** + a one-line outcome from `matterOutcomes`. Passive; no search UI. |
| 📣 **Marcos** | Accountability + mobilization: "find where they said X about this owner," **in Spanish**, then share the clip to rally people (P2.4). | Organizer welcome/primer includes a bilingual example — *"¿Qué dijo el comité sobre…?"* → quote + shareable clip. Watchlist hits deep-link to the moment. |
| 📰 **Rachel** | Her **core tool**: searches what was *said* for publishable receipts + timestamps (P3.1, P3.4), reconstructs the record at deadline pace. | Reporter primer leads with **"Ask me what was said in any meeting"** — `search_transcripts` examples + agenda-change alerts. The query surface is her home base. |

This is why the member-welcome **"What can you do?"** affordance and the reporter on-ramp
both surface a transcript example (e.g. *"Try: what did the committee say about the Hopkins
Street sale?"*) — it makes the third memory discoverable instead of a tool you have to
already know exists. Per role, onboarding adds: **Association** → clips attached to her
alerts (no search UI); **Organizer** → a bilingual "ask what was said" example; **Reporter**
→ the transcript-search primer as the centerpiece of her Ask-Gavel on-ramp.

## §4 Data flow

`install / /gavel / channel-add` → **nudge** → button (`views.open`) → **role select** →
**confirm(defaults)** → `view_submission` → Convex write (`subscriptions`, `language`,
`role`, `configured`) → republish Home + confirmation. `member_joined_channel` → welcome
card (dedup via `welcomePostedAt`). First `addWatch` → grow proposal.

## §5 Error handling

- `view_submission` validation (no committees, bad area) → `response_action: 'errors'`.
- **Idempotent re-entry:** re-running setup updates the existing channel config; never
  duplicates subscriptions or re-posts the live confirmation.
- **Missing post scope** in a channel → fall back to a DM with `/invite @Gavel` instructions.
- Member welcome dedup guarantees it never double-posts.
- Republish the App Home after every mutation.

## §6 Testing

- **Unit (pure):** `defaultsForRole` per role → expected config; every block builder
  (nudge, role modal, confirm modal, welcome, grow, both Home states).
- **Handler:** confirm-modal `view_submission` → Convex write (mock convex);
  `member_joined_channel` dedup logic.
- **Live (verification gate + demo):** full flow in the demo workspace — install nudge →
  modal → Go live → first alert; join as a member → welcome card. Screenshots.

## §7 Delivery decomposition (one shippable issue each, in order)

1. **FD-A** — role→defaults engine + EN/ES copy (pure, fully tested).
2. **FD-B** — nudge + setup/confirm modals + Convex write + Home first-run/configured states
   (the 2-tap core; the load-bearing issue).
3. **FD-C** — member welcome card + dedup.
4. **FD-D** — adaptive-growth guided checklist (watchlist + per-area); lightest, can trail.

## Personas served & best-UX thesis

- **Denise** — 2-taps-to-live + member welcome = activation without insider knowledge (Impact).
- **Marcos** — organizer defaults (Spanish, multi-area prompt, watchlist) = equity on-ramp (Agent for Good).
- **Rachel** — reporter defaults (all committees, agenda-change) = power-user routing (Quality/Tech).

**Strategic note:** the Front Door *removes the disqualifier* (incoherence). The award-winning
*wow* lives in **workstream B** (rich Block Kit + Thinking Steps receipts). Keep this spec lean
(the 2-taps rule is also a scope discipline) to protect runway for B before July 13.

## Out of scope (→ workstream B, next cycle)

- Rich Block Kit redesign of alert/digest/receipt cards (Card · Alert · Carousel · Data Table).
- Thinking Steps in the Ask-Gavel thread (`chat.*Stream`, Plan/Timeline, URL Sources).
- Power-user query primer (Rachel's ask-anything onboarding).
- Auto-creating channels (blocked by Grid scopes).
  - Any re-architecture of existing alert/poller/summarizer logic.
