# Demo Workspace Information Architecture — Design Spec

_2026-06-22. Set up the Gavel demo Slack workspace with persona-clean channels and correct
per-channel alert configuration, so a Milwaukee resident — or a hackathon judge with sandbox
access — immediately understands what Gavel is and who it's for. Pre-demo polish for MOO-62._

## Problem

The live workspace is incoherent for a cold visitor (state as of 2026-06-22):

| Channel | Reality |
|---|---|
| #general | reporter · EN · **no district** · 6 committees · **35 keywords** (kitchen-sink test channel) |
| #sherman-park | association · EN · **district 15** (corpus says 7) · 27 keywords |
| #clarke-square | organizer · ES · district 12 · the Punta Cana hero ✅ |
| #lindsay-heights | **role: none** · EN · district 6 |
| #zoning | association · EN · no district · a topic channel that maps to no persona |
| #random | Slack default, unsubscribed |

A judge lands cold and sees noise: a kitchen-sink #general, a topic channel for no one, a roleless
channel, a wrong district, and no "you are here." The personas don't map to legible, Milwaukee-
recognizable channels, and the keyword bloat makes neighborhood channels catch citywide noise.

## Design principle: Place + Beat

Two real axes; everything else is machinery underneath.

- **Place** (residents / organizers) → **neighborhood-association channels**, named for real Milwaukee
  neighborhoods. The aldermanic **district is derived** (the `boundary` field), never the channel's
  identity — a neighborhood channel *is* a district channel with a human name. This is deliberate:
  the product's job is to hide the district abstraction (cf. the neighborhood→district picker,
  MOO-131), so naming a channel `#district-7` would push onto the user the very abstraction Gavel
  removes. "Anyone from Milwaukee" knows *Sherman Park*; few know their district number.
- **Beat** (reporter) → **#newsroom**, citywide across all committees. This is where the legitimate
  "citywide topic/department" need is served — via `/gavel stories` + committee breadth — instead of
  standalone `#licenses` / `#zoning` department channels that fragment a neighborhood's view.

**No district-number channels. No department/committee channels.** Districts are derived; committees
are a per-channel subscription knob, not a channel taxonomy.

### Integrity rule: a neighborhood channel contains only neighborhood content

`#sherman-park` carries only Sherman Park / district-7 / its-topics content — never citywide noise.
Enforced by a **tight geo + small plain-language topic** subscription. This is the core reason to
**trim the keyword bloat**: 35 keywords on a neighborhood channel breaks the "this is *my* block"
feeling; ~3 plain topics keep it clean and local. (The seed corpus already respects this — Sherman
Park's messages are about Sherman Blvd rezoning and 35th & Center demolition, all local.)

### The "association" framing

`association` is already one of the three first-class roles (`association | organizer | reporter`).
Denise is a neighborhood-**association president**, not a random resident — so her channel is the
**association's** working channel (the board tracking what's coming and deciding who testifies),
framed as such by name/topic/welcome. Same channel, sharper identity — not a separate 6th channel.

## The Clean 5

| Channel | Persona | role | lang | district | committees | plain topics (keywords) |
|---|---|---|---|---|---|---|
| **#start-here** | everyone / judges | — | — | — | — | none (pinned Canvas, no alerts) |
| **#sherman-park** | Denise — neighborhood association | `association` | en | 7 | ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE · CITY PLAN COMMISSION | rezoning, demolition, development |
| **#clarke-square** | Marcos — organizer (hero) | `organizer` | **es** | 12 | LICENSES COMMITTEE · ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE | liquor license, rezoning, Punta Cana |
| **#lindsay-heights** | Marcos — 2nd neighborhood | `organizer` | en | 6 | COMMUNITY & ECONOMIC DEVELOPMENT COMMITTEE · ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE | development, vacant lot, demolition |
| **#newsroom** | Rachel — reporter | `reporter` | en | — (citywide) | ZND · LICENSES · COMMUNITY & ECONOMIC DEVELOPMENT · CITY PLAN COMMISSION (broad) | (light: rezoning, license revocation, demolition) |

All three personas covered; the **organizer shown across two channels in two languages** (clarke ES +
lindsay EN) = the multi-neighborhood / community-bridge story made real, not asserted. Committee
strings are the exact Legistar `EventBodyName` values already used in `agent/sandbox/corpus.js`.

## Division of labor (the `channels:manage` constraint)

The bot token has **no `channels:manage`, no `pins:write`** (see memory `slack-grid-scopes`), so
channel lifecycle and topics are manual; content and config are scripted.

**Tarik — manually in Slack (~5 min):**
1. Create `#start-here` and `#newsroom`; invite `@Gavel` to both.
2. Archive `#general`, `#zoning`, `#random`.
3. Set each channel's **topic/purpose** (one human line — e.g. #sherman-park → "Sherman Park
   neighborhood association · tracking what City Hall is doing to our blocks").
4. Pin/bookmark the Canvas in `#start-here` once published.

**Claude — via scripts + Convex (no new scopes):**
1. **Set all 5 subscriptions** to the table above (fix sherman-park district 15→7; set lindsay role
   none→organizer; trim every keyword list to the small plain set; ensure committees/language/role).
   Extend or reuse `agent/sandbox/corpus.js` + the seed path so this is reproducible, not hand-poked.
2. **Publish the Canvas** (MOO-152 guide, already built — `F0BCXBM57DE`) and share it to `#start-here`
   + a short "👋 What is this · judges start here" welcome message.
3. **Stage one representative sample alert per persona channel** (reuse MOO-122 sample-alert +
   MOO-119 welcome-card generators): sherman → a rezoning/demolition; clarke → the **#260229 Punta
   Cana** hero; lindsay → a development/vacant-lot; newsroom → story leads. So a judge landing in any
   channel immediately sees a relevant, on-identity card.
4. **Verify** against reality (below).

## Verification

- [ ] `conversations.list` shows the Clean 5 (others archived); bot is a member of each.
- [ ] Each channel's Convex subscription matches the table (role, language, district, committees,
      trimmed keywords) — paste the live config.
- [ ] Dry-run the alert matcher (`agent/alerts/match.js`) against a real upcoming-agenda pull: each
      channel matches only on-identity items (a Sherman Park rezoning routes to #sherman-park, the
      Punta Cana license routes to #clarke-square, etc.) — no citywide bleed.
- [ ] RTS opposition still surfaces in #clarke-square for an opposition-framed query (memory
      `rts-query-framing`).
- [ ] Canvas reachable from #start-here; each persona channel shows one representative sample alert.

## Out of scope

- New features; real (non-staged) alerts firing from the live poller during the demo.
- More than the Clean 5; any district-number or standalone department/committee channel.
- Anything needing `channels:manage` / `pins:write` from the bot (those steps are Tarik-manual).
- Native-Spanish copy review (standing project item, orig. MOO-43).

## Decisions locked (2026-06-22, with Tarik)

- Channel set: **Clean 5**.
- Spine: **neighborhood (place) + newsroom (beat)** — **no** district# or department channels.
- Neighborhood channels carry **only neighborhood content** (tight geo+topic subscription; trim keywords).
- Denise's channel is framed as a **neighborhood-association** channel (not a separate 6th channel).
- lindsay-heights = **organizer** (Marcos's 2nd neighborhood). sherman-park district = **7** (align to corpus).
