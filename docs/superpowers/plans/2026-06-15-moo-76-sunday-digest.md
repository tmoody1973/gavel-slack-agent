# MOO-76 (UX-D) Sunday Digest Card + Weekly Cron — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One "📬 Your civic week" card posted per subscribed channel each Sunday — N matching items this week, how many need attention, top-3 one-liners with file links, in the channel's language — driven by a weekly cron on `gavel-poller`.

**Architecture:** A pure `digestCard(week)` builder in `agent/blockkit/` (bilingual via the MOO-43 gate; quiet-week variant so it never renders broken). A pure-ish orchestrator `agent/digest/build.js` (`buildChannelDigests`) that filters this week's detected rows per subscription with the existing `alerts/match.js`, sorts, takes top-3, enriches just those via an injected `enrich`, and assembles cards — testable with fakes. A thin cron entry `agent/scripts/digest-once.mjs` wires Convex reads + Legistar enrichment + Slack posting (`DIGEST_DRY_RUN=1` previews without posting; empty channels are skipped). One weekly line in `agent/crontab`.

**Tech Stack:** Node 22 ESM, `node --test`, Convex HTTP client, Legistar OData (`getMatter`, `getEvent`), Slack `chat.postMessage`, supercronic (`CRON_TZ`). No new deps.

**Reuses, doesn't reinvent:** `matchSubscriptions` (alerts/match.js — same committee/keyword rule the poller and App Home use), `listSubscriptions` + `listUpcoming` (Convex, already shipped for the App Home strip), the bilingual EN-section / divider / ES-section structure from `alerts/card.js`, the file-number-labelled meeting link from the alert card footer.

**Shapes (locked):**

```js
// digestCard input
{
  total: number,            // all matching items this week (N)
  needsAttention: number,   // walk-ons among them (the "needs attention" count)
  top: [                    // up to 3, already sorted+enriched
    { title, eventBodyName, eventDate, fileNumber?, legistarUrl?, walkOnFlag? }
  ],
  language: 'en' | 'es',
}
// → { text, blocks }   (text = notification fallback; same return shape as buildAlertCard)

// buildChannelDigests
buildChannelDigests({ subscriptions, upcoming, enrich, now, windowDays = 7 })
// → [{ channelId, language, total, card }]   (total === 0 entries included; the SCRIPT skips them)
```

- **Window:** items with `eventDate` in `[today, today + 7d)`. `listUpcoming(fromDate=today)` has no upper bound, so `buildChannelDigests` applies the upper bound by date-string slice.
- **Needs attention = walk-ons** (`walkOnFlag`), the established "added late" signal (MOO-51). Header drops the clause when 0.
- **Top-3 sort:** by `eventDate` ascending (soonest first), walk-ons tie-break first.
- **Enrich only the top-3** (≤3 `getMatter` + ≤3 `getEvent` per channel, weekly) — `enrich(row) → { fileNumber?, legistarUrl? }`; `legistarUrl` = the meeting's `inSiteUrl` (the shipped alert-card pattern), labelled `File #X`.
- **Empty week:** `buildChannelDigests` still returns a `total:0` entry whose `card` is the quiet-week variant (never broken); `digest-once.mjs` skips posting `total:0` channels by default (`DIGEST_POST_EMPTY=1` to override). Satisfies "designed quiet-week line OR no post" — both exist.

**Working directory:** `agent/` in `/Users/tarikmoody/Documents/Projects/gavel-slack-agent/.claude/worktrees/moo-76-ux-d`. Branch: `tarikjmoody/moo-76-ux-d-sunday-digest-card-weekly-cron`.

---

## File structure

