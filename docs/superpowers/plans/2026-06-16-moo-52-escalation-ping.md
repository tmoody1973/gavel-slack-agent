# MOO-52 Escalation Ping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** When a matter Gavel already alerted on clears its committee ("RECOMMENDED FOR ADOPTION/PASSAGE") and is headed to the full Common Council for the final vote, post an escalation ping to the channel(s) that got the original alert — referencing the original alert (File #, committee) + a Legistar link — exactly once.

**Architecture:** A new poller-side sweep (sibling cron) over the matters we've already alerted on (`detectedAgendaItems`, `alertStatus='sent'`, recency-bounded). For each not-yet-escalated matter it fetches `MatterHistory`, runs a pure `detectEscalation` (looks for a committee `RECOMMENDED FOR ADOPTION/PASSAGE` action with result `Pass`), and on a hit re-derives the watching channels via the **same `matchSubscriptions`** on the stored detected row, posts a bilingual `escalationCard`, and records the matter in a new `matterEscalations` Convex ledger for idempotency. Mirrors `poller/poll.js` (all I/O injected, logic pure + unit-tested).

**Tech Stack:** Node ESM, `node --test`, Convex (`convex/browser` in scripts), `@slack/web-api`, existing `agent/poller/legistar.js` (`getMatterHistory`, `getMatter`) + `agent/alerts/match.js` (`matchSubscriptions`).

**Real-data basis (verified live this session):** Milwaukee `MatterHistory` flow is `COMMON COUNCIL "ASSIGNED TO"` (intro) → `[COMMITTEE] "RECOMMENDED FOR  ADOPTION" (Pass)` → `COMMON COUNCIL "ADOPTED" (Pass)` → `MAYOR "SIGNED"`. The committee recommendation lands ~5 days before the Council vote. `https://milwaukee.legistar.com/LegislationDetail.aspx?ID=<MatterId>&GUID=<MatterGuid>` returns 200.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `agent/escalation/detect.js` | Pure `detectEscalation`, `isCommitteeRecommendation` | Create |
| `agent/escalation/sweep.js` | Pure `runEscalationSweep(deps)` | Create |
| `agent/escalation/index.js` | Barrel | Create |
| `agent/poller/legistar.js` | Extend `mapMatter` (guid/title/status) + add `matterDetailUrl` | Modify |
| `agent/poller/index.js` | Export `matterDetailUrl` | Modify |
| `agent/convex/schema.ts` | Add `matterEscalations` table | Modify |
| `agent/convex/escalations.ts` | `listEscalatedMatterIds`, `recordEscalation`, `removeEscalation` | Create |
| `agent/convex/detectedItems.ts` | Add `listSentWithMatter` query | Modify |
| `agent/blockkit/escalation-card.js` | `escalationCard({...})` bilingual | Create |
| `agent/blockkit/index.js` | Export `escalationCard` | Modify |
| `agent/scripts/escalation-once.mjs` | Cron wiring | Create |
| `agent/scripts/escalation-verify.mjs` | Live verify | Create |
| `agent/crontab` | Add `0 */6 * * *` line | Modify |
| `agent/tests/escalation/detect.test.js` | Detector unit tests | Create |
| `agent/tests/escalation/sweep.test.js` | Orchestration unit tests (fakes) | Create |
| `agent/tests/blockkit/escalation-card.test.js` | Card unit tests | Create |
| `agent/tests/poller/matter-meta.test.js` | `mapMatter` + `matterDetailUrl` unit tests | Create |

**Shared shapes:**
```js
// history row (getMatterHistory): { date?: string, action: string, body?: string, result?: string }
// matter meta (getMatter, extended): { fileNumber: string, guid?: string, title?: string, statusName?: string }
// detected row (listSentWithMatter): { matterId: number, title: string, eventBodyName: string, detectedAt: number, eventId?: number }
// escalation info (detect): { committee?: string, date?: string, action: string }
```

Baseline in this worktree: **274 tests, 0 failures** (off `main`, pre-MOO-53).

---

## Task 1: Pure escalation detector

**Files:** Create `agent/escalation/detect.js`, Test `agent/tests/escalation/detect.test.js`

- [ ] **Step 1: Write the failing test**

