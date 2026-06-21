# MOO-125 — Community-memory bridge (RTS → agenda match)

_Design, 2026-06-21. The signature differentiator: the neighborhood is already talking about
a problem in Slack and doesn't know it's about to be decided at City Hall. Gavel notices and
says "you've been discussing this — it's up for a vote Thursday. Want the alert?"_

## The compliance guardrail (shapes the whole design)

RTS is queried **live**; Slack message content is **never stored, copied, or indexed**. The
bridge holds message snippets in memory only long enough to feed the Claude judge, then
discards them. The only things persisted are **agenda-derived queries** (transient) and the
**official item ids** of proposals already made. This is enforced structurally: message
`content` never crosses out of the bridge pipeline and never enters Convex or a card.

## Direction (decided): Agenda → RTS

RTS is **query-driven** (`assistant.search.context(query)` — there is no "fetch all recent
messages"), so *something* must seed the query. We seed from the **official upcoming agenda**:
for each salient upcoming item, derive a plain-language query (the legalese → "what a neighbor
would say" translation, the bridge's core value), search RTS, and confirm the community is
discussing it. This is compliance-clean by construction (we only act on items that exist on
the official record) and bounded (one query per salient candidate).

## The pipeline (per sweep)

```
for each subscribed channel:
  candidates = top-N salient upcoming items for this channel        (selectSalient, capped)
              minus already-proposed (channelId,eventItemId)        (bridgeProposals dedup)
  for each candidate item:
    {queryEn, queryEs, entity} = generateBridgeQuery(item)          (Claude, schema)
    messages = searchChannel(queryEn, queryEs, channelId)           (live RTS, filtered to THIS channel)
    if messages.length === 0: continue                              (cheap pre-filter)
    verdict = judgeMatch(item, messages)                            (Claude, schema: isMatch/confidence/reason)
    if verdict.isMatch && verdict.confidence >= 0.7:                (conservative threshold)
      post bilingual proposal card → channel                       (bot token)
      recordProposal(channelId, eventItemId)                       (ids only)
```

**Why two Claude calls.** Query-gen must precede search, so it can't fold into the judge.
Both are bounded: query-gen runs only for salient, not-yet-proposed candidates (cap ~5/channel);
the judge runs only for candidates that already returned a *channel-scoped* RTS hit (few). The
judge is the false-positive killer — a proactive interrupt that's wrong erodes trust instantly,
so we gate on `isMatch && confidence ≥ 0.7`, high only.

**Channel-scoping is the precision lever.** RTS searches the whole workspace; we filter results
to `channel_id === sub.channelId` so we only ever say "*this* channel discussed X."

## Components

- `convex/schema.ts` — new `bridgeProposals` table `{channelId, client, eventItemId, proposedAt}`
  + `by_channel_item` index. `convex/bridge.ts` — `listProposed()` query, `recordProposal()`
  mutation. **Ids + timestamps only; no message content.**
- `agent/agent/community-memory/search-channel.js` — `searchChannel({queryEn, queryEs, channelId},
  {userToken})` → merged RTS message objects filtered to one channel (reuses `searchRts` +
  `mergeAndDedupe`). Returns objects (the judge needs snippets); never persisted.
- `agent/agent/community-memory/bridge.js` (pure, the testable seam) — `BRIDGE_QUERY_SCHEMA`,
  `BRIDGE_JUDGE_SCHEMA`, `findBridgeMatches({upcoming, subscriptions, proposed}, {generateQuery,
  searchChannel, judge})` → `[{channelId, item, entity, verdict, language}]`. No content out.
- `agent/blockkit/bridge-card.js` — bilingual proposal card: "📣 You've been discussing
  *{entity}* here — it's on the *{committee}* agenda {date}." + 👁 Watch (reuse `alert_watch`,
  value = eventItemId) + a "🔒 _Searched live — your messages are never stored._" note.
  **Content-free re: messages** (references the agenda entity, not any quoted message).
- `agent/scripts/bridge-sweep.mjs` — wires Convex/RTS/Claude/bot, runs `findBridgeMatches`,
  posts cards, records dedup. Manually runnable (demo) and crontab-scheduled.
- `agent/crontab` — add the sweep on `gavel-poller` (has SLACK_USER_TOKEN + ANTHROPIC_API_KEY +
  SLACK_BOT_TOKEN + CONVEX_URL — verified). Cadence: every 6h.

## Verification

- **Unit:** entity/query-gen + judge + dedup + threshold with mocked RTS/Claude; an explicit
  test that `findBridgeMatches` returns no message `content` (compliance assertion).
- **Live:** seed the sandbox channel with a discussion matching a real upcoming item → run the
  sweep → one in-language proposal, deduped on re-run; confirm no Slack content in Convex
  (`bridgeProposals` rows carry only ids + timestamps). Screenshot.

## Out of scope (per contract)

Storing/indexing any Slack message. Cross-workspace matching. Auto-watching (propose, don't
auto-watch). Rich-card redesign.