| File | Action | Responsibility |
|---|---|---|
| `agent/blockkit/digest-card.js` | Create | pure `digestCard(week)` — bilingual, quiet-week variant |
| `agent/blockkit/index.js` | Modify | re-export `digestCard` |
| `agent/digest/build.js` | Create | `buildChannelDigests` — filter/window/top-3/enrich/assemble |
| `agent/digest/index.js` | Create | re-exports |
| `agent/scripts/digest-once.mjs` | Create | weekly cron entry (Convex + Legistar + Slack; dry-run) |
| `agent/crontab` | Modify | weekly Sunday line |
| `agent/tests/blockkit/digest-card.test.js` | Create | builder golden-shape tests |
| `agent/tests/digest/build.test.js` | Create | filtering/window/top-3/skip-empty tests |

---

### Task 1: `digestCard` builder (TDD)

**Files:** Create `agent/blockkit/digest-card.js`, `agent/tests/blockkit/digest-card.test.js`; modify `agent/blockkit/index.js`.

- [ ] **1.1 failing tests** (`tests/blockkit/digest-card.test.js`):

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { digestCard } from '../../blockkit/digest-card.js';

const top = [
  {
    title: 'Rezoning of 2000 S 13th St',
    eventBodyName: 'ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE',
    eventDate: '2026-06-18T00:00:00',
    fileNumber: '260234',
    legistarUrl: 'https://milwaukee.legistar.com/x',
    walkOnFlag: true,
  },
  { title: 'Liquor license hearing', eventBodyName: 'LICENSES COMMITTEE', eventDate: '2026-06-19T00:00:00', fileNumber: '260250' },
];

test('header carries the total and a needs-attention clause when walk-ons exist', () => {
  const { text, blocks } = digestCard({ total: 5, needsAttention: 1, top, language: 'en' });
  assert.match(text, /civic week/i);
  const all = JSON.stringify(blocks);
  assert.match(all, /5 items/);
  assert.match(all, /1 needs attention/);
});

test('drops the needs-attention clause when none', () => {
  const all = JSON.stringify(digestCard({ total: 2, needsAttention: 0, top, language: 'en' }).blocks);
  assert.ok(!all.includes('needs attention'));
});

test('renders top-3 one-liners with file links and a walk-on marker', () => {
  const all = JSON.stringify(digestCard({ total: 2, needsAttention: 1, top, language: 'en' }).blocks);
  assert.ok(all.includes('File #260234'));
  assert.ok(all.includes('milwaukee.legistar.com'));
  assert.match(all, /⚠️/); // walk-on item flagged
  assert.ok(all.includes('Rezoning of 2000 S 13th St'));
});

test('an item without a file number renders title-only without "undefined"', () => {
  const t = [{ title: 'Untitled', eventBodyName: 'X', eventDate: '2026-06-18T00:00:00' }];
  const all = JSON.stringify(digestCard({ total: 1, needsAttention: 0, top: t, language: 'en' }).blocks);
  assert.ok(all.includes('Untitled'));
  assert.ok(!all.includes('undefined'));
});

test('ES card includes a Spanish section; EN-only does not', () => {
  const es = JSON.stringify(digestCard({ total: 2, needsAttention: 1, top, language: 'es' }).blocks);
  assert.match(es, /Tu semana cívica/);
  assert.match(es, /En español/);
  const en = JSON.stringify(digestCard({ total: 2, needsAttention: 1, top, language: 'en' }).blocks);
  assert.ok(!en.includes('En español'));
});

test('has a how-to-be-heard footer and a manage-in-App-Home context line', () => {
  const all = JSON.stringify(digestCard({ total: 2, needsAttention: 0, top, language: 'en' }).blocks);
  assert.match(all, /heard/i);
  assert.match(all, /App Home/);
});

test('quiet-week variant (total 0) renders a graceful card, not a broken one', () => {
  const { text, blocks } = digestCard({ total: 0, needsAttention: 0, top: [], language: 'en' });
  assert.match(text, /quiet/i);
  assert.match(JSON.stringify(blocks), /quiet week/i);
  assert.ok(!JSON.stringify(blocks).includes('undefined'));
});
```

- [ ] **1.2** run → FAIL (module not found)

- [ ] **1.3 implement** `agent/blockkit/digest-card.js`:

```js
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function shortDate(iso) {
  const [, month, day] = iso.slice(0, 10).split('-').map(Number);
  return `${MONTHS[month - 1]} ${day}`;
}