```js
// agent/tests/escalation/detect.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectEscalation, isCommitteeRecommendation } from '../../escalation/detect.js';

// Real Milwaukee shape (verified live: matter 70781).
const PASSED_FLOW = [
  { date: '2025-05-13', body: 'COMMON COUNCIL', action: 'ASSIGNED TO', result: undefined },
  { date: '2025-11-12', body: 'PUBLIC WORKS COMMITTEE', action: 'HELD TO CALL OF THE CHAIR', result: 'Pass' },
  { date: '2026-05-20', body: 'PUBLIC WORKS COMMITTEE', action: 'RECOMMENDED FOR  ADOPTION', result: 'Pass' },
  { date: '2026-06-02', body: 'COMMON COUNCIL', action: 'ADOPTED', result: 'Pass' },
];

test('isCommitteeRecommendation: only a passed RECOMMENDED FOR ADOPTION/PASSAGE counts', () => {
  assert.equal(isCommitteeRecommendation('RECOMMENDED FOR  ADOPTION', 'Pass'), true);
  assert.equal(isCommitteeRecommendation('RECOMMENDED FOR PASSAGE', 'Pass'), true);
  assert.equal(isCommitteeRecommendation('RECOMMENDED FOR  ADOPTION AND ASSIGNED', 'Pass'), true);
  assert.equal(isCommitteeRecommendation('HELD TO CALL OF THE CHAIR', 'Pass'), false);
  assert.equal(isCommitteeRecommendation('ASSIGNED TO', undefined), false);
  assert.equal(isCommitteeRecommendation('RECOMMENDED FOR ADOPTION', 'Fail'), false);
});

test('detectEscalation: returns the committee + date of the recommendation', () => {
  const esc = detectEscalation(PASSED_FLOW);
  assert.ok(esc);
  assert.equal(esc.committee, 'PUBLIC WORKS COMMITTEE');
  assert.equal(esc.date, '2026-05-20');
});

test('detectEscalation: in-committee-only history → null (no ping)', () => {
  const inCommittee = [
    { date: '2026-05-01', body: 'COMMON COUNCIL', action: 'ASSIGNED TO', result: undefined },
    { date: '2026-05-10', body: 'ZONING COMMITTEE', action: 'HELD TO CALL OF THE CHAIR', result: 'Pass' },
  ];
  assert.equal(detectEscalation(inCommittee), null);
});

test('detectEscalation: empty/undefined history → null', () => {
  assert.equal(detectEscalation([]), null);
  assert.equal(detectEscalation(undefined), null);
});

test('detectEscalation: multiple recommendations → the latest one', () => {
  const multi = [
    { date: '2026-05-21', body: 'PUBLIC SAFETY COMMITTEE', action: 'RECOMMENDED FOR  ADOPTION AND ASSIGNED', result: 'Pass' },
    { date: '2026-05-28', body: 'FINANCE & PERSONNEL COMMITTEE', action: 'RECOMMENDED FOR  ADOPTION', result: 'Pass' },
  ];
  assert.equal(detectEscalation(multi).committee, 'FINANCE & PERSONNEL COMMITTEE');
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `cd agent && node --test tests/escalation/detect.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
// agent/escalation/detect.js
// Pure escalation detection. The committee→full-Council transition is signalled
// by a committee action "RECOMMENDED FOR ADOPTION/PASSAGE" (result Pass) — it
// lands ~5 days before the Common Council's final vote (verified against real
// Milwaukee MatterHistory). The intro "ASSIGNED TO" and "HELD TO CALL OF THE
// CHAIR" are NOT escalations.

const RECOMMENDATION = /\bRECOMMENDED FOR\s+(ADOPTION|PASSAGE)\b/i;

/** A passed committee recommendation to advance the matter to the full Council. */
export function isCommitteeRecommendation(action, result) {
  return result === 'Pass' && RECOMMENDATION.test(action || '');
}

/**
 * The escalation event for a matter's history, or null. History is ascending by
 * date (getMatterHistory orders by MatterHistoryActionDate); the LAST matching
 * recommendation is the controlling one.
 */
export function detectEscalation(history) {
  const matches = (history || []).filter((h) => isCommitteeRecommendation(h.action, h.result));
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1];
  return { committee: last.body, date: last.date, action: last.action };
}
```

- [ ] **Step 4: Run test — verify it passes**

Run: `cd agent && node --test tests/escalation/detect.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add agent/escalation/detect.js agent/tests/escalation/detect.test.js
git commit -m "feat(escalation): pure committee→Council detector (MOO-52)"
```

---

## Task 2: Extend `mapMatter` + `matterDetailUrl`

**Files:** Modify `agent/poller/legistar.js` (`mapMatter`), `agent/poller/index.js`; Test `agent/tests/poller/matter-meta.test.js`

- [ ] **Step 1: Check for an existing mapMatter test**

Run: `cd agent && grep -rn "mapMatter\b" tests/`. If a test asserts `deepEqual(..., { fileNumber })`, update it in Step 3 to the extended shape.

- [ ] **Step 2: Write the failing test**

```js
// agent/tests/poller/matter-meta.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapMatter, matterDetailUrl } from '../../poller/legistar.js';

test('mapMatter: surfaces guid/title/status alongside fileNumber', () => {
  const m = mapMatter({ MatterFile: '250086', MatterGuid: 'ABC-123', MatterTitle: 'A street name', MatterStatusName: 'Passed' });
  assert.equal(m.fileNumber, '250086');
  assert.equal(m.guid, 'ABC-123');
  assert.equal(m.title, 'A street name');
  assert.equal(m.statusName, 'Passed');
});

test('matterDetailUrl: builds a Legistar legislation-detail link, or undefined without a guid', () => {
  assert.equal(
    matterDetailUrl(70781, '6767C5D4-1835-4A00-B728-757FCB1843C9'),
    'https://milwaukee.legistar.com/LegislationDetail.aspx?ID=70781&GUID=6767C5D4-1835-4A00-B728-757FCB1843C9',
  );
  assert.equal(matterDetailUrl(70781, undefined), undefined);
});
```

- [ ] **Step 3: Run test — verify it fails**

Run: `cd agent && node --test tests/poller/matter-meta.test.js`
Expected: FAIL — `matterDetailUrl` not exported / `m.guid` undefined.

- [ ] **Step 4: Implement**

In `agent/poller/legistar.js`, replace `mapMatter`:

```js
/** Normalize a raw Legistar matter — file number + the fields escalation needs. */
export function mapMatter(raw) {
  return {
    fileNumber: raw.MatterFile,
    guid: raw.MatterGuid ?? undefined,
    title: raw.MatterTitle ?? undefined,
    statusName: raw.MatterStatusName ?? undefined,
  };
}

