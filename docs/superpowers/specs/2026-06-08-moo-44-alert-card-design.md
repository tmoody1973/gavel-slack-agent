# MOO-44 — Proactive bilingual Block Kit alert card + "How to be heard" footer

**Status:** Approved 2026-06-08. **Issue:** MOO-44 (Urgent, protected, Phase 1 — The Spine). **Consumers built:** MOO-41 (poller → `detectedAgendaItems` pending rows), MOO-42 (summarizer), MOO-45 (subscriptions).

## Goal

Turn the `pending` alert jobs MOO-41 enqueues into Gavel's signature surface: a proactive, **bilingual** Block Kit card posted *unprompted* to subscribed Slack channels, carrying a plain-language summary + "why it matters" + a **"How to be heard"** footer (hearing time/location, comment-registration link, alderperson contact) + action buttons. This is the first thing Gavel posts — the differentiator that makes it not-a-chatbot.

## Decisions settled in brainstorming

1. **Always bilingual, one card** (chosen over single-language-per-channel). Every card has an EN section + divider + ES section. Native generation, not translation.
2. **Single bilingual Claude call.** Extend the summarizer to return `{ en:{summary,whyItMatters}, es:{summary,whyItMatters}, addresses }` in one structured call with a curated EN→ES civic glossary injected. (One call, not two — cheaper across many matters.)
3. **Orchestration: extend the Fly poller.** `poll-once.mjs` runs `runPoll` (detect) then `processPendingAlerts` (drain+post) each 5-min tick, built from separate testable modules. Failed posts stay `pending` and retry next tick (idempotent via `alertStatus`).
4. **The per-channel `language` field is reserved, not removed.** With cards always bilingual, `language` no longer gates the card; it is kept for thread-reply language (Phase 2). Documented, not deleted.
5. **Footer sourcing is all live-verified** except the comment-registration link, which is a **static Milwaukee "how to participate" URL constant** (no per-matter link exists in Legistar). Alderperson = matter **sponsor**; if absent, the person line is omitted gracefully.
6. **Buttons present + fire handlers (logged).** `Watch · History · Ask Gavel` are interactive; each handler logs and returns a minimal ephemeral ack now. Deep behavior is Phases 2–3 (out of scope).

## Architecture

`processPendingAlerts(deps)` mirrors `runPoll`: pure orchestration, all boundaries injected, unit-tested with fakes. Card-block assembly and subscription-matching are pure functions. Only the verify script + `poll-once.mjs` wire real boundaries.

```
listPending(client)
  → for each row:
      enrich(row)                     // Legistar: matter file#, sponsor→person(email/phone), event(time/location/links)
      generateBilingualSummary(matter) // one Claude call → {en, es, addresses}
      match = matchSubscriptions(row, subscriptions)  // committee ∈ committees OR title ∋ keyword
      card = buildAlertCard({ row, summary, footer })  // Block Kit blocks
      for each channel in match: slack.postMessage(channel, card)
      markSent(client, eventItemId)    // even if match=∅ (no audience; don't reprocess)
```

### Files

| Path | Responsibility | Tested by |
|---|---|---|
| `agent/alerts/match.js` | `matchSubscriptions(row, subs)` → channels (committee/keyword) — pure | unit |
| `agent/alerts/card.js` | `buildAlertCard({...})` → Block Kit blocks (bilingual, footer, buttons, dormant `<48h` flag slot) — pure | unit |
| `agent/alerts/footer.js` | `buildFooter(event, person)` → footer fields + the static registration link — pure | unit |
| `agent/alerts/enrich.js` | `enrichForAlert(row, legistar)` → `{ matter, event, person }` — boundary (injected legistar) | live |
| `agent/alerts/process.js` | `processPendingAlerts(deps)` orchestrator — boundaries injected | unit (fakes) |
| `agent/alerts/index.js` | barrel | — |
| `agent/summarizer/*` | extend: bilingual prompt + schema + `generateBilingual` | unit |
| `agent/poller/legistar.js` | extend client: `getMatter`, `getMatterSponsors`, `getPerson`, `getEvent` | unit (pure) + live |
| `agent/convex/detectedItems.ts` | add `markSent(client, eventItemId)` mutation | live |
| `agent/listeners/actions/alert-buttons.js` | `watch` · `history` · `ask_gavel` handlers (log + ephemeral ack) | unit |
| `agent/scripts/alert-verify.mjs` | live: real pending row → enrich → post real card → screenshot/log | live |

## Data shapes

**Bilingual summary (new summarizer output):**
```
{ en: { summary: string, whyItMatters: string },
  es: { summary: string, whyItMatters: string },
  addresses: string[] }
```

**Enriched alert context:**
```
{ row,                              // the pending detectedAgendaItems row
  matter: { fileNumber },           // MatterFile
  event:  { date, time, location, inSiteUrl, agendaPdf },
  person: { name, email, phone } | null }  // sponsor → /persons/{nameId}
```

**Card (Block Kit):** header (`⚖️ New: <title>` + committee context) → EN summary section → EN "why it matters" (context/quote) → divider → `🇪🇸 En español` ES summary → ES "why it matters" → divider → `🗣️ How to be heard / Cómo participar` footer (📅 date·time, 📍 location, ✋ register link, 👤 Ald. name ✉️ email ☎️ phone) → actions (`Watch` primary · `History` · `Ask Gavel`) → context (`File #<n> · milwaukee.legistar.com`). A `<48h` warning flag block is conditionally rendered from `row.walkOnFlag` (always false until Phase 3).

## Legistar enrichment (verified live)

- `GET /events/{id}` → `EventTime` ("1:30 PM"), `EventLocation` ("Room 301-B, Third Floor, City Hall"), `EventInSiteURL`, `EventAgendaFile`.
- `GET /matters/{id}` → `MatterFile` ("241554").
- `GET /matters/{id}/sponsors` → `[{ MatterSponsorName, MatterSponsorNameId }]` (sponsor seq 0 = primary).
- `GET /persons/{nameId}` → `PersonEmail`, `PersonPhone`, address. (Ald. Perez: jperez@milwaukee.gov · 414-286-2221.)
- Comment-registration link: **static constant** `HOW_TO_PARTICIPATE_URL` (Milwaukee Common Council public-comment page).

## Accessibility & mobile

Single-column section stack (mobile-first by Slack default). No color-only meaning — every flag/label carries an emoji + text. Links have descriptive text. Plain language at a resident reading level.

## Verification (against reality)

- **Real card posted** to a sandbox channel (create a subscription → real channel), screenshot desktop + mobile.
- **Footer fields cross-checked** to the live Legistar source for that matter (time/location/sponsor/contact).
- **Buttons fire handlers** — click each, confirm the logged handler + ephemeral ack.
- Unit suite green (`node --test`), lint clean.

## Out of scope

Walk-on / `<48h` detection logic (Phase 3, MOO-51 — only the dormant flag slot here). Parcel/RTS button behaviors (Phases 2–3). Watchlist persistence behind `Watch`. Thread-reply language handling (Phase 2).