const mrkdwn = (text) => ({ type: 'section', text: { type: 'mrkdwn', text } });

/** One top-3 line: "⚠️ *Jun 18* · <link|File #260234> — title (Committee)". */
function itemLine(item) {
  const flag = item.walkOnFlag ? '⚠️ ' : '• ';
  const fileBit = item.fileNumber
    ? item.legistarUrl
      ? `<${item.legistarUrl}|File #${item.fileNumber}>`
      : `File #${item.fileNumber}`
    : null;
  const head = [flag + `*${shortDate(item.eventDate)}*`, fileBit].filter(Boolean).join(' · ');
  return `${head} — ${item.title}`;
}

const COPY = {
  en: {
    header: '📬 Your civic week',
    summary: (total, attn) =>
      `*${total}* ${total === 1 ? 'item' : 'items'} in your subscriptions this week` +
      (attn > 0 ? ` · *${attn}* ${attn === 1 ? 'needs' : 'need'} attention` : ''),
    quiet: 'A quiet week — nothing on your subscriptions is up for a vote in the next 7 days.',
    footer: '🗣️ *How to be heard:* open a meeting’s agenda from its file link above to see when and where to comment.',
    manage: '⚙️ Manage your committees, keywords, and watches in the Gavel App Home.',
  },
  es: {
    header: '📬 Tu semana cívica',
    summary: (total, attn) =>
      `*${total}* ${total === 1 ? 'asunto' : 'asuntos'} en tus suscripciones esta semana` +
      (attn > 0 ? ` · *${attn}* ${attn === 1 ? 'requiere' : 'requieren'} atención` : ''),
    quiet: 'Una semana tranquila — nada de tus suscripciones se vota en los próximos 7 días.',
    footer: '🗣️ *Cómo participar:* abre la agenda de una reunión desde el enlace del expediente para ver cuándo y dónde comentar.',
    manage: '⚙️ Administra tus comités, palabras clave y seguimientos en el App Home de Gavel.',
  },
};

function section(copy, total, needsAttention, top, label) {
  const blocks = [];
  if (label) blocks.push(mrkdwn(`*🇪🇸 ${label}*`));
  blocks.push(mrkdwn(copy.summary(total, needsAttention)));
  if (total === 0) {
    blocks.push(mrkdwn(`_${copy.quiet}_`));
  } else {
    blocks.push(mrkdwn(top.map(itemLine).join('\n')));
  }
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: copy.footer }] });
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: copy.manage }] });
  return blocks;
}

/**
 * The Sunday Digest card (MOO-76). Bilingual when language === 'es' (EN section,
 * divider, ES section — item titles/file numbers/committees stay English, the
 * MOO-43 rule). total === 0 → graceful quiet-week variant. Pure.
 * @returns {{ text: string, blocks: object[] }}
 */