/** Clickable Legistar legislation-detail URL for a matter (needs the GUID). */
export function matterDetailUrl(matterId, guid) {
  return guid ? `https://milwaukee.legistar.com/LegislationDetail.aspx?ID=${matterId}&GUID=${guid}` : undefined;
}
```

If Step 1 found a `mapMatter` test asserting `{ fileNumber }` only, update its expected object to include `guid/title/status` (use literal undefined for absent raw fields).

In `agent/poller/index.js`, add `matterDetailUrl` to the `legistar.js` export block.

- [ ] **Step 5: Run test — verify it passes (and the full poller suite)**

Run: `cd agent && node --test tests/poller/matter-meta.test.js && node --test tests/poller/`
Expected: PASS; no regressions in poller tests (the alert/digest enrich read `.fileNumber`, unaffected by additive fields).

- [ ] **Step 6: Commit**

```bash
git add agent/poller/legistar.js agent/poller/index.js agent/tests/poller/matter-meta.test.js
git commit -m "feat(poller): mapMatter exposes guid/title/status + matterDetailUrl (MOO-52)"
```

---

## Task 3: `matterEscalations` Convex ledger + `listSentWithMatter`

**Files:** Modify `agent/convex/schema.ts`, `agent/convex/detectedItems.ts`; Create `agent/convex/escalations.ts`

(No `node --test`; verified by `convex codegen` + Task 8 live run, like `detectedItems.ts`.)

- [ ] **Step 1: Add the table to `schema.ts`** (after the `detectedAgendaItems` block)

```js
  // Escalation ledger (MOO-52). One row per matter we've pinged as "headed to
  // the full Council", so the committee→Council transition fires exactly once.
  // Civic-record keys only — no Slack content.
  matterEscalations: defineTable({
    client: v.union(v.literal('milwaukee'), v.literal('milwaukeecounty')),
    matterId: v.number(),
    fileNumber: v.optional(v.string()),
    committee: v.optional(v.string()),
    recommendedDate: v.optional(v.string()),
    channelsPinged: v.number(),
    escalatedAt: v.number(),
  }).index('by_client_matter', ['client', 'matterId']),
```

- [ ] **Step 2: Add `listSentWithMatter` to `detectedItems.ts`**

```js
/** Sent detected rows that carry a matterId — the escalation sweep's tracked set. */
export const listSentWithMatter = query({
  args: { client: clientValidator },
  handler: async (ctx, { client }) => {
    const rows = await ctx.db
      .query('detectedAgendaItems')
      .withIndex('by_client_status', (q) => q.eq('client', client).eq('alertStatus', 'sent'))
      .collect();
    return rows
      .filter((r) => r.matterId !== undefined)
      .map((r) => ({
        matterId: r.matterId,
        title: r.title,
        eventBodyName: r.eventBodyName,
        detectedAt: r.detectedAt,
        eventId: r.eventId,
      }));
  },
});
```

- [ ] **Step 3: Create `escalations.ts`**

```js
// agent/convex/escalations.ts
import { v } from 'convex/values';

import { mutation, query } from './_generated/server';

const clientValidator = v.union(v.literal('milwaukee'), v.literal('milwaukeecounty'));

/** matterIds already escalated for a client — the sweep's idempotency input. */
export const listEscalatedMatterIds = query({
  args: { client: clientValidator },
  handler: async (ctx, { client }) => {
    const rows = await ctx.db
      .query('matterEscalations')
      .withIndex('by_client_matter', (q) => q.eq('client', client))
      .collect();
    return rows.map((r) => r.matterId);
  },
});

/** Record one matter's escalation. Idempotent per (client, matterId). */
export const recordEscalation = mutation({
  args: {
    client: clientValidator,
    matterId: v.number(),
    fileNumber: v.optional(v.string()),
    committee: v.optional(v.string()),
    recommendedDate: v.optional(v.string()),
    channelsPinged: v.number(),
    escalatedAt: v.number(),
  },
  handler: async (ctx, rec) => {
    const existing = await ctx.db
      .query('matterEscalations')
      .withIndex('by_client_matter', (q) => q.eq('client', rec.client).eq('matterId', rec.matterId))
      .unique();
    if (existing) return existing._id;
    return ctx.db.insert('matterEscalations', rec);
  },
});

