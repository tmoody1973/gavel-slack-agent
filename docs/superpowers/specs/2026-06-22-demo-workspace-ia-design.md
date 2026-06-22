# Demo Workspace Information Architecture — Design Spec (rev 2)

_2026-06-22. Set up the Gavel demo Slack workspace with persona-clean channels and correct
per-channel alert configuration, so a Milwaukee resident — or a hackathon judge with sandbox
access — immediately understands what Gavel is and who it's for. Pre-demo polish for MOO-62._

**Rev 2 — after an adversarial Codex review (verified against the code).** Two real bugs in rev 1
were confirmed and fixed here: (a) the alert matcher is OR-based, so "trim keywords to keep channels
local" was false; (b) rev-1 districts contradicted Gavel's own neighborhood resolver. Details inline.

## Problem

The live workspace is incoherent for a cold visitor (state 2026-06-22): a kitchen-sink `#general`
(reporter, 35 keywords), a `#zoning` topic channel that maps to no persona, `#lindsay-heights` with no
role, `#sherman-park` on the wrong district, `#random` noise, and no "you are here." Personas don't map
to legible, Milwaukee-recognizable channels.

## Design principle: Place + Beat

Two real axes; everything else is machinery underneath.

- **Place** (residents / organizers) → **neighborhood channels**, named for real Milwaukee
  neighborhoods, with the **district shown in the channel topic** (not hidden, not the channel name).
  Place-first names so "anyone from Milwaukee" recognizes them; district-visible metadata so a wrong
  mapping is catchable, not buried (Codex #5).
- **Beat** (reporter) → **#newsroom**, citywide across all committees. This is where the legitimate
  citywide-topic/department need is served. (Codex argued for optional `#beat-*` channels; deferred to
  real deployment — for a 3-min demo they cost legibility for a need #newsroom covers.)

**No district-number channels. No department/committee channels in the demo.**

### Geography must match Gavel's own resolver (Codex #2–4, verified)

`geo/neighborhoods.js` `districtForNeighborhood()` is the product's source of truth, and a judge can
query it. Verified values: **Sherman Park → 15**, **Clarke Square → 8**, **Historic Mitchell Street →
12**, **Walker's Point → 12**; **"Lindsay Heights" → null** (a real neighborhood the resolver is simply
missing). Rev 1's districts (7 / 12 / 6) contradicted this. Fixes:

- `#sherman-park` → **district 15** (Ald. Russell W. Stamper II). Resolver-consistent.
- The hero channel is renamed so name ↔ district ↔ hero-address all agree (see below).
- **Add "Lindsay Heights" → 6 to the resolver** (it's genuinely Ald. Coggs's district 6). This fixes
  the root-cause gap and keeps the recognizable channel name, rather than renaming a real neighborhood
  away (first-principles over a cosmetic rename).

### Routing reality: the matcher ORs, so "neighborhood = local" is not free (Codex #1/#8, verified)

`agent/alerts/match.js:24` routes on `committeeHit || keywordHit || districtHit`. A channel subscribed
to a committee receives **every citywide item for that committee** — keyword trimming does not gate
that. And Legistar detected items carry **no district** in the matcher (`districtHit` is E-Notify only),
so geo can't gate them today without per-item address extraction (a scope-cut feature).

**Decision (demo-scoped): work around it, don't re-architect now.**
- **Neighborhood channels drop broad committee subscriptions** and route on **keywords (+ district for
  E-Notify)** only — so they don't vacuum up citywide committee traffic.
- **#newsroom keeps the broad committees** — it *should* be citywide, so committee-based routing is
  correct there.
- The demo's hero + sample alerts are **staged into channels directly**, so routing correctness isn't
  load-bearing for the recording.
- **Logged as a known real-deployment limitation:** true neighborhood locality needs the matcher to
  gate geo (`geoHit && (topicHit || watchHit)`) + per-item district extraction. Out of scope for MOO-62.

### Identity framing: neighbors + association, not board-only (Codex #7)

Denise is an association president, but the impact story is *residents* finding out before leverage is
gone. Keep `role=association` in config; visible copy says **"Sherman Park neighbors tracking City
Hall,"** not "association working channel."

## The Clean 5

| Channel | Persona | role | lang | district · alder | committees | topics (keywords) |
|---|---|---|---|---|---|---|
| **#start-here** | judges / everyone | — | — | — | — | none (Canvas + judge path) |
| **#sherman-park** | Denise — neighbors + assoc | `association` | en | **15** · Ald. Stamper | — (none; see routing) | rezoning, demolition, development |
| **#near-south-side-es** _(rename of #clarke-square)_ | Marcos — hero | `organizer` | **es** | **12** · Ald. Pérez (Council Pres) | — (none) | liquor license, Punta Cana, rezoning |
| **#lindsay-heights** | Marcos — 2nd neighborhood | `organizer` | en | **6** · Ald. Coggs | — (none) | development, vacant lot, demolition |
| **#newsroom** | Rachel — reporter | `reporter` | en | — citywide | ZND · LICENSES · COMMUNITY & ECONOMIC DEVELOPMENT · CITY PLAN COMMISSION | (light) |

Each place channel's **topic line** shows "Neighborhood · District N · Ald. Name · topics" so the
hidden config is visible and checkable. The hero channel is the **existing** `#clarke-square`
(`C0BAPMK6HE2`, which holds all the seeded Punta Cana content, opposition thread, clip, RTS index) —
**renamed** to `#near-south-side-es` (district 12 = the real district of 2000 S 13th St, Historic
Mitchell St area). All seeded content stays in place; only the name + boundary change.

## Division of labor (the `channels:manage` / `pins:write` constraint)

**Tarik — manually in Slack (~5 min):** create `#start-here` + `#newsroom`; rename `#clarke-square` →
`#near-south-side-es`; archive `#general` + `#zoning` + `#random`; set each channel's topic line; invite
`@Gavel` to the new channels; **add the judges to all demo channels up front** (Codex #12 — guests
don't auto-join); pin the Canvas in `#start-here`.

**Claude — via scripts + Convex (no new scopes):**
1. **Set all 5 subscriptions** to the table (correct districts, role, language; **drop committees from
   neighborhood channels**; trim keywords to the small plain set; #newsroom keeps broad committees).
2. **Add "Lindsay Heights" → 6 to `geo/neighborhoods.js`** + a resolver test.
3. **Publish the Canvas** to `#start-here` + a "👋 Judges start here" message that **links the three
   persona channels and says what to inspect in each** (Denise: a local alert + how-to-be-heard;
   Marcos: the Spanish hero + owner/watchlist; Rachel: story leads + video). (Codex #12)
4. **Stage one representative sample alert per persona channel** (reuse MOO-122 / MOO-119), each
   on-identity; plus **one live alert fired through the real pipeline** with a visible
   `Sandbox demo alert · generated <time>` label — to prove the *route*, not just the card. (Codex #10)
5. **Native-Spanish review of the `#near-south-side-es` UX** (alert card, topic, welcome, "how to be
   heard") — now **in scope**, because it's the one equity feature judges will touch. (Codex #9)
6. **Write a manifest preflight verifier** (`scripts/workspace-verify.mjs`): expected channels, bot
   membership, subscription config, topic text, sample-alert presence, Canvas reachability, RTS
   opposition surfacing. Run it before recording AND before judge access. Manual steps are preflight,
   not live setup. (Codex #11)

## Verification

- [ ] `scripts/workspace-verify.mjs` passes: Clean 5 present (others archived), bot a member of each,
      each subscription matches the table, topic lines show district + alder, each persona channel has a
      sample alert, Canvas reachable, RTS opposition surfaces in the hero channel.
- [ ] `districtForNeighborhood('Lindsay Heights') === 6` (resolver test green).
- [ ] Matcher dry-run: a citywide ZND item does **not** route to a neighborhood channel (committees
      dropped); the hero matches `#near-south-side-es` on its keyword.
- [ ] One live pipeline alert posted with the sandbox label.
- [ ] `node --test` green · `biome check` clean.

## Out of scope

- Re-architecting the matcher to gate geo (logged limitation); per-item district extraction.
- `#beat-*` department channels (real-deployment idea, not the demo).
- More than the Clean 5; new features; channel ops needing `channels:manage` from the bot.

## Decisions locked (2026-06-22, with Tarik + verified Codex review)

- Channel set: **Clean 5**; spine = neighborhood (place) + #newsroom (beat); no district#/department channels.
- Geography **aligned to the resolver**: sherman-park=15; hero renamed `#near-south-side-es`=12; add
  Lindsay Heights→6 to the resolver (keep the name).
- Matcher: **scope around** the OR-routing for the demo (drop committees from neighborhood channels;
  newsroom keeps them); log the geo-gating fix as a real-deployment follow-up.
- Adopted from Codex: district-visible topic metadata; neighbors+association framing; manifest preflight
  verifier; one live pipeline alert; ES UX review in-scope; judge path in #start-here.