export function digestCard({ total, needsAttention, top, language = 'en' }) {
  const en = COPY.en;
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: `${en.header}`, emoji: true } },
    ...section(en, total, needsAttention, top, null),
  ];
  if (language === 'es') {
    blocks.splice(1, 0, mrkdwn(`*${COPY.es.header}*`)); // ES header hint up top (titles stay EN)
    blocks.push({ type: 'divider' }, ...section(COPY.es, total, needsAttention, top, 'En español'));
  }
  const text = total === 0 ? 'A quiet civic week — nothing up for a vote.' : `Your civic week: ${total} items in your subscriptions.`;
  return { text, blocks };
}
```

- [ ] **1.4** run → PASS; add `export { digestCard } from './digest-card.js';` to `blockkit/index.js`
- [ ] **1.5** commit `feat(blockkit): digestCard bilingual Sunday Digest builder (MOO-76)`

### Task 2: `buildChannelDigests` (TDD)

**Files:** Create `agent/digest/build.js`, `agent/digest/index.js`, `agent/tests/digest/build.test.js`.

- [ ] **2.1 failing tests** — assert: only matching items counted (via `matchSubscriptions`); 7-day window excludes events ≥7d out and before today; `needsAttention` = walk-on count among matches; `top` sorted soonest-first, ≤3, walk-on tie-break; `enrich` called only on the top-3 and its `{fileNumber,legistarUrl}` lands on the items; a `total:0` channel still returns an entry with a quiet-week `card`; each entry carries `channelId` + `language`.

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildChannelDigests } from '../../digest/build.js';

const now = '2026-06-15'; // Monday
const subscriptions = [
  { channelId: 'C1', committees: ['ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE'], keywords: ['rezoning'], language: 'es' },
  { channelId: 'C2', committees: ['LICENSES COMMITTEE'], keywords: [], language: 'en' },
];
const upcoming = [
  { eventId: 1, eventItemId: 11, eventBodyName: 'ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE', title: 'A rezoning', eventDate: '2026-06-18T00:00:00', matterId: 100, walkOnFlag: true },
  { eventId: 2, eventItemId: 12, eventBodyName: 'ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE', title: 'Another zoning item', eventDate: '2026-06-20T00:00:00', matterId: 101 },
  { eventId: 3, eventItemId: 13, eventBodyName: 'PUBLIC WORKS COMMITTEE', title: 'Paving', eventDate: '2026-06-19T00:00:00' }, // matches nobody
  { eventId: 4, eventItemId: 14, eventBodyName: 'ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE', title: 'Far-future zoning', eventDate: '2026-07-30T00:00:00', matterId: 102 }, // out of window
];
const enrich = async (row) => ({ fileNumber: `F${row.matterId ?? 'x'}`, legistarUrl: `https://leg/${row.eventId}` });

test('filters by subscription, windows to 7 days, counts + flags correctly', async () => {
  const digests = await buildChannelDigests({ subscriptions, upcoming, enrich, now });
  const c1 = digests.find((d) => d.channelId === 'C1');
  assert.equal(c1.total, 2); // the two in-window zoning items, not the far-future one or PW
  assert.equal(c1.language, 'es');
  assert.match(JSON.stringify(c1.card.blocks), /1 requiere|requiere atención/); // one walk-on
});

test('top is sorted soonest-first and enriched', async () => {
  const [c1] = await buildChannelDigests({ subscriptions, upcoming, enrich, now });
  const all = JSON.stringify(c1.card.blocks);
  assert.ok(all.indexOf('F100') < all.indexOf('F101')); // Jun 18 before Jun 20
  assert.ok(all.includes('https://leg/1'));
});

test('a channel with no matches returns a quiet-week entry (total 0)', async () => {
  const digests = await buildChannelDigests({
    subscriptions: [{ channelId: 'C9', committees: ['FIRE AND POLICE COMMISSION'], keywords: [], language: 'en' }],
    upcoming,
    enrich,
    now,
  });
  assert.equal(digests[0].total, 0);
  assert.match(JSON.stringify(digests[0].card.blocks), /quiet week/i);
});

test('enrich is called only for rendered top-3, not every match', async () => {
  let calls = 0;
  const counting = async (r) => {
    calls += 1;
    return { fileNumber: `F${r.matterId}` };
  };
  const many = Array.from({ length: 6 }, (_, i) => ({
    eventId: 10 + i, eventItemId: 20 + i, eventBodyName: 'LICENSES COMMITTEE', title: `L${i}`, eventDate: `2026-06-1${6 + (i % 3)}T00:00:00`, matterId: 200 + i,
  }));
  await buildChannelDigests({ subscriptions: [{ channelId: 'C2', committees: ['LICENSES COMMITTEE'], keywords: [], language: 'en' }], upcoming: many, enrich: counting, now });
  assert.equal(calls, 3);
});
```

- [ ] **2.2** run → FAIL

- [ ] **2.3 implement** `agent/digest/build.js`:

```js
import { matchSubscriptions } from '../alerts/match.js';
import { digestCard } from '../blockkit/index.js';