/** Delete an escalation row — verify-script only, to keep the run repeatable. */
export const removeEscalation = mutation({
  args: { client: clientValidator, matterId: v.number() },
  handler: async (ctx, { client, matterId }) => {
    const existing = await ctx.db
      .query('matterEscalations')
      .withIndex('by_client_matter', (q) => q.eq('client', client).eq('matterId', matterId))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return existing?._id ?? null;
  },
});
```

- [ ] **Step 4: Codegen**

Run: `cd agent && npx convex codegen`
Expected: completes; `matterEscalations` + the new functions appear in `_generated/api`.

- [ ] **Step 5: Commit**

```bash
git add agent/convex/schema.ts agent/convex/escalations.ts agent/convex/detectedItems.ts
git commit -m "feat(convex): matterEscalations ledger + listSentWithMatter (MOO-52)"
```

---

## Task 4: Escalation card

**Files:** Create `agent/blockkit/escalation-card.js`, Modify `agent/blockkit/index.js`; Test `agent/tests/blockkit/escalation-card.test.js`

- [ ] **Step 1: Write the failing test**

```js
// agent/tests/blockkit/escalation-card.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { escalationCard } from '../../blockkit/escalation-card.js';

const info = {
  fileNumber: '250086',
  title: 'Substitute resolution assigning the honorary street name John J. Williams',
  committee: 'PUBLIC WORKS COMMITTEE',
  recommendedDate: '2026-05-20',
  url: 'https://milwaukee.legistar.com/LegislationDetail.aspx?ID=70781&GUID=ABC',
};

test('escalationCard: EN names file, committee, and links back', () => {
  const card = escalationCard({ ...info });
  const json = JSON.stringify(card.blocks);
  assert.equal(card.blocks[0].type, 'header');
  assert.ok(json.includes('File #250086'));
  assert.ok(json.includes('PUBLIC WORKS COMMITTEE'));
  assert.ok(json.includes('Common Council'));
  assert.ok(json.includes(info.url));
  assert.match(card.text, /Common Council/i);
});

test('escalationCard: ES appends Spanish framing; file/committee stay English', () => {
  const card = escalationCard({ ...info, language: 'es' });
  assert.ok(card.blocks.some((b) => b.type === 'divider'));
  const json = JSON.stringify(card.blocks);
  assert.ok(json.includes('Concejo')); // ES framing
  assert.ok(json.includes('File #250086')); // stays English
});

test('escalationCard: no url → no link block, still renders', () => {
  const card = escalationCard({ ...info, url: undefined });
  const json = JSON.stringify(card.blocks);
  assert.ok(!json.includes('LegislationDetail'));
  assert.ok(json.includes('File #250086'));
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `cd agent && node --test tests/blockkit/escalation-card.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
// agent/blockkit/escalation-card.js
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-05-20" / "2026-05-20T..." → "May 20". Passthrough if unparseable. */
function shortDate(value) {
  if (!value) return '';
  const [, m, d] = String(value).slice(0, 10).split('-').map(Number);
  return Number.isFinite(m) && Number.isFinite(d) ? `${MONTHS[m - 1]} ${d}` : String(value);
}

const mrkdwn = (text) => ({ type: 'section', text: { type: 'mrkdwn', text } });

const COPY = {
  en: {
    header: '🏛️ Headed to the full Council',
    body: (file, committee, date) =>
      `*File #${file}* cleared *${committee}*${date ? ` on ${shortDate(date)}` : ''} (recommended for adoption) ` +
      'and is now headed to the full *Common Council* for the final vote.',
    note: '_You were alerted about this item in committee — this is your heads-up before it’s decided._',
    link: 'View the file on Legistar',
  },
  es: {
    header: '🏛️ Rumbo al Concejo en pleno',
    body: (file, committee, date) =>
      `*File #${file}* fue aprobado por *${committee}*${date ? ` el ${shortDate(date)}` : ''} (recomendado para adopción) ` +
      'y ahora pasa al *Concejo Común* en pleno para la votación final.',
    note: '_Recibiste una alerta sobre este asunto en el comité — este es tu aviso antes de que se decida._',
    link: 'Ver el expediente en Legistar',
  },
};

/** One language's body: headline summary, the matter title, the heads-up note, optional link. */
function section(copy, { fileNumber, title, committee, recommendedDate, url }, label) {
  const blocks = [];
  if (label) blocks.push(mrkdwn(`*🇪🇸 ${label}*`));
  blocks.push(mrkdwn(copy.body(fileNumber, committee, recommendedDate)));
  if (title) blocks.push(mrkdwn(`_${title}_`));
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: copy.note }] });
  if (url) blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `🔗 <${url}|${copy.link}>` }] });
  return blocks;
}

/**
 * Escalation ping (MOO-52). A matter we alerted on in committee has cleared it
 * and is bound for the full Common Council. EN always; ES framing appended for
 * ES channels (file #/committee stay English, the MOO-43 rule). Pure.
 *
 * @param {{ fileNumber: string, title?: string, committee?: string, recommendedDate?: string, url?: string, language?: 'en'|'es' }} info
 * @returns {{ text: string, blocks: object[] }}
 */
export function escalationCard(info) {
  const { language = 'en' } = info;
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: COPY.en.header, emoji: true } },
    ...section(COPY.en, info, null),
  ];
  if (language === 'es') {
    blocks.push({ type: 'divider' }, ...section(COPY.es, info, 'Rumbo al Concejo'));
  }
  const text = `File #${info.fileNumber} is headed to the full Common Council for the final vote.`;
  return { text, blocks };
}
```

- [ ] **Step 4: Run test — verify it passes**

Run: `cd agent && node --test tests/blockkit/escalation-card.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Barrel + commit**

In `agent/blockkit/index.js` add: `export { escalationCard } from './escalation-card.js';`

