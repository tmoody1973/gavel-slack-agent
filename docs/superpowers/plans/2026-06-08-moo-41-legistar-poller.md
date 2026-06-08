# MOO-41 Legistar Poller Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A scheduled poller watches Milwaukee Legistar, detects genuinely-new `Final` agenda items by diffing against last-seen state in Convex, and enqueues a summarize+alert job for each — idempotently, end-to-end under 20 minutes.

**Architecture:** A pure, deterministic **diff core** (`given fetched items + seen keys → new items`) is the heart and the idempotency guarantee; it's unit-tested in isolation. The **Legistar fetch** and **Convex read/write** are injected boundaries, exercised against real data in a live verify script. Detection writes one row per new item into a single `detectedAgendaItems` Convex table that is **both** the seen-ledger (idempotency) **and** the alert queue (`alertStatus: pending|sent`) MOO-44 will drain. Everything is built `{client}`-aware (Milwaukee now, County later = a one-line flip).

**Tech Stack:** Node.js (ESM, `node --test`), Convex (schema + query/mutation), global `fetch` for Legistar OData, Fly.io scheduled machine (supercronic) for the 5-minute cron.

---

## Design decisions (settled at session start)

1. **Dedup key = `EventItemId`** per agenda line item. Detection key = `` `${client}:${eventItemId}` ``. Same matter on two meetings → two EventItemIds → two correct alerts.
2. **Enqueue seam = one `detectedAgendaItems` table** that is both idempotency ledger and work queue (`alertStatus`). Poller inserts `pending`; MOO-44 reads `pending`, summarizes, posts, flips to `sent`.
3. **Detect-all, no committee pre-filter in the poller.** Store `eventBodyName` on the row; MOO-44 matches `listSubscriptions` at post time.
4. **Local logic + live verify first; Fly cron wrapper last** (it's acceptance, just sequenced last).

## Out of scope (do not build)

- Summary generation (MOO-42 ✅ — MOO-44 *calls* it).
- Agenda-change / walk-on detector (Draft→Final diff) — Phase 3, MOO-51.
- Escalation ping — MOO-52.
- Subscription→channel matching and the actual Slack post — MOO-44.

## File structure

| Path | Responsibility | Tested by |
|---|---|---|
| `agent/poller/keys.js` | `detectionKey(client, eventItemId)` — the stable dedup key | unit |
| `agent/poller/diff.js` | `diffNewItems(fetched, seenKeys)` — the pure idempotent core | unit |
| `agent/poller/legistar.js` | pure: `buildEventsQuery`, `addDaysIso`, `mapEvent`, `mapEventItem`, `toDetectedItem`; boundary: `createLegistarClient` | unit (pure) + live (client) |
| `agent/poller/poll.js` | `runPoll(deps)` — wires fetch → diff → enqueue, all boundaries injected | unit (fakes) |
| `agent/poller/index.js` | barrel re-exports | — |
| `agent/convex/schema.ts` | add `detectedAgendaItems` table | live |
| `agent/convex/detectedItems.ts` | `listSeenKeys`, `enqueueDetected`, `listPending`, `removeDetected` | live |
| `agent/scripts/poller-verify.mjs` | live acceptance proof: cold run detects, re-run is idempotent, latency | live |
| `agent/scripts/poll-once.mjs` | single real poll entrypoint (the cron command) | live |
| `agent/Dockerfile`, `agent/fly.toml`, `agent/crontab` | Fly scheduled machine running the poll every 5 min | live |

---

## Task 1: Detection key + pure diff core

**Files:**
- Create: `agent/poller/keys.js`
- Create: `agent/poller/diff.js`
- Test: `agent/tests/poller/diff.test.js`

- [ ] **Step 1: Write the failing test**

```js
// agent/tests/poller/diff.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectionKey } from '../../poller/keys.js';
import { diffNewItems } from '../../poller/diff.js';

const item = (client, eventItemId) => ({ client, eventItemId, title: `item ${eventItemId}` });

test('detectionKey composes client and eventItemId', () => {
  assert.equal(detectionKey('milwaukee', 42), 'milwaukee:42');
});

test('empty fetch yields no new items', () => {
  assert.deepEqual(diffNewItems([], new Set()), []);
});

test('all-seen yields no new items', () => {
  const seen = new Set(['milwaukee:1', 'milwaukee:2']);
  assert.deepEqual(diffNewItems([item('milwaukee', 1), item('milwaukee', 2)], seen), []);
});

test('returns only items whose key is not in seen', () => {
  const seen = new Set(['milwaukee:1']);
  const out = diffNewItems([item('milwaukee', 1), item('milwaukee', 2)], seen);
  assert.deepEqual(out.map((i) => i.eventItemId), [2]);
});

test('dedups repeated keys within a single fetch batch', () => {
  const out = diffNewItems([item('milwaukee', 7), item('milwaukee', 7)], new Set());
  assert.equal(out.length, 1);
});

test('same eventItemId under different clients are distinct', () => {
  const out = diffNewItems([item('milwaukee', 5), item('milwaukeecounty', 5)], new Set());
  assert.equal(out.length, 2);
});

test('accepts an array of keys as well as a Set', () => {
  const out = diffNewItems([item('milwaukee', 1), item('milwaukee', 2)], ['milwaukee:1']);
  assert.deepEqual(out.map((i) => i.eventItemId), [2]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent && node --test tests/poller/diff.test.js`
Expected: FAIL — cannot find module `../../poller/keys.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// agent/poller/keys.js
/** Stable dedup key for an agenda item across poll runs. Client-scoped so the
 *  same EventItemId under a different Legistar client stays distinct. */
export function detectionKey(client, eventItemId) {
  return `${client}:${eventItemId}`;
}
```

```js
// agent/poller/diff.js
import { detectionKey } from './keys.js';

/**
 * The idempotent heart of the poller: given fetched items and the set of keys
 * already seen, return only the genuinely-new items. Pure and deterministic —
 * also dedups repeats within one fetch batch.
 *
 * @param {Array<{client: string, eventItemId: number}>} fetchedItems
 * @param {Set<string>|string[]} seenKeys  full detectionKeys, not raw ids
 */
export function diffNewItems(fetchedItems, seenKeys) {
  const seen = seenKeys instanceof Set ? seenKeys : new Set(seenKeys);
  const newItems = [];
  const batch = new Set();
  for (const item of fetchedItems) {
    const key = detectionKey(item.client, item.eventItemId);
    if (seen.has(key) || batch.has(key)) continue;
    batch.add(key);
    newItems.push(item);
  }
  return newItems;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agent && node --test tests/poller/diff.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add agent/poller/keys.js agent/poller/diff.js agent/tests/poller/diff.test.js
git commit -m "feat(poller): pure idempotent agenda-item diff core (MOO-41)"
```

---

## Task 2: Legistar query builders + response mappers (pure)

**Files:**
- Create: `agent/poller/legistar.js` (pure exports first; client added in Task 3)
- Test: `agent/tests/poller/legistar.test.js`

- [ ] **Step 1: Write the failing test**

```js
// agent/tests/poller/legistar.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDaysIso,
  buildEventsQuery,
  mapEvent,
  mapEventItem,
  toDetectedItem,
} from '../../poller/legistar.js';

test('addDaysIso advances the date in UTC', () => {
  assert.equal(addDaysIso('2026-06-08T00:00:00.000Z', 7).slice(0, 10), '2026-06-15');
});

test('buildEventsQuery filters a 7-day window of Final agendas', () => {
  const q = buildEventsQuery('2026-06-08T12:00:00.000Z', 7);
  assert.ok(q.startsWith('events?'));
  const decoded = decodeURIComponent(q);
  assert.ok(decoded.includes("EventDate ge datetime'2026-06-08'"));
  assert.ok(decoded.includes("EventDate lt datetime'2026-06-15'"));
  assert.ok(decoded.includes("EventAgendaStatusName eq 'Final'"));
});

test('mapEvent picks the spine fields and the agenda-published timestamp', () => {
  const e = mapEvent({
    EventId: 100,
    EventBodyName: 'ZONING COMMITTEE',
    EventDate: '2026-06-10T00:00:00',
    EventAgendaStatusName: 'Final',
    EventAgendaLastPublishedUTC: '2026-06-08T15:00:00Z',
  });
  assert.deepEqual(e, {
    eventId: 100,
    eventBodyName: 'ZONING COMMITTEE',
    eventDate: '2026-06-10T00:00:00',
    agendaPublishedUTC: '2026-06-08T15:00:00Z',
  });
});

test('mapEventItem normalizes id, matter, title, agenda number', () => {
  const it = mapEventItem({
    EventItemId: 555,
    EventItemMatterId: 999,
    EventItemTitle: 'A resolution relating to rezoning',
    EventItemAgendaNumber: '14',
  });
  assert.deepEqual(it, {
    eventItemId: 555,
    matterId: 999,
    title: 'A resolution relating to rezoning',
    agendaNumber: '14',
  });
});

test('toDetectedItem joins event + item into the queue row and omits undefined', () => {
  const event = { eventId: 100, eventBodyName: 'ZONING', eventDate: '2026-06-10T00:00:00', agendaPublishedUTC: undefined };
  const item = { eventItemId: 555, matterId: undefined, title: 'Rezoning', agendaNumber: '14' };
  const row = toDetectedItem('milwaukee', event, item);
  assert.deepEqual(row, {
    client: 'milwaukee',
    eventItemId: 555,
    eventId: 100,
    title: 'Rezoning',
    agendaNumber: '14',
    eventBodyName: 'ZONING',
    eventDate: '2026-06-10T00:00:00',
  });
  assert.ok(!('matterId' in row));
  assert.ok(!('agendaPublishedUTC' in row));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent && node --test tests/poller/legistar.test.js`
Expected: FAIL — cannot find module `../../poller/legistar.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// agent/poller/legistar.js
const DEFAULT_WINDOW_DAYS = 7;

/** Advance an ISO timestamp by N days (UTC), deterministically. */
export function addDaysIso(iso, days) {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

/** Build the `/events` OData query for upcoming Final agendas in a date window.
 *  Legistar accepts `+` for spaces and `datetime'YYYY-MM-DD'` literals. */
export function buildEventsQuery(nowIso, windowDays = DEFAULT_WINDOW_DAYS) {
  const start = nowIso.slice(0, 10);
  const end = addDaysIso(nowIso, windowDays).slice(0, 10);
  const filter =
    `EventDate ge datetime'${start}' and EventDate lt datetime'${end}' ` +
    `and EventAgendaStatusName eq 'Final'`;
  const params = new URLSearchParams({ $filter: filter, $orderby: 'EventDate', $top: '1000' });
  return `events?${params.toString()}`;
}

/** Normalize a raw Legistar event to the fields the spine needs. */
export function mapEvent(raw) {
  return {
    eventId: raw.EventId,
    eventBodyName: raw.EventBodyName,
    eventDate: raw.EventDate,
    agendaPublishedUTC: raw.EventAgendaLastPublishedUTC ?? undefined,
  };
}

/** Normalize a raw Legistar event item (agenda line) to spine fields. */
export function mapEventItem(raw) {
  return {
    eventItemId: raw.EventItemId,
    matterId: raw.EventItemMatterId ?? undefined,
    title: raw.EventItemTitle ?? '',
    agendaNumber: raw.EventItemAgendaNumber ?? undefined,
  };
}

/** Join one event + one item into the `detectedAgendaItems` queue row.
 *  Omits undefined optionals so the Convex validator sees absent, not null. */
export function toDetectedItem(client, event, item) {
  const row = {
    client,
    eventItemId: item.eventItemId,
    eventId: event.eventId,
    title: item.title,
    eventBodyName: event.eventBodyName,
  };
  if (item.matterId !== undefined) row.matterId = item.matterId;
  if (item.agendaNumber !== undefined) row.agendaNumber = item.agendaNumber;
  if (event.eventDate !== undefined) row.eventDate = event.eventDate;
  if (event.agendaPublishedUTC !== undefined) row.agendaPublishedUTC = event.agendaPublishedUTC;
  return row;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agent && node --test tests/poller/legistar.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add agent/poller/legistar.js agent/tests/poller/legistar.test.js
git commit -m "feat(poller): pure Legistar query builder + response mappers (MOO-41)"
```

---

## Task 3: Legistar HTTP client (injected boundary)

**Files:**
- Modify: `agent/poller/legistar.js` (append `createLegistarClient`)
- Test: `agent/tests/poller/legistar-client.test.js`

- [ ] **Step 1: Write the failing test (fake fetch, no network)**

```js
// agent/tests/poller/legistar-client.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLegistarClient } from '../../poller/legistar.js';

function fakeFetch(routes) {
  const calls = [];
  const fetch = async (url, opts) => {
    calls.push({ url, opts });
    const body = routes[new URL(url).pathname.split('/').pop()] ?? routes[url] ?? [];
    return { ok: true, status: 200, json: async () => body };
  };
  return { fetch, calls };
}

test('fetchUpcomingFinalEvents hits /events with the window query, UA, mapped result', async () => {
  const { fetch, calls } = fakeFetch({
    events: [{ EventId: 1, EventBodyName: 'ZONING', EventDate: '2026-06-10T00:00:00', EventAgendaLastPublishedUTC: '2026-06-08T15:00:00Z' }],
  });
  const client = createLegistarClient({
    fetch,
    client: 'milwaukee',
    userAgent: 'GavelCivicAgent/0.1',
    now: () => '2026-06-08T12:00:00.000Z',
  });
  const events = await client.fetchUpcomingFinalEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].eventId, 1);
  assert.ok(calls[0].url.includes('/v1/milwaukee/events?'));
  assert.equal(calls[0].opts.headers['User-Agent'], 'GavelCivicAgent/0.1');
});

test('fetchEventItems hits /events/{id}/eventitems with Attachments=1, mapped', async () => {
  const { fetch, calls } = fakeFetch({
    eventitems: [{ EventItemId: 9, EventItemTitle: 'Rezoning', EventItemMatterId: 3, EventItemAgendaNumber: '14' }],
  });
  const client = createLegistarClient({ fetch, client: 'milwaukee', userAgent: 'UA', now: () => '2026-06-08T12:00:00.000Z' });
  const items = await client.fetchEventItems(1);
  assert.equal(items[0].eventItemId, 9);
  assert.ok(calls[0].url.includes('/v1/milwaukee/events/1/eventitems'));
  assert.ok(calls[0].url.includes('Attachments=1'));
});

test('throws a clear error on a non-ok response', async () => {
  const fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
  const client = createLegistarClient({ fetch, client: 'milwaukee', userAgent: 'UA', now: () => '2026-06-08T12:00:00.000Z' });
  await assert.rejects(() => client.fetchUpcomingFinalEvents(), /Legistar.*503/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent && node --test tests/poller/legistar-client.test.js`
Expected: FAIL — `createLegistarClient` is not exported.

- [ ] **Step 3: Append the client implementation to `agent/poller/legistar.js`**

```js
// --- appended to agent/poller/legistar.js ---

const LEGISTAR_BASE = 'https://webapi.legistar.com/v1';

/**
 * Create a Legistar OData client for one city ({client}-aware). `fetch` and
 * `now` are injected so the pure query/mapping logic is exercised in unit tests
 * and only this thin wiring touches the network in the verify script.
 */
export function createLegistarClient({ fetch, client, userAgent, now = () => new Date().toISOString(), baseUrl = LEGISTAR_BASE }) {
  const root = `${baseUrl}/${client}`;
  const headers = { 'User-Agent': userAgent, Accept: 'application/json' };

  async function getJson(path) {
    const url = `${root}/${path}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Legistar request failed: ${res.status} for ${url}`);
    return res.json();
  }

  async function fetchUpcomingFinalEvents() {
    const raw = await getJson(buildEventsQuery(now()));
    return raw.map(mapEvent);
  }

  async function fetchEventItems(eventId) {
    const raw = await getJson(`events/${eventId}/eventitems?AgendaNote=1&Attachments=1`);
    return raw.map(mapEventItem);
  }

  return { fetchUpcomingFinalEvents, fetchEventItems };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agent && node --test tests/poller/legistar-client.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add agent/poller/legistar.js agent/tests/poller/legistar-client.test.js
git commit -m "feat(poller): client-aware Legistar OData client over injected fetch (MOO-41)"
```

---

## Task 4: Poll orchestrator (boundaries injected, unit-tested with fakes)

**Files:**
- Create: `agent/poller/poll.js`
- Create: `agent/poller/index.js`
- Test: `agent/tests/poller/poll.test.js`

- [ ] **Step 1: Write the failing test**

```js
// agent/tests/poller/poll.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPoll } from '../../poller/poll.js';

function fakes({ events, itemsByEvent, seenIds = [] }) {
  const seen = new Set(seenIds);
  const enqueued = [];
  return {
    seen,
    enqueued,
    deps: {
      client: 'milwaukee',
      fetchUpcomingFinalEvents: async () => events,
      fetchEventItems: async (eventId) => itemsByEvent[eventId] ?? [],
      readSeenEventItemIds: async () => [...seen],
      enqueueDetected: async (items) => {
        for (const i of items) seen.add(i.eventItemId);
        enqueued.push(...items);
        return items.length;
      },
    },
  };
}

const EVENTS = [{ eventId: 1, eventBodyName: 'ZONING', eventDate: '2026-06-10T00:00:00', agendaPublishedUTC: '2026-06-08T15:00:00Z' }];
const ITEMS = { 1: [{ eventItemId: 9, title: 'Rezoning', matterId: 3, agendaNumber: '14' }] };

test('cold run detects and enqueues every live item', async () => {
  const f = fakes({ events: EVENTS, itemsByEvent: ITEMS });
  const result = await runPoll(f.deps);
  assert.equal(result.fetchedCount, 1);
  assert.equal(result.newItems.length, 1);
  assert.equal(f.enqueued.length, 1);
  assert.equal(f.enqueued[0].eventBodyName, 'ZONING');
});

test('second run is idempotent — nothing new, enqueue not called', async () => {
  const f = fakes({ events: EVENTS, itemsByEvent: ITEMS });
  await runPoll(f.deps);
  const before = f.enqueued.length;
  const result = await runPoll(f.deps);
  assert.equal(result.newItems.length, 0);
  assert.equal(f.enqueued.length, before);
});

test('same eventItemId under a different client is still detected (isolation)', async () => {
  const f = fakes({ events: EVENTS, itemsByEvent: ITEMS, seenIds: [9] });
  // seen contains 9 for THIS client; a county poll with the same id must still detect.
  const county = { ...f.deps, client: 'milwaukeecounty', readSeenEventItemIds: async () => [] };
  const result = await runPoll(county);
  assert.equal(result.newItems.length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent && node --test tests/poller/poll.test.js`
Expected: FAIL — cannot find module `../../poller/poll.js`.

- [ ] **Step 3: Write the implementation**

```js
// agent/poller/poll.js
import { diffNewItems } from './diff.js';
import { detectionKey } from './keys.js';
import { toDetectedItem } from './legistar.js';

/**
 * Run one poll cycle: fetch upcoming Final events + their agenda items, diff
 * against last-seen state, and enqueue the genuinely-new items. Every boundary
 * (Legistar fetch, Convex read/write) is injected so this orchestration is
 * unit-testable with in-memory fakes; the heart (diffNewItems) is pure.
 *
 * @param {{
 *   client: string,
 *   fetchUpcomingFinalEvents: () => Promise<object[]>,
 *   fetchEventItems: (eventId: number) => Promise<object[]>,
 *   readSeenEventItemIds: (client: string) => Promise<number[]>,
 *   enqueueDetected: (items: object[]) => Promise<number>,
 * }} deps
 */
export async function runPoll(deps) {
  const { client, fetchUpcomingFinalEvents, fetchEventItems, readSeenEventItemIds, enqueueDetected } = deps;

  const events = await fetchUpcomingFinalEvents();
  const fetched = [];
  for (const event of events) {
    const items = await fetchEventItems(event.eventId);
    for (const item of items) fetched.push(toDetectedItem(client, event, item));
  }

  const seenIds = await readSeenEventItemIds(client);
  const seenKeys = new Set(seenIds.map((id) => detectionKey(client, id)));
  const newItems = diffNewItems(fetched, seenKeys);

  if (newItems.length > 0) await enqueueDetected(newItems);
  return { fetchedCount: fetched.length, newItems };
}
```

```js
// agent/poller/index.js
export { detectionKey } from './keys.js';
export { diffNewItems } from './diff.js';
export {
  addDaysIso,
  buildEventsQuery,
  createLegistarClient,
  mapEvent,
  mapEventItem,
  toDetectedItem,
} from './legistar.js';
export { runPoll } from './poll.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agent && node --test tests/poller/poll.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the whole suite (no regressions)**

Run: `cd agent && node --test`
Expected: PASS — prior 42 + new poller tests (~60 total).

- [ ] **Step 6: Commit**

```bash
git add agent/poller/poll.js agent/poller/index.js agent/tests/poller/poll.test.js
git commit -m "feat(poller): poll orchestrator wiring fetch -> diff -> enqueue (MOO-41)"
```

---

## Task 5: Convex schema + detected-items functions

**Files:**
- Modify: `agent/convex/schema.ts` (add `detectedAgendaItems`)
- Create: `agent/convex/detectedItems.ts`

- [ ] **Step 1: Add the table to `agent/convex/schema.ts`**

Inside the `defineSchema({ ... })` object, after `subscriptions`, add:

```ts
  // Detection ledger AND alert queue in one (MOO-41). One row per genuinely-new
  // Final agenda item: its presence guarantees idempotency (never re-detected),
  // its alertStatus drives MOO-44's summarize+post. Civic-record keys only —
  // never any Slack message content (ToS guardrail).
  detectedAgendaItems: defineTable({
    client: v.union(v.literal('milwaukee'), v.literal('milwaukeecounty')),
    eventItemId: v.number(),
    eventId: v.number(),
    matterId: v.optional(v.number()),
    title: v.string(),
    agendaNumber: v.optional(v.string()),
    eventBodyName: v.string(),
    eventDate: v.optional(v.string()),
    agendaPublishedUTC: v.optional(v.string()),
    detectedAt: v.number(),
    alertStatus: v.union(v.literal('pending'), v.literal('sent')),
  })
    .index('by_client_item', ['client', 'eventItemId'])
    .index('by_client_status', ['client', 'alertStatus']),
```

- [ ] **Step 2: Create `agent/convex/detectedItems.ts`**

```ts
import { v } from 'convex/values';

import { mutation, query } from './_generated/server';

const clientValidator = v.union(v.literal('milwaukee'), v.literal('milwaukeecounty'));

// The poller-supplied portion of a queue row; detectedAt + alertStatus are
// stamped server-side so detection time is the DB's own clock.
const detectedItem = v.object({
  client: clientValidator,
  eventItemId: v.number(),
  eventId: v.number(),
  matterId: v.optional(v.number()),
  title: v.string(),
  agendaNumber: v.optional(v.string()),
  eventBodyName: v.string(),
  eventDate: v.optional(v.string()),
  agendaPublishedUTC: v.optional(v.string()),
});

/** The seen EventItemIds for a client — the poller's idempotency input. */
export const listSeenKeys = query({
  args: { client: clientValidator },
  handler: async (ctx, { client }) => {
    const rows = await ctx.db
      .query('detectedAgendaItems')
      .withIndex('by_client_item', (q) => q.eq('client', client))
      .collect();
    return rows.map((r) => r.eventItemId);
  },
});

/** Insert genuinely-new items as pending alerts. DB-level idempotency guard:
 *  skips any (client, eventItemId) already present. Returns the count inserted. */
export const enqueueDetected = mutation({
  args: { items: v.array(detectedItem) },
  handler: async (ctx, { items }) => {
    let inserted = 0;
    for (const item of items) {
      const existing = await ctx.db
        .query('detectedAgendaItems')
        .withIndex('by_client_item', (q) => q.eq('client', item.client).eq('eventItemId', item.eventItemId))
        .unique();
      if (existing) continue;
      await ctx.db.insert('detectedAgendaItems', { ...item, detectedAt: Date.now(), alertStatus: 'pending' });
      inserted += 1;
    }
    return inserted;
  },
});

/** Pending alerts awaiting summarize+post (MOO-44's consumer). */
export const listPending = query({
  args: { client: v.optional(clientValidator) },
  handler: (ctx, { client }) =>
    client
      ? ctx.db
          .query('detectedAgendaItems')
          .withIndex('by_client_status', (q) => q.eq('client', client).eq('alertStatus', 'pending'))
          .collect()
      : ctx.db
          .query('detectedAgendaItems')
          .filter((q) => q.eq(q.field('alertStatus'), 'pending'))
          .collect(),
});

/** Remove one detected row by key — used only by the verify script to keep the
 *  acceptance run repeatable. Returns the deleted id, or null. */
export const removeDetected = mutation({
  args: { client: clientValidator, eventItemId: v.number() },
  handler: async (ctx, { client, eventItemId }) => {
    const existing = await ctx.db
      .query('detectedAgendaItems')
      .withIndex('by_client_item', (q) => q.eq('client', client).eq('eventItemId', eventItemId))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return existing?._id ?? null;
  },
});
```

- [ ] **Step 3: Push schema + functions and codegen**

Run: `cd agent && npx convex dev --once`
Expected: schema compiles, `detectedAgendaItems` table created, `convex/_generated` updated, no validation errors.

- [ ] **Step 4: Lint**

Run: `cd agent && npx @biomejs/biome check convex/detectedItems.ts convex/schema.ts`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add agent/convex/schema.ts agent/convex/detectedItems.ts
git commit -m "feat(convex): detectedAgendaItems ledger+queue table and functions (MOO-41)"
```

---

## Task 6: Live verification script (the acceptance proof)

**Files:**
- Create: `agent/scripts/poller-verify.mjs`

This script proves all three verification-checklist items against **real Legistar + real Convex**: (1) a cold run detects genuinely-new items, (2) an immediate re-run detects zero (idempotent), (3) measured latency = `detectedAt − agendaPublishedUTC`.

- [ ] **Step 1: Write the script**

```js
// agent/scripts/poller-verify.mjs
#!/usr/bin/env node

// MOO-41 verification: poll REAL Milwaukee Legistar, diff against REAL Convex,
// and prove the acceptance criteria —
//   (1) cold run detects genuinely-new Final agenda items,
//   (2) an immediate re-run detects ZERO (idempotent diff),
//   (3) detection latency = detectedAt - EventAgendaLastPublishedUTC.
// Repeatable: it resets the rows it is about to test, then cleans them up.
//
// Prereq: `npx convex dev` (writes CONVEX_URL to .env.local). Then:
//   node scripts/poller-verify.mjs

import { ConvexHttpClient } from 'convex/browser';
import { config } from 'dotenv';

config({ path: '.env.local' });
config();

import { api } from '../convex/_generated/api.js';
import { createLegistarClient, runPoll, toDetectedItem } from '../poller/index.js';

const url = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL;
if (!url) {
  console.error('CONVEX_URL missing — run `npx convex dev` first.');
  process.exit(1);
}

const CLIENT = 'milwaukee';
const USER_AGENT = 'GavelCivicAgent/0.1 (+https://github.com/tmoody1973/gavel-slack-agent; contact tarik@radiomilwaukee.org)';

const convex = new ConvexHttpClient(url);
const legistar = createLegistarClient({ fetch, client: CLIENT, userAgent: USER_AGENT });

const deps = {
  client: CLIENT,
  fetchUpcomingFinalEvents: () => legistar.fetchUpcomingFinalEvents(),
  fetchEventItems: (id) => legistar.fetchEventItems(id),
  readSeenEventItemIds: (client) => convex.query(api.detectedItems.listSeenKeys, { client }),
  enqueueDetected: (items) => convex.mutation(api.detectedItems.enqueueDetected, { items }),
};

async function currentLiveRows() {
  const events = await legistar.fetchUpcomingFinalEvents();
  const rows = [];
  for (const event of events) {
    const items = await legistar.fetchEventItems(event.eventId);
    for (const item of items) rows.push(toDetectedItem(CLIENT, event, item));
  }
  return rows;
}

async function main() {
  console.log(`\n=== MOO-41 poller verify — ${CLIENT} — ${new Date().toISOString()} ===`);

  const live = await currentLiveRows();
  console.log(`Live Final agenda items in the next 7 days: ${live.length}`);
  if (live.length === 0) {
    console.log('No Final agendas posted in the window right now — re-run when the city posts one.');
    return;
  }

  // Reset only the rows we are about to test, so detection is reproducible.
  for (const r of live) {
    await convex.mutation(api.detectedItems.removeDetected, { client: CLIENT, eventItemId: r.eventItemId });
  }

  // RUN 1 (cold) — must detect every live item.
  const run1 = await runPoll(deps);
  console.log(`\nRUN 1 (cold): fetched ${run1.fetchedCount}, detected ${run1.newItems.length} NEW`);
  const now = Date.now();
  for (const item of run1.newItems.slice(0, 10)) {
    const latency = item.agendaPublishedUTC
      ? `${Math.round((now - Date.parse(item.agendaPublishedUTC)) / 60000)} min since agenda published`
      : 'no agendaPublishedUTC';
    console.log(`  • [${item.eventBodyName}] item ${item.agendaNumber ?? '?'} (EventItemId ${item.eventItemId}) — ${item.title.slice(0, 80)}  [${latency}]`);
  }

  // RUN 2 (immediate) — must detect ZERO (idempotent diff).
  const run2 = await runPoll(deps);
  console.log(`\nRUN 2 (immediate re-run): fetched ${run2.fetchedCount}, detected ${run2.newItems.length} NEW`);
  console.log(run2.newItems.length === 0 ? 'IDEMPOTENT ✓ — no duplicate detections' : 'NOT IDEMPOTENT ✗ — investigate');

  // Latency headline: freshest agenda in the batch.
  const published = run1.newItems.map((i) => i.agendaPublishedUTC).filter(Boolean).map((t) => Date.parse(t));
  if (published.length) {
    const freshest = Math.max(...published);
    console.log(`\nLATENCY: most-recently-published agenda was ${Math.round((now - freshest) / 60000)} min before detection (target < 20 min on a live post).`);
  }

  // CLEANUP — remove the rows this run inserted so it stays repeatable.
  for (const r of live) {
    await convex.mutation(api.detectedItems.removeDetected, { client: CLIENT, eventItemId: r.eventItemId });
  }
  console.log('\nCLEANUP: test rows removed. (Real cron leaves rows in place — they ARE the ledger.)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run it against live data**

Run: `cd agent && node scripts/poller-verify.mjs`
Expected: RUN 1 detects N>0 items with titles + latency; RUN 2 detects 0 (`IDEMPOTENT ✓`); a latency line. If the window has zero Final agendas, it says so — re-run later.

- [ ] **Step 3: Capture the output** for the Linear evidence comment (paste the real run log).

- [ ] **Step 4: Commit**

```bash
git add agent/scripts/poller-verify.mjs
git commit -m "test(poller): live Legistar+Convex verify — cold detect, idempotent re-run, latency (MOO-41)"
```

---

## Task 7: Fly.io 5-minute cron wrapper

**Files:**
- Create: `agent/scripts/poll-once.mjs` (single real poll, then exit)
- Create: `agent/Dockerfile`
- Create: `agent/crontab`
- Create: `agent/fly.toml`

Fly scheduled machines only support hourly/daily granularity, so a 5-minute cadence uses a always-on machine running **supercronic** with a `*/5` crontab.

- [ ] **Step 1: Write the one-shot poll entrypoint**

```js
// agent/scripts/poll-once.mjs
#!/usr/bin/env node

// One real poll cycle for the Fly cron: fetch live Legistar, diff against
// Convex, enqueue new items, exit. {client}-aware via POLL_CLIENT (default
// milwaukee).

import { ConvexHttpClient } from 'convex/browser';
import { config } from 'dotenv';

config({ path: '.env.local' });
config();

import { api } from '../convex/_generated/api.js';
import { createLegistarClient, runPoll } from '../poller/index.js';

const CLIENT = process.env.POLL_CLIENT || 'milwaukee';
const USER_AGENT = 'GavelCivicAgent/0.1 (+https://github.com/tmoody1973/gavel-slack-agent; contact tarik@radiomilwaukee.org)';

const url = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL;
if (!url) {
  console.error('CONVEX_URL missing.');
  process.exit(1);
}

const convex = new ConvexHttpClient(url);
const legistar = createLegistarClient({ fetch, client: CLIENT, userAgent: USER_AGENT });

runPoll({
  client: CLIENT,
  fetchUpcomingFinalEvents: () => legistar.fetchUpcomingFinalEvents(),
  fetchEventItems: (id) => legistar.fetchEventItems(id),
  readSeenEventItemIds: (client) => convex.query(api.detectedItems.listSeenKeys, { client }),
  enqueueDetected: (items) => convex.mutation(api.detectedItems.enqueueDetected, { items }),
})
  .then((r) => {
    console.log(`[${new Date().toISOString()}] ${CLIENT}: fetched ${r.fetchedCount}, detected ${r.newItems.length} new`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(`[${new Date().toISOString()}] poll failed:`, err.message);
    process.exit(1);
  });
```

- [ ] **Step 2: Verify the one-shot entrypoint locally**

Run: `cd agent && node scripts/poll-once.mjs`
Expected: a single `fetched N, detected M new` log line, exit 0. (Real rows persist — this is the ledger.)

- [ ] **Step 3: Write the crontab (supercronic format)**

```cron
# agent/crontab — poll every 5 minutes
*/5 * * * * node /app/scripts/poll-once.mjs
```

- [ ] **Step 4: Write the Dockerfile**

```dockerfile
# agent/Dockerfile
FROM node:20-slim

# supercronic — cron that runs well in a container as PID-friendly process
ENV SUPERCRONIC_URL=https://github.com/aptible/supercronic/releases/download/v0.2.33/supercronic-linux-amd64 \
    SUPERCRONIC=supercronic-linux-amd64
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
  && curl -fsSLO "$SUPERCRONIC_URL" \
  && chmod +x "$SUPERCRONIC" && mv "$SUPERCRONIC" /usr/local/bin/supercronic \
  && apt-get purge -y curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

CMD ["supercronic", "/app/crontab"]
```

- [ ] **Step 5: Write `agent/fly.toml`**

```toml
# agent/fly.toml — Gavel poller (5-min cron via supercronic)
app = "gavel-poller"
primary_region = "ord"

[build]
  dockerfile = "Dockerfile"

[env]
  POLL_CLIENT = "milwaukee"

# Always-on single machine; supercronic fires the poll every 5 minutes.
[[vm]]
  size = "shared-cpu-1x"
  memory = "256mb"
```

- [ ] **Step 6: Set the secret and deploy**

```bash
cd agent
fly launch --no-deploy --copy-config --name gavel-poller   # if app not yet created
fly secrets set CONVEX_URL="$CONVEX_URL"
fly deploy
```
Expected: deploy succeeds; one machine running.

- [ ] **Step 7: Confirm the cron fires**

Run: `fly logs -a gavel-poller`
Expected: within ~5 min, a `fetched N, detected M new` line appears, then again ~5 min later. Paste a two-tick log excerpt into the issue.

- [ ] **Step 8: Commit**

```bash
git add agent/scripts/poll-once.mjs agent/Dockerfile agent/crontab agent/fly.toml
git commit -m "feat(poller): Fly.io 5-min cron wrapper via supercronic (MOO-41)"
```

---

## Task 8: Document commands + close the issue

**Files:**
- Modify: root `CLAUDE.md` (Conventions → commands)
- Create: `journal/2026-06-08.md` entry (append if exists)

- [ ] **Step 1: Document the poller commands in `CLAUDE.md`** under the Conventions section:

```markdown
- Poller (MOO-41): `cd agent && node scripts/poller-verify.mjs` (live verify), `node scripts/poll-once.mjs` (one cycle). Deployed as Fly app `gavel-poller` (supercronic `*/5`).
```

- [ ] **Step 2: Full suite + lint green**

Run: `cd agent && node --test && npx @biomejs/biome check .`
Expected: all tests pass, lint clean.

- [ ] **Step 3: Journal the session** to `journal/2026-06-08.md` (what shipped, decisions, the verify log, latency number, next = MOO-44).

- [ ] **Step 4: Finish the branch** (superpowers:finishing-a-development-branch) — PR or merge to `main`.

- [ ] **Step 5: Close MOO-41** (linear-build) → Done with an evidence comment: the real run log, the `IDEMPOTENT ✓` line, and the measured latency.

---

## Self-review

**Spec coverage** (against the five acceptance criteria):
- Fly.io 5-min cron → Task 7 (supercronic `*/5`).
- Queries upcoming events + agendas via Legistar OData → Tasks 2–3 (`buildEventsQuery` Final + `fetchEventItems`).
- New items via diff vs last-seen in Convex → Tasks 1, 4, 5 (`diffNewItems` + `listSeenKeys`).
- Detected items enqueue a summarize+alert job → Task 5 (`enqueueDetected` → `detectedAgendaItems` pending row; MOO-44 drains).
- Latency < 20 min → Task 6 measures `detectedAt − agendaPublishedUTC`; Task 7 proves cadence.
- Verification checklist (real run log / no duplicates / latency) → Task 6.

**Placeholder scan:** none — every code step is concrete.

**Type consistency:** the queue row shape (`client, eventItemId, eventId, matterId?, title, agendaNumber?, eventBodyName, eventDate?, agendaPublishedUTC?`) is identical across `toDetectedItem` (Task 2), the `detectedItem` Convex validator (Task 5), and the schema table (Task 5). `readSeenEventItemIds`/`listSeenKeys` both return `number[]`. `detectionKey` signature matches across diff, poll, and tests.