const TOP_N = 3;

function addDaysIso(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Soonest-first; walk-ons win ties so "needs attention" floats up. */
function byUrgency(a, b) {
  const da = a.eventDate.slice(0, 10);
  const db = b.eventDate.slice(0, 10);
  if (da !== db) return da < db ? -1 : 1;
  return (b.walkOnFlag ? 1 : 0) - (a.walkOnFlag ? 1 : 0);
}

/**
 * One digest per subscription. Pure over injected data + async enrich.
 * @param {{ subscriptions: object[], upcoming: object[], enrich: (row)=>Promise<{fileNumber?:string, legistarUrl?:string}>, now: string, windowDays?: number }} input
 * @returns {Promise<Array<{channelId: string, language: string, total: number, card: {text:string, blocks:object[]}}>>}
 */
export async function buildChannelDigests({ subscriptions, upcoming, enrich, now, windowDays = TOP_N === TOP_N ? 7 : 7 }) {
  const windowEnd = addDaysIso(now, windowDays);
  const inWindow = upcoming.filter((row) => {
    const d = (row.eventDate ?? '').slice(0, 10);
    return d >= now && d < windowEnd;
  });

  const digests = [];
  for (const sub of subscriptions) {
    const matches = inWindow.filter((row) => matchSubscriptions(row, [sub]).length > 0);
    const total = matches.length;
    const needsAttention = matches.filter((row) => row.walkOnFlag).length;
    const top = [...matches].sort(byUrgency).slice(0, TOP_N);
    const enriched = await Promise.all(
      top.map(async (row) => ({
        title: row.title,
        eventBodyName: row.eventBodyName,
        eventDate: row.eventDate,
        walkOnFlag: row.walkOnFlag,
        ...(await enrich(row)),
      })),
    );
    const language = sub.language ?? 'en';
    digests.push({ channelId: sub.channelId, language, total, card: digestCard({ total, needsAttention, top: enriched, language }) });
  }
  return digests;
}
```

(Clean the `windowDays` default to plain `7` when implementing — the `TOP_N === TOP_N` is a placeholder artifact; write `windowDays = 7`.)

- [ ] **2.4** run → PASS; `agent/digest/index.js`: `export { buildChannelDigests } from './build.js';`
- [ ] **2.5** commit `feat(digest): buildChannelDigests — per-channel filter/window/top-3 (MOO-76)`

### Task 3: cron script + crontab

**Files:** Create `agent/scripts/digest-once.mjs`; modify `agent/crontab`.

- [ ] **3.1 implement** `agent/scripts/digest-once.mjs` (the poll-once.mjs idiom):

```js
#!/usr/bin/env node
// Weekly Sunday Digest (MOO-76): one "Your civic week" card per subscribed
// channel. DIGEST_DRY_RUN=1 prints cards instead of posting; empty channels are
// skipped unless DIGEST_POST_EMPTY=1.
import { WebClient } from '@slack/web-api';
import { ConvexHttpClient } from 'convex/browser';
import { config } from 'dotenv';

config({ path: '.env.local' });
config();

import { api } from '../convex/_generated/api.js';
import { buildChannelDigests } from '../digest/index.js';
import { createLegistarClient } from '../poller/index.js';

const CLIENT = process.env.POLL_CLIENT || 'milwaukee';
const DRY_RUN = process.env.DIGEST_DRY_RUN === '1';
const POST_EMPTY = process.env.DIGEST_POST_EMPTY === '1';
const USER_AGENT = 'GavelCivicAgent/0.1 (+https://github.com/tmoody1973/gavel-slack-agent; contact tarik@radiomilwaukee.org)';

const url = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL;
if (!url) { console.error('CONVEX_URL missing.'); process.exit(1); }

const convex = new ConvexHttpClient(url);
const legistar = createLegistarClient({ fetch, client: CLIENT, userAgent: USER_AGENT });
const slack = new WebClient(process.env.SLACK_BOT_TOKEN || process.env.SLACK_USER_TOKEN);

const eventCache = new Map();
async function enrich(row) {
  const out = {};
  if (row.matterId) {
    try { out.fileNumber = (await legistar.getMatter(row.matterId))?.fileNumber; } catch { /* title-only */ }
  }
  if (row.eventId) {
    try {
      if (!eventCache.has(row.eventId)) eventCache.set(row.eventId, await legistar.getEvent(row.eventId));
      out.legistarUrl = eventCache.get(row.eventId)?.inSiteUrl;
    } catch { /* no link */ }
  }
  return out;
}

async function main() {
  const now = new Date().toISOString().slice(0, 10);
  const [subscriptions, upcoming] = await Promise.all([
    convex.query(api.subscriptions.listSubscriptions, { client: CLIENT }),
    convex.query(api.detectedItems.listUpcoming, { client: CLIENT, fromDate: now }),
  ]);

  const digests = await buildChannelDigests({ subscriptions, upcoming, enrich, now });
  let posted = 0;
  for (const d of digests) {
    if (d.total === 0 && !POST_EMPTY) continue;
    if (DRY_RUN) {
      console.log(`--- ${d.channelId} (${d.language}) total=${d.total} ---`);
      console.log(JSON.stringify(d.card.blocks, null, 2));
      continue;
    }
    await slack.chat.postMessage({ channel: d.channelId, text: d.card.text, blocks: d.card.blocks });
    posted += 1;
  }
  console.log(`[${new Date().toISOString()}] ${CLIENT}: ${subscriptions.length} subscriptions, ${digests.length} digests, posted ${posted}${DRY_RUN ? ' (dry-run)' : ''}`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(`[${new Date().toISOString()}] digest failed:`, err.message); process.exit(1); });
```

- [ ] **3.2** append to `agent/crontab` (supercronic honors `CRON_TZ`; Sunday 9am Central):

```
# Gavel Sunday Digest — one "Your civic week" card per subscribed channel (MOO-76).
CRON_TZ=America/Chicago 0 9 * * 0 node /app/scripts/digest-once.mjs
```

- [ ] **3.3** `node --test` green; `node -c scripts/digest-once.mjs` (syntax); commit `feat(digest): weekly cron script + Sunday crontab line (MOO-76)`

### Task 4: live verification

- [ ] **4.1** Dry-run against real data: `DIGEST_DRY_RUN=1 node scripts/digest-once.mjs` — paste the #general (ES) card JSON; confirm it only contains items matching #general's committees/keywords and shows the bilingual ES section.
- [ ] **4.2** Post one real card to the demo channel to screenshot: `node scripts/digest-once.mjs` (or a one-off to C0B8KS5VCCC) — screenshot the rendered "📬 Tu semana cívica" card; delete after if it's noise, or keep as demo state (disclose).
- [ ] **4.3** Confirm filtering negatively: pick an upcoming item in a committee #general does NOT subscribe to; show it's absent from the card.
- [ ] **4.4** Deploy `gavel-poller`: `cd agent && fly deploy --remote-only`; `fly logs -a gavel-poller` shows supercronic loaded the new crontab line. `node --test` total.
- [ ] **4.5** PR; Linear → In Review w/ evidence; merge on approval → Done.

## Self-review

Acceptance ⇄ tasks: `digestCard` pure + unit-tested (T1); cron joins gavel-poller + same Convex reads (T3); header copy + top-3 + footer + manage line (T1); subscription filtering via matchSubscriptions (T2); bilingual MOO-43 gate (T1/T2); empty-week designed variant + skip (T1 quiet variant, T3 skip). Out of scope respected: no analytics, no per-user DMs, no alert-card change. Reuses match.js, listUpcoming, footer/link pattern.