```bash
git add agent/blockkit/escalation-card.js agent/blockkit/index.js agent/tests/blockkit/escalation-card.test.js
git commit -m "feat(blockkit): escalationCard — bilingual committee→Council ping (MOO-52)"
```

---

## Task 5: Sweep orchestration

**Files:** Create `agent/escalation/sweep.js`, `agent/escalation/index.js`; Test `agent/tests/escalation/sweep.test.js`

Deps:
```
{ client, detectedSince, now,
  listTrackedMatters, listEscalatedMatterIds, listSubscriptions,
  getMatterHistory, getMatterMeta, matterUrl,
  buildCard, postCard, recordEscalation, languageFor, logger? }
```

- [ ] **Step 1: Write the failing test**

```js
// agent/tests/escalation/sweep.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runEscalationSweep } from '../../escalation/sweep.js';

const REC = [{ date: '2026-05-20', body: 'ZONING COMMITTEE', action: 'RECOMMENDED FOR  ADOPTION', result: 'Pass' }];
const HELD = [{ date: '2026-05-20', body: 'ZONING COMMITTEE', action: 'HELD TO CALL OF THE CHAIR', result: 'Pass' }];

function harness({ tracked, escalatedIds = [], historyByMatter, subs }) {
  const posted = [];
  const recorded = [];
  return {
    posted,
    recorded,
    deps: {
      client: 'milwaukee',
      detectedSince: 0,
      now: () => 1_700_000_000_000,
      listTrackedMatters: async () => tracked,
      listEscalatedMatterIds: async () => escalatedIds,
      listSubscriptions: async () => subs,
      getMatterHistory: async (id) => historyByMatter[id] ?? [],
      getMatterMeta: async (id) => ({ fileNumber: `F${id}`, guid: `G${id}`, title: `Title ${id}`, statusName: 'In Committee' }),
      matterUrl: (id, guid) => `https://legistar/${id}?GUID=${guid}`,
      buildCard: (info, language) => ({ text: `card:${info.fileNumber}:${language}`, blocks: [{ info, language }] }),
      postCard: async (channel, card) => posted.push({ channel, card }),
      recordEscalation: async (rec) => recorded.push(rec),
      languageFor: (ch) => (ch === 'CES' ? 'es' : 'en'),
      logger: { error() {}, log() {} },
    },
  };
}

const sub = (channelId, committees = [], keywords = []) => ({ channelId, committees, keywords });

test('recommended matter → pings the subscribed channel and records once', async () => {
  const h = harness({
    tracked: [{ matterId: 1, title: 'Rezoning', eventBodyName: 'ZONING COMMITTEE', detectedAt: 10 }],
    historyByMatter: { 1: REC },
    subs: [sub('C1', ['ZONING COMMITTEE'])],
  });
  const summary = await runEscalationSweep(h.deps);
  assert.equal(h.posted.length, 1);
  assert.equal(h.posted[0].channel, 'C1');
  assert.equal(h.recorded.length, 1);
  assert.equal(h.recorded[0].matterId, 1);
  assert.equal(h.recorded[0].channelsPinged, 1);
  assert.equal(h.recorded[0].escalatedAt, 1_700_000_000_000);
  assert.equal(summary.pinged, 1);
});

test('in-committee-only matter → no ping, no record', async () => {
  const h = harness({
    tracked: [{ matterId: 2, title: 'Held thing', eventBodyName: 'ZONING COMMITTEE', detectedAt: 10 }],
    historyByMatter: { 2: HELD },
    subs: [sub('C1', ['ZONING COMMITTEE'])],
  });
  const summary = await runEscalationSweep(h.deps);
  assert.equal(h.posted.length, 0);
  assert.equal(h.recorded.length, 0);
  assert.equal(summary.detected, 0);
});

test('already-escalated matter is skipped', async () => {
  const h = harness({
    tracked: [{ matterId: 1, title: 'Rezoning', eventBodyName: 'ZONING COMMITTEE', detectedAt: 10 }],
    escalatedIds: [1],
    historyByMatter: { 1: REC },
    subs: [sub('C1', ['ZONING COMMITTEE'])],
  });
  await runEscalationSweep(h.deps);
  assert.equal(h.posted.length, 0);
  assert.equal(h.recorded.length, 0);
});

test('recommended but no subscribed channel → still recorded (0 pings) so it is not rechecked forever', async () => {
  const h = harness({
    tracked: [{ matterId: 3, title: 'Nobody watches', eventBodyName: 'PARKS COMMITTEE', detectedAt: 10 }],
    historyByMatter: { 3: REC },
    subs: [sub('C1', ['ZONING COMMITTEE'])],
  });
  await runEscalationSweep(h.deps);
  assert.equal(h.posted.length, 0);
  assert.equal(h.recorded.length, 1);
  assert.equal(h.recorded[0].channelsPinged, 0);
});

test('detectedSince filters out stale tracked matters', async () => {
  const h = harness({
    tracked: [{ matterId: 1, title: 'Old', eventBodyName: 'ZONING COMMITTEE', detectedAt: 5 }],
    historyByMatter: { 1: REC },
    subs: [sub('C1', ['ZONING COMMITTEE'])],
  });
  h.deps.detectedSince = 100; // matter detectedAt=5 is older → skipped
  const summary = await runEscalationSweep(h.deps);
  assert.equal(summary.trackedCount, 0);
  assert.equal(h.posted.length, 0);
});

