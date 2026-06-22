# Win the Last Mile — the UX Mastery Curve

_Date: 2026-06-22 · Status: **Draft for review** · Context: Slack Agent Builder Challenge, **Agent for Good** track, submit **July 13, 2026**._

## Why this, why now

A judge's read of Gavel (this session): of the four equally-weighted criteria — Technological Implementation, Potential Impact, Quality of the Idea, **Design** — **Design is the softest axis**, and **Best UX** ($2k) is the most contested prize. But Design is also a **main-track** criterion, so this work raises the **Agent for Good** score where Gavel is *most* winnable, and one slice of it (bilingual completeness) simultaneously raises **Impact**.

The build is **over-built for a 3-minute judging window** — the remaining points are won in **legibility**, not features. This spec is UX polish, not new capability.

## The thesis

Gavel already has the *pieces* of a beginner→expert journey — App Home onboarding (FD-A–D), proactive bilingual alert cards, the record modal, first-watch→`#watchlist` growth, role-aware help, federated search with an empty state. But the curve is **uneven and invisible**:

- some surfaces offer **zero** next-steps (dead ends), some **two** (overwhelm);
- the **Spanish ramp has English cliffs** (e.g. `/gavel help` text, error/usage strings);
- a judge **can't see** the thoughtfulness in 3 minutes + a sandbox poke.

The last-mile work is to make the curve **coherent** (one next-step convention, no cliffs, bilingual-complete) and **visible** (a judge perceives "they designed the whole journey"). This is *completing and making-coherent* an existing curve — not building from scratch.

## Design principles (the spine)

1. **Value before learning.** The beginner gets value with zero commands (the unprompted alert). This is Gavel's single biggest UX asset — most teams make you ask a bot. Protect it.
2. **One contextual next-step.** Every Gavel-posted surface offers exactly one next move, appropriate to the user's position — never zero (dead end), never two (overwhelm).
3. **Optional progression.** Staying a happy beginner is a UX **win**, not a failure. No tutorials, no nagging, no "you haven't tried X."
4. **No cliffs.** Especially the Spanish ramp: the expert tier must be as complete in ES as the beginner alert.
5. **Make the curve visible.** The progression must be perceptible to a judge in the 3-min video + a sandbox poke.

## Three ramps, not one ladder

The personas are not three rungs of one ladder — they are three parallel ramps at different starting heights, and progression is **optional**.

| Persona | Starts at | "Good" looks like | The cliff to fix |
|---|---|---|---|
| **Denise** — resident, EN | Stage 0 (zero knowledge) | Gets value forever **without learning a command**; never feels dumb | A context-free alert to a brand-new member; no idea `/gavel` exists |
| **Marcos** — organizer, ES | Stage 2–3 (motivated) | Climbs the whole ramp **in Spanish** | English cliffs at the top (help, errors, affordances) |
| **Rachel** — reporter, EN | Stage 4 (power user day one) | **Speed + depth**; one tap to the dossier | Power features buried in overflow menus |

## Scope — the units of work

Each unit is small, testable, and follows the existing card/handler patterns (pure builders + injected boundaries). **Core** ships before the freeze; **Stretch** is verify-existing / if-time.

### CORE

**U1 · First-contact card (Stage 0→1).**
A one-time, warm, **dismissible** bilingual orientation card the first time Gavel posts to a channel (or a user first opens App Home): *"👋 I'm Gavel — I watch City Hall for this neighborhood and post here when something affects you. You don't have to do anything."* Reuse the existing `welcomePostedAt` flag (FD-B) so it never repeats.
- *Acceptance:* a brand-new channel sees it exactly once; bilingual per channel language; dismiss → never again; it sets expectations then gets out of the way.

**U2 · The one-next-step audit (Stage 1→2).**
Audit **every** Gavel-posted surface — alert card, "From the city" digest, record modal, search results, watch confirmation, status — so each carries **exactly one** contextual next-step, matched to the curve position (alert→Watch, digest→Search, first-watch→`#watchlist`). Establish a single visible "→ next" convention.
- *Acceptance:* every surface has exactly one next-step (automated test asserts presence + uniqueness); the step matches the persona/position; no surface is a dead end.

**U3 · Bilingual completeness (no cliffs).**
Localize the remaining English surfaces: `/gavel help` text, usage strings, error messages, and any English affordance. The Spanish ramp must have no English at any rung.
- *Acceptance:* an ES-channel user never sees English in help/errors/usage/affordances; automated tests assert ES strings on those paths. Double-scores Design **and** Impact.

**U4 · Empty + error states (the polish judges poke).**
Audit search / watch / status / modal: every dead-end becomes a **soft redirect with a next step**, written with warmth (not a stack trace, not a bare "no results").
- *Acceptance:* each empty/error path returns a helpful, bilingual next move; tests assert the redirect text.

### STRETCH (verify-existing / if time)

**U5 · App Home as the mastery hub.**
Verify App Home reads as the home base the curve graduates into — *Discover this week* (beginner browse) · *Your watches* (intermediate) · a single *try-this* command hint (toward expert), role-tailored. Tighten the copy and the one-next-step; do **not** rebuild.

**U6 · Expert one-tap depth.**
From an alert, the highest-value power action (dossier / related / watch-owner) is reachable in **one tap**, not buried in an overflow menu. Scope tightly — reduce taps, don't add features.

## Making the curve visible to judges (the bridge)

Building it isn't enough — a judge must *see* it. Two surfaces carry this (detailed in the separate demo/packaging spec, referenced here so they aren't dropped):

- **A 20–30s demo beat** *or* Devpost "UX journey" framing: *"from a brand-new neighbor to a power-user reporter — same product, no manual."*
- **The seeded judge sandbox (MOO-63)** must let a judge *walk the curve*: a clean first-contact, the App Home hub, a bilingual alert, the record modal, and a power-user search — all reachable in a few clicks.

## Out of scope (decompose — separate specs)

- The 3-minute **demo re-cut + Devpost text + architecture-diagram** polish — the *other* "win the last mile" spec (packaging/legibility), to be written next.
- New power features or heavy expert-tier refactors — YAGNI before freeze.
- A new visual design system / aesthetic overhaul — the utilitarian-civic look is intentional and the risk/reward before freeze is wrong.
- The MOO-153 watchlist-interrupt path — tracked separately; not UX-curve work.

## Verification (how we'll know it worked)

- **The stranger test (the real bar):** someone who has never seen Gavel, handed the sandbox, reaches "I get value" with **no help** (beginner ramp) **and** can find a power feature when prompted (expert ramp) — no cliff, no dead end, no English for a Spanish user.
- Automated: every Gavel surface has exactly one next-step; ES paths have no English; empty/error paths redirect; `node --test` green; `biome` clean.
- Judge-legibility: a viewer of the 3-min video can point to "the beginner experience" and "the power-user experience" as distinct, intentional moments.

## Sequencing

U3 (bilingual completeness) and U1 (first-contact) first — they double-score and are the most visible. Then U2 (one-next-step audit) and U4 (empty/error). U5–U6 as time allows. Each is an independent, shippable change; none blocks another.