test('ES channel gets the ES card variant', async () => {
  const h = harness({
    tracked: [{ matterId: 1, title: 'Rezoning', eventBodyName: 'ZONING COMMITTEE', detectedAt: 10 }],
    historyByMatter: { 1: REC },
    subs: [sub('CES', ['ZONING COMMITTEE'])],
  });
  await runEscalationSweep(h.deps);
  assert.equal(h.posted[0].card.text, 'card:F1:es');
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `cd agent && node --test tests/escalation/sweep.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
// agent/escalation/sweep.js
// Pure escalation-sweep orchestration (MOO-52). Mirrors poller/poll.js: all I/O
// injected. For each tracked, not-yet-escalated matter it detects the committee→
// Council transition, re-derives the watching channels via the SAME
// matchSubscriptions on the stored detected row, posts a ping, and records the
// matter once.

import { matchSubscriptions } from '../alerts/match.js';
import { detectEscalation } from './detect.js';

export async function runEscalationSweep(deps) {
  const {
    client, detectedSince, now,
    listTrackedMatters, listEscalatedMatterIds, listSubscriptions,
    getMatterHistory, getMatterMeta, matterUrl,
    buildCard, postCard, recordEscalation, languageFor, logger = console,
  } = deps;

  const tracked = (await listTrackedMatters(client)).filter((r) => r.detectedAt >= detectedSince);
  const byMatter = new Map();
  for (const row of tracked) {
    if (!byMatter.has(row.matterId)) byMatter.set(row.matterId, []);
    byMatter.get(row.matterId).push(row);
  }

  const escalated = new Set(await listEscalatedMatterIds(client));
  const subscriptions = await listSubscriptions(client);

  let detected = 0;
  let pinged = 0;
  for (const [matterId, rows] of byMatter) {
    if (escalated.has(matterId)) continue;
    try {
      const esc = detectEscalation(await getMatterHistory(matterId));
      if (!esc) continue;
      detected += 1;

      const meta = await getMatterMeta(matterId);
      const channels = new Set();
      for (const row of rows) for (const ch of matchSubscriptions(row, subscriptions)) channels.add(ch);

      if (channels.size > 0) {
        const url = matterUrl(matterId, meta.guid);
        for (const channel of channels) {
          const card = buildCard(
            { fileNumber: meta.fileNumber, title: meta.title || rows[0].title, committee: esc.committee, recommendedDate: esc.date, url },
            languageFor(channel),
          );
          await postCard(channel, card);
          pinged += 1;
        }
      }

      await recordEscalation({
        client,
        matterId,
        fileNumber: meta.fileNumber,
        committee: esc.committee,
        recommendedDate: esc.date,
        channelsPinged: channels.size,
        escalatedAt: now(),
      });
      logger.log?.(`[escalation] matter ${matterId}: ${channels.size} ping(s)`);
    } catch (err) {
      logger.error?.(`[escalation] matter ${matterId} failed: ${err.message}`);
    }
  }

  return { trackedCount: byMatter.size, detected, pinged };
}
```

```js
// agent/escalation/index.js
export { detectEscalation, isCommitteeRecommendation } from './detect.js';
export { runEscalationSweep } from './sweep.js';
```

- [ ] **Step 4: Run test — verify it passes, then full suite**

Run: `cd agent && node --test tests/escalation/sweep.test.js && node --test`
Expected: sweep PASS (6 tests); full suite green (274 baseline + all new).

- [ ] **Step 5: Commit**

```bash
git add agent/escalation/sweep.js agent/escalation/index.js agent/tests/escalation/sweep.test.js
git commit -m "feat(escalation): runEscalationSweep — detect, re-derive channels, ping, record (MOO-52)"
```

---

## Task 6: Cron wiring + live verify

**Files:** Create `agent/scripts/escalation-once.mjs`, `agent/scripts/escalation-verify.mjs`; Modify `agent/crontab`

- [ ] **Step 1: Cron entry point**

```js
// agent/scripts/escalation-once.mjs
#!/usr/bin/env node

// Escalation sweep (MOO-52): for each matter we've already alerted on (and not
// yet escalated, within the recency window), check MatterHistory; when the
// controlling committee has recommended it for adoption/passage, ping the
// channels that got the original alert that it's headed to the full Council.
//
// ESCALATION_LOOKBACK_DAYS  how far back to consider tracked matters (default 90)
// ESCALATION_DRY_RUN=1      print pings instead of posting (and skip recording)

import { WebClient } from '@slack/web-api';
import { ConvexHttpClient } from 'convex/browser';
import { config } from 'dotenv';

config({ path: '.env.local' });
config();

import { escalationCard } from '../blockkit/index.js';
import { api } from '../convex/_generated/api.js';
import { createLegistarClient, matterDetailUrl } from '../poller/index.js';
import { runEscalationSweep } from '../escalation/index.js';

const CLIENT = process.env.POLL_CLIENT || 'milwaukee';
const LOOKBACK = Number(process.env.ESCALATION_LOOKBACK_DAYS || '90');
const DRY_RUN = process.env.ESCALATION_DRY_RUN === '1';
const USER_AGENT =
  'GavelCivicAgent/0.1 (+https://github.com/tmoody1973/gavel-slack-agent; contact tarik@radiomilwaukee.org)';

const url = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL;
if (!url) {
  console.error('CONVEX_URL missing.');
  process.exit(1);
}

const convex = new ConvexHttpClient(url);
const legistar = createLegistarClient({ fetch, client: CLIENT, userAgent: USER_AGENT });
const slack = new WebClient(process.env.SLACK_BOT_TOKEN || process.env.SLACK_USER_TOKEN);

async function main() {
  const detectedSince = Date.now() - LOOKBACK * 24 * 60 * 60 * 1000;
  const subscriptions = await convex.query(api.subscriptions.listSubscriptions, { client: CLIENT });
  const langByChannel = new Map(subscriptions.map((s) => [s.channelId, s.language || 'en']));

  const summary = await runEscalationSweep({
    client: CLIENT,
    detectedSince,
    now: () => Date.now(),
    listTrackedMatters: (client) => convex.query(api.detectedItems.listSentWithMatter, { client }),
    listEscalatedMatterIds: (client) => convex.query(api.escalations.listEscalatedMatterIds, { client }),
    listSubscriptions: (client) => convex.query(api.subscriptions.listSubscriptions, { client }),
    getMatterHistory: (matterId) => legistar.getMatterHistory(matterId),
    getMatterMeta: (matterId) => legistar.getMatter(matterId),
    matterUrl: (matterId, guid) => matterDetailUrl(matterId, guid),
    buildCard: (info, language) => escalationCard({ ...info, language }),
    postCard: async (channel, card) => {
      if (DRY_RUN) {
        console.log(`--- ${channel} ---\n${JSON.stringify(card.blocks, null, 2)}`);
        return;
      }
      await slack.chat.postMessage({ channel, text: card.text, blocks: card.blocks });
    },
    recordEscalation: (rec) => (DRY_RUN ? Promise.resolve() : convex.mutation(api.escalations.recordEscalation, rec)),
    languageFor: (channel) => langByChannel.get(channel) || 'en',
  });

  console.log(
    `[${new Date().toISOString()}] ${CLIENT}: ${summary.trackedCount} tracked matters, ` +
      `${summary.detected} escalating, ${summary.pinged} ping(s)${DRY_RUN ? ' (dry-run)' : ''}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`[${new Date().toISOString()}] escalation sweep failed:`, err.message);
    process.exit(1);
  });
```

- [ ] **Step 2: Crontab line** (append to `agent/crontab`)

```bash
# Gavel Escalation ping — committee→Council transition for tracked matters (MOO-52).
# Every 6h: catches a committee recommendation well before the next Council vote.
0 */6 * * * node /app/scripts/escalation-once.mjs
```

- [ ] **Step 3: Live verify script**

```js
// agent/scripts/escalation-verify.mjs
#!/usr/bin/env node

// Live verification for MOO-52 (real Legistar; Convex read; Slack dry-run).
//   1. Finds a real matter that ALREADY shows a committee "RECOMMENDED FOR
//      ADOPTION/PASSAGE" in its history (proves the detector against reality).
//   2. Runs the sweep with that matter as the only tracked row + a fake
//      subscription matching its committee → shows a real ping card (dry).
//   3. Runs again with the matter in the escalated set → shows it is skipped.
//   4. Also asserts a known in-committee-only matter does NOT escalate.
//
// Usage: cd agent && node scripts/escalation-verify.mjs

import { ConvexHttpClient } from 'convex/browser';
import { config } from 'dotenv';

config({ path: '.env.local' });
config();

import { escalationCard } from '../blockkit/index.js';
import { createLegistarClient, matterDetailUrl } from '../poller/index.js';
import { detectEscalation, runEscalationSweep } from '../escalation/index.js';

const CLIENT = process.env.POLL_CLIENT || 'milwaukee';
const USER_AGENT = 'GavelCivicAgent/0.1 (+https://github.com/tmoody1973/gavel-slack-agent; contact tarik@radiomilwaukee.org)';
const legistar = createLegistarClient({ fetch, client: CLIENT, userAgent: USER_AGENT });
const base = `https://webapi.legistar.com/v1/${CLIENT}`;

async function findRecommendedMatter() {
  const q = new URLSearchParams({ $filter: "MatterStatusName eq 'Passed' and MatterTypeName eq 'Resolution'", $orderby: 'MatterPassedDate desc', $top: '5' });
  const matters = await (await fetch(`${base}/matters?${q}`, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } })).json();
  for (const m of matters) {
    const esc = detectEscalation(await legistar.getMatterHistory(m.MatterId));
    if (esc) return { matterId: m.MatterId, file: m.MatterFile, committee: esc.committee, date: esc.date };
  }
  throw new Error('No recently-passed matter with a committee recommendation found.');
}

async function runOnce(tracked, escalatedIds) {
  const posted = [];
  const recorded = [];
  const summary = await runEscalationSweep({
    client: CLIENT,
    detectedSince: 0,
    now: () => Date.now(),
    listTrackedMatters: async () => tracked,
    listEscalatedMatterIds: async () => escalatedIds,
    listSubscriptions: async () => [{ channelId: 'CESCVERIFY', committees: [tracked[0].eventBodyName], keywords: [] }],
    getMatterHistory: (id) => legistar.getMatterHistory(id),
    getMatterMeta: (id) => legistar.getMatter(id),
    matterUrl: (id, guid) => matterDetailUrl(id, guid),
    buildCard: (info, language) => escalationCard({ ...info, language }),
    postCard: async (channel, card) => posted.push({ channel, card }),
    recordEscalation: async (rec) => recorded.push(rec),
    languageFor: () => 'en',
  });
  return { posted, recorded, summary };
}

async function main() {
  const target = await findRecommendedMatter();
  console.log(`\n[1] Real matter ${target.matterId} (File #${target.file}) — committee "${target.committee}" recommended on ${target.date}.`);

  const tracked = [{ matterId: target.matterId, title: '(real)', eventBodyName: target.committee, detectedAt: Date.now() }];

  const run1 = await runOnce(tracked, []);
  console.log(`\n[2] Sweep → detected=${run1.summary.detected}, pinged=${run1.summary.pinged}.`);
  if (run1.summary.pinged !== 1) throw new Error('Expected exactly one ping for the recommended matter.');
  console.log('    Ping card:\n' + JSON.stringify(run1.posted[0].card.blocks, null, 2));

  const run2 = await runOnce(tracked, [target.matterId]);
  console.log(`\n[3] Re-run with matter already escalated → pinged=${run2.summary.pinged} (expected 0).`);
  if (run2.summary.pinged !== 0) throw new Error('Idempotency FAILED: re-ping for an escalated matter.');

  console.log('\n✅ Escalation detector + idempotency verified against real Legistar data.');
}

main().then(() => process.exit(0)).catch((err) => { console.error('VERIFY FAILED:', err.message); process.exit(1); });
```

- [ ] **Step 4: Lint + commit (live run is Task 7)**

```bash
cd agent && npx @biomejs/biome check --write scripts/escalation-once.mjs scripts/escalation-verify.mjs escalation/ blockkit/escalation-card.js
git add agent/scripts/escalation-once.mjs agent/scripts/escalation-verify.mjs agent/crontab
git commit -m "feat(escalation): 6-hourly cron entrypoint + live verify + crontab line (MOO-52)"
```

---

## Task 7: Live verification gate (the proof)

- [ ] **Step 1:** Push schema/functions: `cd agent && npx convex dev --once` → `matterEscalations` + functions deploy clean.
- [ ] **Step 2:** Detector + idempotency vs real data: `cd agent && node scripts/escalation-verify.mjs`. Expected: a real recommended matter found, sweep pings exactly once with a rendered card (real File #, committee, Legistar link), re-run with it escalated → 0 pings. **Paste output** into Linear (proves "real transition → ping" + "no ping for in-committee-only" via the detector tests + "no re-ping").
- [ ] **Step 3:** Negative path against real data: confirm `detectEscalation` returns null for a real matter that's only ever been HELD in committee (pick one via a scratch query, paste the history + the null result).
- [ ] **Step 4:** Full cron dry-run against the live deployment: `cd agent && ESCALATION_DRY_RUN=1 node scripts/escalation-once.mjs` → runs end-to-end over the real tracked set, clean exit (likely 0 pings if no currently-tracked matter is mid-escalation — that's fine; report the counts).
- [ ] **Step 5:** Full suite + lint: `cd agent && node --test && npx @biomejs/biome check .` (ignore the pre-existing `scripts/parcel-card-verify.mjs` lint warnings — not ours).
- [ ] **Step 6:** Move MOO-52 → In Review, attach the PR, post the evidence comment. Note what stays human (eyeball a real ping in Slack) and the cadence/lookback choices.

---

## Self-Review

**Spec coverage:**
- Poller diffs `MatterHistory` for committee → full-Council transitions — Task 1 (`detectEscalation`) + Task 5 (sweep). ✔
- Escalation ping posts to the channel watching that matter — Task 5 (re-derive via `matchSubscriptions`) + Task 4 (card) + Task 6 (post). ✔
- Ping links back to the original alert + new hearing — Task 4 card (File #, original committee, "you were alerted in committee", Legistar link) + Task 2 (`matterDetailUrl`). ✔
- Verify: real advanced matter → transition + ping — Task 7 Step 2. ✔
- Verify: no ping for in-committee-only updates — Task 1 tests + Task 5 test + Task 7 Step 3. ✔
- Fire once — Task 3 (`matterEscalations`) + Task 5 (escalated set). ✔

**Placeholder scan:** none — every code/test/run step is concrete. ✔

**Type consistency:** detected-row shape (`matterId/title/eventBodyName/detectedAt/eventId`) identical in Tasks 3/5/6/7. meta shape (`fileNumber/guid/title/statusName`) identical in Tasks 2/5/6. escalation info (`committee/date/action`) Tasks 1/5. `recordEscalation` arg matches the Convex mutation validator (Task 3) and the sweep call (Task 5). `escalationCard` info keys match what the sweep builds (Tasks 4/5). ✔

**Out of scope (honored):** no watchlist entity sweeps (MOO-53), no agenda-change detection (MOO-51), no persistence of the original Slack message ts (re-derive instead, per the decision).
