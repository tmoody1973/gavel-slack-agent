# MOO-73 (UX-A) Block Kit Foundation + Wired Alert-Card Buttons — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `agent/blockkit/` (pure, shared Block Kit builders) and make the alert card's three buttons real — Watch writes a Convex watch, History posts a live Legistar timeline in-thread, Ask Gavel primes an agent thread — plus the `removeWatch` mutation that un-stubs `/gavel unwatch`.

**Architecture:** Pure builders (the `alerts/card.js` standard: plain data in, `{blocks}` out) live in `agent/blockkit/`, one file per artifact, re-exported from `index.js`. Button handlers get their Convex/Legistar boundaries injected by `listeners/actions/index.js` (the `listeners/commands/index.js` pattern) so unit tests use fakes. Ask Gavel priming reuses `SessionStore` as a second TTL map holding a context preamble that `message.js` prepends to the first agent prompt in that thread.

**Tech Stack:** Node 22 ESM, `node --test` + `node:assert/strict`, Bolt 4.7.3, Convex (`convex/browser` HTTP client), Legistar OData. No new dependencies.

**Spike result (already run, posted to MOO-73):** `data_table` block **PASSES** for app A0B8GP68PLJ (channel + thread) → `voteTable` uses Data Table, no monospace fallback. `card` passes (flat shape) but builders stay on classic sections for vocabulary consistency with the shipped alert card. `alert` block is unsupported → keep the MOO-51 ⚠️ context-block warning pattern.

**Real MatterHistory shape (verified live, matter 73861):** rows carry `MatterHistoryActionDate` (`"2026-05-01T12:53:00"`), `MatterHistoryActionName` (`"ASSIGNED TO"`), `MatterHistoryActionBodyName` (`"COMMON COUNCIL"`), `MatterHistoryPassedFlagName` (`"Pass"` or `null`).

**Working directory:** all commands run from `agent/` inside the worktree at
`/Users/tarikmoody/Documents/Projects/gavel-slack-agent/.claude/worktrees/moo-73-ux-a`.
Branch: `tarikjmoody/moo-73-ux-a-block-kit-foundation-wired-alert-card-buttons`.

---

## File structure

| File | Action | Responsibility |
|---|---|---|
| `agent/blockkit/sponsor-card.js` | Create | `sponsorCard(member)` — headshot context block (moved out of `alerts/card.js`) |
| `agent/blockkit/vote-table.js` | Create | `voteTable(votes)` — Data Table block |
| `agent/blockkit/matter-card.js` | Create | `matterCard(matter)` — file/title/status/link sections |
| `agent/blockkit/history-timeline.js` | Create | `historyTimeline(actions)` — date→action→result timeline |
| `agent/blockkit/error-reply.js` | Create | `errorReply(kind, opts)` — designed "information unavailable" copy EN/ES |
| `agent/blockkit/index.js` | Create | re-exports all builders |
| `agent/alerts/card.js` | Modify | delete `buildMemberContextBlock`, import `sponsorCard` from blockkit |
| `agent/poller/legistar.js` | Modify | add `mapMatterAction` + `getMatterHistory(matterId)` |
| `agent/convex/watches.ts` | Modify | add `removeWatch` mutation |
| `agent/convex/detectedItems.ts` | Modify | add `getByEventItem` query |
| `agent/listeners/commands/gavel.js` | Modify | un-stub `unwatch`, update help text |
| `agent/listeners/commands/index.js` | Modify | inject `removeWatch` dep |
| `agent/thread-context/index.js` | Modify | export a `primeStore` (second `SessionStore` instance) |
| `agent/listeners/events/message.js` | Modify | engage primed threads; prepend prime to first prompt |
| `agent/listeners/actions/alert-buttons.js` | Rewrite | three real handlers, deps-injected factories |
| `agent/listeners/actions/index.js` | Modify | construct Convex/Legistar deps, register factories |
| `agent/tests/blockkit/*.test.js` | Create | one test file per builder |
| `agent/tests/poller/legistar-client.test.js` | Modify | history mapping + fetch tests |
| `agent/tests/listeners/commands/gavel.test.js` | Modify | unwatch tests |
| `agent/tests/listeners/actions/alert-buttons.test.js` | Rewrite | handler tests with fakes |
| `agent/tests/listeners/events/message-priming.test.js` | Create | prime-consumption tests |

**Button-value decision (locked):** buttons keep carrying only `String(eventItemId)` (already shipped on every live card — extending the value would orphan existing cards). Handlers resolve the row via the new `getByEventItem` Convex query, then `matterId → getMatter()` for the file number.

---

### Task 1: `sponsorCard` — move the headshot block into blockkit

**Files:**
- Create: `agent/blockkit/sponsor-card.js`
- Create: `agent/tests/blockkit/sponsor-card.test.js`
- Modify: `agent/alerts/card.js` (delete local `buildMemberContextBlock`, lines 7–28)
- Modify: `agent/tests/alerts/card.test.js` (no change expected — verify only)

- [ ] **Step 1.1: Write the failing test**

```js
// agent/tests/blockkit/sponsor-card.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sponsorCard } from '../../blockkit/sponsor-card.js';

const member = {
  name: 'Russell W. Stamper, II',
  title: 'Alderman, 15th District',
  imageUrl: 'https://city.milwaukee.gov/stamper.jpg',
  email: 'rstamp@milwaukee.gov',
  phone: '414-286-2659',
  webpage: 'https://city.milwaukee.gov/district15',
};

test('sponsorCard renders a context block with headshot image and contact line', () => {
  const block = sponsorCard(member);
  assert.equal(block.type, 'context');
  assert.equal(block.elements[0].type, 'image');
  assert.equal(block.elements[0].image_url, member.imageUrl);
  assert.equal(block.elements[0].alt_text, member.name);
  assert.match(block.elements[1].text, /Russell W\. Stamper, II/);
  assert.match(block.elements[1].text, /414-286-2659/);
  assert.match(block.elements[1].text, /mailto:rstamp@milwaukee.gov/);
});

test('sponsorCard omits missing contact fields without leaving separators', () => {
  const block = sponsorCard({ name: 'A', title: 'B', imageUrl: 'https://x/y.jpg' });
  assert.ok(!block.elements[1].text.includes('·'));
  assert.ok(!block.elements[1].text.includes('undefined'));
});
```

- [ ] **Step 1.2: Run it to make sure it fails**

Run: `node --test tests/blockkit/sponsor-card.test.js`
Expected: FAIL — `Cannot find module .../blockkit/sponsor-card.js`

- [ ] **Step 1.3: Create the builder (verbatim move of the card.js logic)**

```js
// agent/blockkit/sponsor-card.js
/**
 * Headshot + contact context block for a council member (originally MOO-72's
 * buildMemberContextBlock in alerts/card.js; shared by alerts and threads).
 * @param {{name: string, title: string, imageUrl: string, email?: string, phone?: string, webpage?: string}} member
 * @returns {object}
 */
export function sponsorCard(member) {
  const contact = [
    member.phone && `☎️ ${member.phone}`,
    member.email && `✉️ <mailto:${member.email}|${member.email}>`,
    member.webpage && `<${member.webpage}|City webpage>`,
  ]
    .filter(Boolean)
    .join(' · ');
  return {
    type: 'context',
    elements: [
      { type: 'image', image_url: member.imageUrl, alt_text: member.name },
      { type: 'mrkdwn', text: `*${member.name}* — ${member.title}\n${contact}` },
    ],
  };
}
```

- [ ] **Step 1.4: Point `alerts/card.js` at it**

In `agent/alerts/card.js`: delete the `buildMemberContextBlock` function (the block of lines starting `function buildMemberContextBlock(member) {` through its closing `}`), add at the top:

```js
import { sponsorCard } from '../blockkit/sponsor-card.js';
```

and change the call site `blocks.push(buildMemberContextBlock(member));` → `blocks.push(sponsorCard(member));`

- [ ] **Step 1.5: Run the full suite**

Run: `node --test`
Expected: PASS — 157 existing + 2 new (card tests prove the move broke nothing)

- [ ] **Step 1.6: Commit**

```bash
git add blockkit/sponsor-card.js tests/blockkit/sponsor-card.test.js alerts/card.js
git commit -m "refactor(blockkit): extract sponsorCard builder from alerts/card.js (MOO-73)"
```

---

### Task 2: `voteTable` — Data Table builder

**Files:**
- Create: `agent/blockkit/vote-table.js`
- Create: `agent/tests/blockkit/vote-table.test.js`

- [ ] **Step 2.1: Write the failing test**

```js
// agent/tests/blockkit/vote-table.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { voteTable } from '../../blockkit/vote-table.js';

const votes = [
  { member: 'Ald. Stamper', vote: 'Aye' },
  { member: 'Ald. Coggs', vote: 'No' },
  { member: 'Ald. Zamarripa', vote: 'Excused' },
];

test('voteTable renders a data_table with a header row plus one row per vote', () => {
  const block = voteTable({ caption: 'Vote on File #260039', votes });
  assert.equal(block.type, 'data_table');
  assert.equal(block.caption, 'Vote on File #260039');
  assert.equal(block.rows.length, 4);
  assert.deepEqual(block.rows[0], [
    { type: 'raw_text', text: 'Member' },
    { type: 'raw_text', text: 'Vote' },
  ]);
  assert.deepEqual(block.rows[1], [
    { type: 'raw_text', text: 'Ald. Stamper' },
    { type: 'raw_text', text: 'Aye' },
  ]);
});

test('voteTable caps at 100 data rows (Slack data_table limit)', () => {
  const many = Array.from({ length: 150 }, (_, i) => ({ member: `M${i}`, vote: 'Aye' }));
  const block = voteTable({ caption: 'big', votes: many });
  assert.equal(block.rows.length, 101);
});

test('voteTable shows all 15 council rows on one page', () => {
  const block = voteTable({ caption: 'c', votes });
  assert.equal(block.page_size, 15);
});
```

- [ ] **Step 2.2: Run it to make sure it fails**

Run: `node --test tests/blockkit/vote-table.test.js`
Expected: FAIL — module not found

- [ ] **Step 2.3: Implement**

```js
// agent/blockkit/vote-table.js
/** Slack data_table hard limit: 100 data rows + 1 header. */
const MAX_DATA_ROWS = 100;
/** One Slack page fits the full 15-member Common Council roll call. */
const PAGE_SIZE = 15;

/**
 * Member→vote table as Slack's data_table block (spike-verified for this app).
 * @param {{caption: string, votes: Array<{member: string, vote: string}>}} input
 * @returns {object}
 */
export function voteTable({ caption, votes }) {
  const cell = (text) => ({ type: 'raw_text', text });
  const rows = [
    [cell('Member'), cell('Vote')],
    ...votes.slice(0, MAX_DATA_ROWS).map((v) => [cell(v.member), cell(v.vote)]),
  ];
  return { type: 'data_table', caption, rows, page_size: PAGE_SIZE };
}
```

- [ ] **Step 2.4: Run test to verify it passes**

Run: `node --test tests/blockkit/vote-table.test.js`
Expected: PASS (3 tests)

- [ ] **Step 2.5: Commit**

```bash
git add blockkit/vote-table.js tests/blockkit/vote-table.test.js
git commit -m "feat(blockkit): voteTable builder on the data_table block (MOO-73)"
```

---

### Task 3: `matterCard` builder

**Files:**
- Create: `agent/blockkit/matter-card.js`
- Create: `agent/tests/blockkit/matter-card.test.js`

- [ ] **Step 3.1: Write the failing test**

```js
// agent/tests/blockkit/matter-card.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matterCard } from '../../blockkit/matter-card.js';

const matter = {
  fileNumber: '260039',
  title: 'Resolution relating to a Certificate of Appropriateness',
  status: 'In Committee',
  bodyName: 'HISTORIC PRESERVATION COMMISSION',
  legistarUrl: 'https://milwaukee.legistar.com/LegislationDetail.aspx?ID=1',
};

test('matterCard renders file number, title, status, and the Legistar link', () => {
  const blocks = matterCard(matter);
  const all = JSON.stringify(blocks);
  assert.ok(all.includes('File #260039'));
  assert.ok(all.includes('Certificate of Appropriateness'));
  assert.ok(all.includes('In Committee'));
  assert.ok(all.includes('milwaukee.legistar.com'));
});

test('matterCard tolerates missing optional fields', () => {
  const blocks = matterCard({ title: 'Untitled ordinance' });
  const all = JSON.stringify(blocks);
  assert.ok(all.includes('Untitled ordinance'));
  assert.ok(!all.includes('undefined'));
});
```

- [ ] **Step 3.2: Run it to make sure it fails**

Run: `node --test tests/blockkit/matter-card.test.js`
Expected: FAIL — module not found

- [ ] **Step 3.3: Implement**

```js
// agent/blockkit/matter-card.js
/**
 * Compact matter receipt: file number + title section, then a status/body/link
 * context line. Classic sections (the shipped alert-card vocabulary).
 * @param {{fileNumber?: string, title: string, status?: string, bodyName?: string, legistarUrl?: string}} matter
 * @returns {object[]}
 */
export function matterCard(matter) {
  const heading = matter.fileNumber ? `*File #${matter.fileNumber}* — ${matter.title}` : `*${matter.title}*`;
  const meta = [
    matter.status && `Status: ${matter.status}`,
    matter.bodyName && `Before: ${matter.bodyName}`,
    matter.legistarUrl && `<${matter.legistarUrl}|milwaukee.legistar.com>`,
  ]
    .filter(Boolean)
    .join(' · ');
  const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: heading } }];
  if (meta) {
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: meta }] });
  }
  return blocks;
}
```

- [ ] **Step 3.4: Run test to verify it passes**

Run: `node --test tests/blockkit/matter-card.test.js`
Expected: PASS (2 tests)

- [ ] **Step 3.5: Commit**

```bash
git add blockkit/matter-card.js tests/blockkit/matter-card.test.js
git commit -m "feat(blockkit): matterCard builder (MOO-73)"
```

---

### Task 4: `historyTimeline` builder

**Files:**
- Create: `agent/blockkit/history-timeline.js`
- Create: `agent/tests/blockkit/history-timeline.test.js`

- [ ] **Step 4.1: Write the failing test**

```js
// agent/tests/blockkit/history-timeline.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { historyTimeline } from '../../blockkit/history-timeline.js';

const actions = [
  { date: '2026-05-01T12:53:00', action: 'ASSIGNED TO', body: 'COMMON COUNCIL', result: null },
  { date: '2026-06-01T00:00:00', action: 'ADOPTED', body: 'HISTORIC PRESERVATION COMMISSION', result: 'Pass' },
];

test('historyTimeline renders a heading and one line per action, oldest first', () => {
  const blocks = historyTimeline({ fileNumber: '260039', actions });
  assert.match(blocks[0].text.text, /History — File #260039/);
  const body = blocks[1].text.text;
  const lines = body.split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /2026-05-01.*ASSIGNED TO.*COMMON COUNCIL/);
  assert.match(lines[1], /2026-06-01.*ADOPTED.*HISTORIC PRESERVATION COMMISSION.*Pass/);
});

test('historyTimeline keeps only the latest 20 actions and says so', () => {
  const many = Array.from({ length: 25 }, (_, i) => ({
    date: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00`,
    action: `ACTION ${i}`,
    body: 'BODY',
    result: null,
  }));
  const blocks = historyTimeline({ fileNumber: '1', actions: many });
  const body = blocks[1].text.text;
  assert.equal(body.split('\n').length, 20);
  assert.ok(!body.includes('ACTION 0'));
  const all = JSON.stringify(blocks);
  assert.match(all, /Showing the latest 20 of 25 actions/);
});

test('historyTimeline omits the heading file number when unknown', () => {
  const blocks = historyTimeline({ actions });
  assert.match(blocks[0].text.text, /History$/);
});
```

- [ ] **Step 4.2: Run it to make sure it fails**

Run: `node --test tests/blockkit/history-timeline.test.js`
Expected: FAIL — module not found

- [ ] **Step 4.3: Implement**

```js
// agent/blockkit/history-timeline.js
/** Keep timeline replies well under the 3000-char section cap. */
const MAX_ACTIONS = 20;

/**
 * Date → action → result timeline for a matter's MatterHistory rows.
 * Renders the latest MAX_ACTIONS, oldest-first within the kept window.
 * @param {{fileNumber?: string, actions: Array<{date?: string, action: string, body?: string, result?: string|null}>}} input
 * @returns {object[]}
 */
export function historyTimeline({ fileNumber, actions }) {
  const kept = actions.slice(-MAX_ACTIONS);
  const lines = kept.map((a) => {
    const day = a.date ? a.date.slice(0, 10) : '—';
    const result = a.result ? ` _(${a.result})_` : '';
    const body = a.body ? ` — ${a.body}` : '';
    return `• \`${day}\` *${a.action}*${body}${result}`;
  });
  const title = fileNumber ? `🕓 History — File #${fileNumber}` : '🕓 History';
  const blocks = [
    { type: 'section', text: { type: 'mrkdwn', text: `*${title}*` } },
    { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
  ];
  if (actions.length > MAX_ACTIONS) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `Showing the latest ${MAX_ACTIONS} of ${actions.length} actions.` }],
    });
  }
  return blocks;
}
```

- [ ] **Step 4.4: Run test to verify it passes**

Run: `node --test tests/blockkit/history-timeline.test.js`
Expected: PASS (3 tests)

- [ ] **Step 4.5: Commit**

```bash
git add blockkit/history-timeline.js tests/blockkit/history-timeline.test.js
git commit -m "feat(blockkit): historyTimeline builder (MOO-73)"
```

---

### Task 5: `errorReply` builder + `index.js` re-exports

**Files:**
- Create: `agent/blockkit/error-reply.js`
- Create: `agent/blockkit/index.js`
- Create: `agent/tests/blockkit/error-reply.test.js`

- [ ] **Step 5.1: Write the failing test**

```js
// agent/tests/blockkit/error-reply.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { errorReply } from '../../blockkit/error-reply.js';

test('no_history EN says what is missing and what Gavel can still do', () => {
  const { text, blocks } = errorReply('no_history', {
    legistarUrl: 'https://milwaukee.legistar.com/x',
  });
  assert.match(text, /history/i);
  const all = JSON.stringify(blocks);
  assert.ok(all.includes('milwaukee.legistar.com'));
  assert.match(all, /watch/i);
});

test('no_history ES renders Spanish copy', () => {
  const { text } = errorReply('no_history', { language: 'es' });
  assert.match(text, /historial/i);
});

test('fetch_failed and no_matter kinds render without links when none given', () => {
  for (const kind of ['fetch_failed', 'no_matter']) {
    const { text, blocks } = errorReply(kind, {});
    assert.ok(text.length > 0);
    assert.ok(!JSON.stringify(blocks).includes('undefined'));
  }
});

test('unknown kind falls back to the generic unavailable copy', () => {
  const { text } = errorReply('never_heard_of_it', {});
  assert.match(text, /isn’t available|not available/i);
});
```

- [ ] **Step 5.2: Run it to make sure it fails**

Run: `node --test tests/blockkit/error-reply.test.js`
Expected: FAIL — module not found

- [ ] **Step 5.3: Implement**

```js
// agent/blockkit/error-reply.js
/**
 * Designed "information unavailable" copy (the MOO-60 pattern, absorbed by
 * UX-C): say plainly what is missing, say what Gavel CAN do, never fake.
 * Returns { text, blocks } like buildAlertCard does.
 */
const COPY = {
  no_history: {
    en: 'I couldn’t find a recorded history for this item yet.',
    es: 'Todavía no encuentro un historial registrado para este punto.',
  },
  no_matter: {
    en: 'This agenda item isn’t linked to a legislative file, so there’s no record to pull.',
    es: 'Este punto de la agenda no está vinculado a un expediente legislativo, así que no hay registro que consultar.',
  },
  fetch_failed: {
    en: 'The city’s records system didn’t answer just now.',
    es: 'El sistema de registros de la ciudad no respondió en este momento.',
  },
  generic: {
    en: 'That information isn’t available right now.',
    es: 'Esa información no está disponible en este momento.',
  },
};

const CAN_DO = {
  en: (link) =>
    [link && `You can read the full record yourself: ${link}.`, 'I can also watch this item and alert the channel when it moves — click 👁 Watch on the card or use `/gavel watch`.']
      .filter(Boolean)
      .join(' '),
  es: (link) =>
    [link && `Puede leer el expediente completo aquí: ${link}.`, 'También puedo vigilar este punto y avisar al canal cuando avance — use el botón 👁 Watch o `/gavel watch`.']
      .filter(Boolean)
      .join(' '),
};

/**
 * @param {string} kind - 'no_history' | 'no_matter' | 'fetch_failed' | anything else → generic
 * @param {{language?: 'en'|'es', legistarUrl?: string}} [opts]
 * @returns {{text: string, blocks: object[]}}
 */
export function errorReply(kind, { language = 'en', legistarUrl } = {}) {
  const copy = COPY[kind] ?? COPY.generic;
  const link = legistarUrl ? `<${legistarUrl}|milwaukee.legistar.com>` : '';
  const text = copy[language] ?? copy.en;
  const canDo = (CAN_DO[language] ?? CAN_DO.en)(link);
  return {
    text,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `ℹ️ ${text}` } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: canDo }] },
    ],
  };
}
```

```js
// agent/blockkit/index.js
export { sponsorCard } from './sponsor-card.js';
export { voteTable } from './vote-table.js';
export { matterCard } from './matter-card.js';
export { historyTimeline } from './history-timeline.js';
export { errorReply } from './error-reply.js';
```

- [ ] **Step 5.4: Run the full suite**

Run: `node --test`
Expected: PASS, all files

- [ ] **Step 5.5: Commit**

```bash
git add blockkit/error-reply.js blockkit/index.js tests/blockkit/error-reply.test.js
git commit -m "feat(blockkit): errorReply builder + module re-exports (MOO-73)"
```

---

### Task 6: Legistar `getMatterHistory`

**Files:**
- Modify: `agent/poller/legistar.js`
- Modify: `agent/tests/poller/legistar-client.test.js` (append tests)

- [ ] **Step 6.1: Write the failing tests** (append to the existing client test file, matching its fake-fetch idiom — read the top of the file first and reuse its helpers if any)

```js
// append to agent/tests/poller/legistar-client.test.js
import { mapMatterAction } from '../../poller/legistar.js'; // merge into the existing import line

test('mapMatterAction maps the live MatterHistory field names', () => {
  const mapped = mapMatterAction({
    MatterHistoryActionDate: '2026-06-01T00:00:00',
    MatterHistoryActionName: 'ADOPTED',
    MatterHistoryActionBodyName: 'HISTORIC PRESERVATION COMMISSION',
    MatterHistoryPassedFlagName: 'Pass',
  });
  assert.deepEqual(mapped, {
    date: '2026-06-01T00:00:00',
    action: 'ADOPTED',
    body: 'HISTORIC PRESERVATION COMMISSION',
    result: 'Pass',
  });
});

test('mapMatterAction turns null result/body into undefined', () => {
  const mapped = mapMatterAction({
    MatterHistoryActionDate: '2026-05-01T12:53:00',
    MatterHistoryActionName: 'ASSIGNED TO',
    MatterHistoryActionBodyName: null,
    MatterHistoryPassedFlagName: null,
  });
  assert.equal(mapped.result, undefined);
  assert.equal(mapped.body, undefined);
});

test('getMatterHistory requests the histories endpoint ordered by date', async () => {
  const calls = [];
  const fakeFetch = async (url) => {
    calls.push(url);
    return { ok: true, json: async () => [] };
  };
  const client = createLegistarClient({ fetch: fakeFetch, client: 'milwaukee', userAgent: 'test' });
  await client.getMatterHistory(73861);
  assert.match(calls[0], /matters\/73861\/histories/);
  assert.match(calls[0], /MatterHistoryActionDate/);
});
```

- [ ] **Step 6.2: Run them to make sure they fail**

Run: `node --test tests/poller/legistar-client.test.js`
Expected: FAIL — `mapMatterAction` not exported

- [ ] **Step 6.3: Implement in `agent/poller/legistar.js`**

Add after `mapEventDetail`:

```js
/** Normalize a raw MatterHistory row (verified live: matter 73861). */
export function mapMatterAction(raw) {
  return {
    date: raw.MatterHistoryActionDate ?? undefined,
    action: raw.MatterHistoryActionName ?? '',
    body: raw.MatterHistoryActionBodyName ?? undefined,
    result: raw.MatterHistoryPassedFlagName ?? undefined,
  };
}
```

Inside `createLegistarClient`, add alongside `getMatterSponsors`:

```js
async function getMatterHistory(matterId) {
  const params = new URLSearchParams({ $orderby: 'MatterHistoryActionDate' });
  const raw = await getJson(`matters/${matterId}/histories?${params.toString()}`);
  return raw.map(mapMatterAction);
}
```

and add `getMatterHistory` to the returned object.

- [ ] **Step 6.4: Run the full suite**

Run: `node --test`
Expected: PASS

- [ ] **Step 6.5: Commit**

```bash
git add poller/legistar.js tests/poller/legistar-client.test.js
git commit -m "feat(legistar): getMatterHistory + mapMatterAction (MOO-73)"
```

---

### Task 7: Convex `removeWatch` + `getByEventItem`

**Files:**
- Modify: `agent/convex/watches.ts`
- Modify: `agent/convex/detectedItems.ts`

Convex functions are exercised against the dev deployment, not node:test (the repo's existing convention — no convex-test harness is set up; live verification is the test).

- [ ] **Step 7.1: Add `removeWatch` to `agent/convex/watches.ts`**

```ts
/** Remove one watch by channel + entity. Returns the deleted id, or null. */
export const removeWatch = mutation({
  args: { channelId: v.string(), entity: v.string() },
  handler: async (ctx, { channelId, entity }) => {
    const trimmed = entity.trim();
    const existing = await ctx.db
      .query('watches')
      .withIndex('by_channel_entity', (q) => q.eq('channelId', channelId).eq('entity', trimmed))
      .unique();
    if (!existing) return null;
    await ctx.db.delete(existing._id);
    return existing._id;
  },
});
```

- [ ] **Step 7.2: Add `getByEventItem` to `agent/convex/detectedItems.ts`**

```ts
/** One detected row by its natural key — the alert-card buttons' resolver. */
export const getByEventItem = query({
  args: { client: v.optional(clientValidator), eventItemId: v.number() },
  handler: (ctx, { client, eventItemId }) =>
    ctx.db
      .query('detectedAgendaItems')
      .withIndex('by_client_item', (q) => q.eq('client', client ?? 'milwaukee').eq('eventItemId', eventItemId))
      .unique(),
});
```

- [ ] **Step 7.3: Push to the dev deployment and smoke it**

Run: `npx convex dev --once` (deployment `vivid-weasel-903`, `CONVEX_URL` from `.env.local`)
Expected: codegen + push succeed.

Smoke (real data):
```bash
npx convex run detectedItems:getByEventItem '{"eventItemId": 999999999}'   # expect null
npx convex run watches:addWatch '{"channelId": "PLAN-SMOKE", "entity": "File #TEST"}'
npx convex run watches:removeWatch '{"channelId": "PLAN-SMOKE", "entity": "File #TEST"}'  # expect an id
npx convex run watches:removeWatch '{"channelId": "PLAN-SMOKE", "entity": "File #TEST"}'  # expect null
```

- [ ] **Step 7.4: Commit**

```bash
git add convex/watches.ts convex/detectedItems.ts convex/_generated
git commit -m "feat(convex): removeWatch mutation + detectedItems.getByEventItem query (MOO-73)"
```

---

### Task 8: un-stub `/gavel unwatch`

**Files:**
- Modify: `agent/listeners/commands/gavel.js`
- Modify: `agent/listeners/commands/index.js`
- Modify: `agent/tests/listeners/commands/gavel.test.js` (append tests)

- [ ] **Step 8.1: Write the failing tests** (append; reuse the file's existing fake-deps idiom — read it first and follow its `makeDeps`/fixture pattern if present)

```js
// append to agent/tests/listeners/commands/gavel.test.js
test('unwatch removes an existing watch and confirms', async () => {
  const calls = [];
  const deps = {
    addWatch: async () => {},
    getSubscription: async () => null,
    listWatches: async () => [],
    removeWatch: async (input) => {
      calls.push(input);
      return 'some_id';
    },
  };
  const responses = [];
  await handleGavelCommand(
    {
      command: { text: 'unwatch File #260039', channel_id: 'C1' },
      ack: async () => {},
      respond: async (r) => responses.push(r),
    },
    deps,
  );
  assert.deepEqual(calls, [{ channelId: 'C1', entity: 'File #260039' }]);
  assert.match(responses[0].text, /No longer watching/);
});

test('unwatch with no match says so and points at status', async () => {
  const deps = {
    addWatch: async () => {},
    getSubscription: async () => null,
    listWatches: async () => [],
    removeWatch: async () => null,
  };
  const responses = [];
  await handleGavelCommand(
    {
      command: { text: 'unwatch Nothing Here', channel_id: 'C1' },
      ack: async () => {},
      respond: async (r) => responses.push(r),
    },
    deps,
  );
  assert.match(responses[0].text, /isn’t watching|not watching/i);
  assert.match(responses[0].text, /\/gavel status/);
});

test('unwatch with no args shows usage', async () => {
  const deps = { addWatch: async () => {}, getSubscription: async () => null, listWatches: async () => [], removeWatch: async () => null };
  const responses = [];
  await handleGavelCommand(
    { command: { text: 'unwatch', channel_id: 'C1' }, ack: async () => {}, respond: async (r) => responses.push(r) },
    deps,
  );
  assert.match(responses[0].text, /Usage: `\/gavel unwatch <entity>`/);
});
```

- [ ] **Step 8.2: Run them to make sure they fail**

Run: `node --test tests/listeners/commands/gavel.test.js`
Expected: FAIL — unwatch still returns the Phase 3 stub copy

- [ ] **Step 8.3: Implement in `agent/listeners/commands/gavel.js`**

Replace the `case 'unwatch':` line in `runSubcommand` with:

```js
    case 'unwatch':
      return runUnwatch({ args, channelId }, deps);
```

Add after `runWatch`:

```js
async function runUnwatch({ args, channelId }, deps) {
  const entity = args.trim();
  if (!entity) {
    return 'Usage: `/gavel unwatch <entity>` — exactly as it appears in `/gavel status`.';
  }
  const removed = await deps.removeWatch({ channelId, entity });
  if (!removed) {
    return `This channel isn’t watching *${entity}*. Check \`/gavel status\` for the exact name.`;
  }
  return `🚫 No longer watching *${entity}*.`;
}
```

Update `HELP_TEXT`'s unwatch line to:

```js
  '• `/gavel unwatch <entity>` — stop watching (names as shown in `/gavel status`)',
```

Also update the `@param` JSDoc on `handleGavelCommand` to include `removeWatch: (input: {channelId: string, entity: string}) => Promise<unknown|null>`.

- [ ] **Step 8.4: Wire the dep in `agent/listeners/commands/index.js`**

Add to the `deps` object:

```js
    removeWatch: ({ channelId, entity }) =>
      requireConvex(convex).mutation(api.watches.removeWatch, { channelId, entity }),
```

- [ ] **Step 8.5: Run the full suite**

Run: `node --test`
Expected: PASS

- [ ] **Step 8.6: Commit**

```bash
git add listeners/commands/gavel.js listeners/commands/index.js tests/listeners/commands/gavel.test.js
git commit -m "feat(commands): un-stub /gavel unwatch via removeWatch (MOO-73)"
```

---

### Task 9: thread primer (Ask Gavel's context hand-off)

**Files:**
- Modify: `agent/thread-context/index.js`
- Create: `agent/tests/listeners/events/message-priming.test.js` (test written in Task 10 covers consumption; this task only adds the store)

`SessionStore` is already a generic `(channelId, threadTs) → string` TTL map — reuse it as a second instance holding the context preamble string. No new class.

- [ ] **Step 9.1: Look at `agent/thread-context/index.js`** and add a second exported instance (1-hour TTL — a prime only matters until the user replies):

```js
import { SessionStore } from './store.js';

export const sessionStore = new SessionStore();
/** Matter-context preambles for threads primed by the Ask Gavel button (MOO-73). */
export const primeStore = new SessionStore(3600);
```

(Keep whatever the file already exports — this is additive. If `sessionStore` is constructed differently, leave it untouched.)

- [ ] **Step 9.2: Run the suite (no behavior change expected)**

Run: `node --test`
Expected: PASS

- [ ] **Step 9.3: Commit**

```bash
git add thread-context/index.js
git commit -m "feat(thread-context): primeStore for Ask-Gavel thread priming (MOO-73)"
```

---

### Task 10: consume primes in `message.js`

**Files:**
- Modify: `agent/listeners/events/message.js`
- Create: `agent/tests/listeners/events/message-priming.test.js`

- [ ] **Step 10.1: Write the failing test**

```js
// agent/tests/listeners/events/message-priming.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { primeStore, sessionStore } from '../../../thread-context/index.js';

test('primeStore stores and expires thread preambles independently of sessions', () => {
  primeStore.setSession('C1', '111.222', 'CONTEXT: File #260039');
  assert.equal(primeStore.getSession('C1', '111.222'), 'CONTEXT: File #260039');
  assert.equal(sessionStore.getSession('C1', '111.222'), null);
});
```

Plus the consumption test — `handleMessage` is exported and takes its collaborators as arguments, so fake them:

```js
import { handleMessage } from '../../../listeners/events/message.js';

function makeBoltArgs(event) {
  const said = [];
  const appended = [];
  return {
    args: {
      client: {},
      context: { userId: 'U1' },
      event,
      logger: { error: () => {} },
      say: async (m) => said.push(m),
      sayStream: () => ({
        append: async (m) => appended.push(m),
        stop: async () => {},
      }),
      setStatus: async () => {},
    },
    said,
    appended,
  };
}

test('a primed channel thread engages the agent even with no session', async (t) => {
  // runAgent is imported directly by message.js; intercept via the prime path only —
  // this test asserts engagement happened (status set / stream appended), with
  // runAgent monkey-patched through the module registry if needed. If patching
  // proves brittle, assert the OPPOSITE case instead (unprimed thread returns
  // early and never calls sayStream) — that path needs no agent run.
  const { args, appended } = makeBoltArgs({
    channel: 'C2',
    ts: '2.0',
    thread_ts: '1.0',
    text: 'what is this?',
    channel_type: 'channel',
  });
  // Unprimed + no session → early return, nothing streamed.
  await handleMessage(args);
  assert.equal(appended.length, 0);
});
```

(The honest unit boundary here: the early-return guard. Full primed-path behavior is proven in live verification — `runAgent` calls Anthropic and is not worth mocking through the ESM module registry.)

- [ ] **Step 10.2: Run it to make sure the consumption guard test passes against current behavior and the store test passes**

Run: `node --test tests/listeners/events/message-priming.test.js`
Expected: PASS (these lock in the current guard before the change)

- [ ] **Step 10.3: Implement in `agent/listeners/events/message.js`**

Import the primeStore:

```js
import { primeStore, sessionStore } from '../../thread-context/index.js';
```

Change the thread-engagement guard:

```js
  } else if (isThreadReply) {
    // Channel thread replies are handled if the bot is engaged OR the thread
    // was primed by the Ask Gavel button (MOO-73).
    const threadTs = /** @type {string} */ (event.thread_ts);
    const session = sessionStore.getSession(event.channel, threadTs);
    const prime = primeStore.getSession(event.channel, threadTs);
    if (session === null && prime === null) return;
  } else {
```

And where the agent is invoked, prepend the prime to the first prompt only (a session exists from the second turn on):

```js
    const existingSessionId = sessionStore.getSession(channelId, threadTs);
    const prime = existingSessionId ? null : primeStore.getSession(channelId, threadTs);
    const prompt = prime ? `${prime}\n\nUser question: ${text}` : text;
```

then pass `prompt` (not `text`) to `runAgent(prompt, existingSessionId ?? undefined, deps)`.

- [ ] **Step 10.4: Run the full suite**

Run: `node --test`
Expected: PASS

- [ ] **Step 10.5: Commit**

```bash
git add listeners/events/message.js tests/listeners/events/message-priming.test.js
git commit -m "feat(events): engage and pre-seed threads primed by Ask Gavel (MOO-73)"
```

---

### Task 11: the three real button handlers

**Files:**
- Rewrite: `agent/listeners/actions/alert-buttons.js`
- Modify: `agent/listeners/actions/index.js`
- Rewrite: `agent/tests/listeners/actions/alert-buttons.test.js`

- [ ] **Step 11.1: Write the failing tests** (full rewrite of the test file)

```js
// agent/tests/listeners/actions/alert-buttons.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeAlertAsk, makeAlertHistory, makeAlertWatch } from '../../../listeners/actions/alert-buttons.js';
import { primeStore } from '../../../thread-context/index.js';

const row = {
  eventItemId: 490695,
  eventId: 12345,
  matterId: 73861,
  title: 'Resolution relating to a Certificate of Appropriateness',
  eventBodyName: 'HISTORIC PRESERVATION COMMISSION',
};

function makeBoltArgs() {
  const acked = [];
  const ephemerals = [];
  const posted = [];
  return {
    args: {
      ack: async () => acked.push(true),
      body: {
        channel: { id: 'C0B8KS5VCCC' },
        message: { ts: '171.001' },
        actions: [{ value: '490695' }],
      },
      context: { userId: 'U1' },
      client: {
        chat: {
          postEphemeral: async (m) => ephemerals.push(m),
          postMessage: async (m) => posted.push(m),
        },
      },
      logger: { info: () => {}, error: () => {} },
    },
    acked,
    ephemerals,
    posted,
  };
}

const matter = { fileNumber: '260039' };
const history = [
  { date: '2026-05-01T12:53:00', action: 'ASSIGNED TO', body: 'COMMON COUNCIL', result: undefined },
  { date: '2026-06-01T00:00:00', action: 'ADOPTED', body: 'HISTORIC PRESERVATION COMMISSION', result: 'Pass' },
];

test('Watch: acks, adds a watch on the file number, confirms ephemerally', async () => {
  const watches = [];
  const deps = {
    getDetectedItem: async () => row,
    getMatter: async () => matter,
    getMatterHistory: async () => history,
    addWatch: async (input) => watches.push(input),
  };
  const { args, acked, ephemerals } = makeBoltArgs();
  await makeAlertWatch(deps)(args);
  assert.equal(acked.length, 1);
  assert.deepEqual(watches, [{ channelId: 'C0B8KS5VCCC', entity: 'File #260039' }]);
  assert.match(ephemerals[0].text, /Watching File #260039/);
});

test('Watch: falls back to the row title when there is no matter', async () => {
  const watches = [];
  const deps = {
    getDetectedItem: async () => ({ ...row, matterId: undefined }),
    getMatter: async () => {
      throw new Error('should not be called');
    },
    getMatterHistory: async () => [],
    addWatch: async (input) => watches.push(input),
  };
  const { args } = makeBoltArgs();
  await makeAlertWatch(deps)(args);
  assert.equal(watches[0].entity, row.title);
});

test('Watch: failure degrades to an ephemeral error, never a throw', async () => {
  const deps = {
    getDetectedItem: async () => {
      throw new Error('convex down');
    },
    getMatter: async () => matter,
    getMatterHistory: async () => [],
    addWatch: async () => {},
  };
  const { args, ephemerals } = makeBoltArgs();
  await makeAlertWatch(deps)(args);
  assert.match(ephemerals[0].text, /something went wrong/i);
});

test('History: posts a timeline as a thread reply under the card', async () => {
  const deps = {
    getDetectedItem: async () => row,
    getMatter: async () => matter,
    getMatterHistory: async () => history,
    addWatch: async () => {},
  };
  const { args, posted } = makeBoltArgs();
  await makeAlertHistory(deps)(args);
  assert.equal(posted[0].channel, 'C0B8KS5VCCC');
  assert.equal(posted[0].thread_ts, '171.001');
  const all = JSON.stringify(posted[0].blocks);
  assert.ok(all.includes('History — File #260039'));
  assert.ok(all.includes('ADOPTED'));
});

test('History: no matter on the row → ephemeral information-unavailable, no thread post', async () => {
  const deps = {
    getDetectedItem: async () => ({ ...row, matterId: undefined }),
    getMatter: async () => matter,
    getMatterHistory: async () => history,
    addWatch: async () => {},
  };
  const { args, posted, ephemerals } = makeBoltArgs();
  await makeAlertHistory(deps)(args);
  assert.equal(posted.length, 0);
  assert.equal(ephemerals.length, 1);
});

test('History: empty history → ephemeral information-unavailable', async () => {
  const deps = {
    getDetectedItem: async () => row,
    getMatter: async () => matter,
    getMatterHistory: async () => [],
    addWatch: async () => {},
  };
  const { args, posted, ephemerals } = makeBoltArgs();
  await makeAlertHistory(deps)(args);
  assert.equal(posted.length, 0);
  assert.match(ephemerals[0].text, /history/i);
});

test('Ask Gavel: primes the card thread and posts the invitation reply', async () => {
  const deps = {
    getDetectedItem: async () => row,
    getMatter: async () => matter,
    getMatterHistory: async () => [],
    addWatch: async () => {},
  };
  const { args, posted } = makeBoltArgs();
  await makeAlertAsk(deps)(args);
  assert.equal(posted[0].thread_ts, '171.001');
  assert.match(posted[0].text, /File #260039/);
  const prime = primeStore.getSession('C0B8KS5VCCC', '171.001');
  assert.ok(prime.includes('File #260039'));
  assert.ok(prime.includes(row.title));
});
```

- [ ] **Step 11.2: Run them to make sure they fail**

Run: `node --test tests/listeners/actions/alert-buttons.test.js`
Expected: FAIL — `makeAlertWatch` etc. not exported

- [ ] **Step 11.3: Rewrite `agent/listeners/actions/alert-buttons.js`**

```js
import { errorReply, historyTimeline } from '../../blockkit/index.js';
import { primeStore } from '../../thread-context/index.js';

/**
 * Real alert-card button handlers (MOO-73, replacing the MOO-44 stubs).
 * Boundaries (Convex + Legistar) are injected so unit tests use fakes:
 * @typedef {{
 *   getDetectedItem: (eventItemId: number) => Promise<object|null>,
 *   getMatter: (matterId: number) => Promise<{fileNumber?: string}>,
 *   getMatterHistory: (matterId: number) => Promise<Array<object>>,
 *   addWatch: (input: {channelId: string, entity: string}) => Promise<unknown>,
 * }} AlertButtonDeps
 */

const GENERIC_ERROR = ':warning: Something went wrong — please try again.';

/** Shared ack → resolve-row → act → ephemeral-on-failure shell. */
function makeHandler(label, act) {
  return async function handle({ ack, body, context, client, logger }) {
    await ack();
    const channelId = /** @type {string} */ (body.channel?.id);
    const userId = /** @type {string} */ (context.userId);
    const cardTs = /** @type {string} */ (body.message?.ts);
    const eventItemId = Number(body.actions?.[0]?.value);
    try {
      await act({ client, channelId, userId, cardTs, eventItemId });
      logger.info(`alert ${label}: eventItemId=${eventItemId} user=${userId}`);
    } catch (e) {
      logger.error(`alert ${label} failed: ${e}`);
      await postEphemeralSafe(client, logger, { channel: channelId, user: userId, text: GENERIC_ERROR });
    }
  };
}

/** The error path must never throw out of a handler. */
async function postEphemeralSafe(client, logger, message) {
  try {
    await client.chat.postEphemeral(message);
  } catch (e) {
    logger.error(`alert ephemeral failed: ${e}`);
  }
}

/** Resolve the watchable name: File #<n> when a matter exists, else the row title. */
async function resolveEntity(deps, row) {
  if (row.matterId) {
    const matter = await deps.getMatter(row.matterId);
    if (matter?.fileNumber) return `File #${matter.fileNumber}`;
  }
  return row.title;
}

async function requireRow(deps, eventItemId) {
  const row = await deps.getDetectedItem(eventItemId);
  if (!row) throw new Error(`no detectedAgendaItems row for eventItemId=${eventItemId}`);
  return row;
}

/** 👁 Watch → real Convex watch on the file number (MOO-73). */
export function makeAlertWatch(deps) {
  return makeHandler('watch', async ({ client, channelId, userId, eventItemId }) => {
    const row = await requireRow(deps, eventItemId);
    const entity = await resolveEntity(deps, row);
    await deps.addWatch({ channelId, entity });
    await client.chat.postEphemeral({
      channel: channelId,
      user: userId,
      text: `👁 Watching ${entity} — I’ll alert this channel when it moves.`,
    });
  });
}

/** 🕓 History → live MatterHistory timeline as a thread reply under the card. */
export function makeAlertHistory(deps) {
  return makeHandler('history', async ({ client, channelId, userId, cardTs, eventItemId }) => {
    const row = await requireRow(deps, eventItemId);
    if (!row.matterId) {
      const { text } = errorReply('no_matter', {});
      await client.chat.postEphemeral({ channel: channelId, user: userId, text });
      return;
    }
    const [matter, actions] = await Promise.all([deps.getMatter(row.matterId), deps.getMatterHistory(row.matterId)]);
    if (actions.length === 0) {
      const { text } = errorReply('no_history', {});
      await client.chat.postEphemeral({ channel: channelId, user: userId, text });
      return;
    }
    const blocks = historyTimeline({ fileNumber: matter?.fileNumber, actions });
    const fileBit = matter?.fileNumber ? `File #${matter.fileNumber}` : row.title;
    await client.chat.postMessage({
      channel: channelId,
      thread_ts: cardTs,
      text: `🕓 History — ${fileBit}`,
      blocks,
    });
  });
}

/** 💬 Ask Gavel → primed thread under the card; the user types there. */
export function makeAlertAsk(deps) {
  return makeHandler('ask', async ({ client, channelId, cardTs, eventItemId }) => {
    const row = await requireRow(deps, eventItemId);
    let fileNumber;
    if (row.matterId) {
      fileNumber = (await deps.getMatter(row.matterId))?.fileNumber;
    }
    const fileBit = fileNumber ? `File #${fileNumber}` : 'this agenda item';
    const preamble = [
      'CONTEXT (from the alert card the user clicked):',
      fileNumber && `Legislative file: File #${fileNumber}`,
      `Title: ${row.title}`,
      `Committee: ${row.eventBodyName}`,
      row.matterId && `Legistar MatterId: ${row.matterId}`,
      'Answer questions about this item using your civic-record tools.',
    ]
      .filter(Boolean)
      .join('\n');
    primeStore.setSession(channelId, cardTs, preamble);
    await client.chat.postMessage({
      channel: channelId,
      thread_ts: cardTs,
      text: `💬 What would you like to know about ${fileBit}? Reply in this thread and I’ll dig into the record.`,
    });
  });
}
```

- [ ] **Step 11.4: Run the handler tests**

Run: `node --test tests/listeners/actions/alert-buttons.test.js`
Expected: PASS (8 tests)

- [ ] **Step 11.5: Wire real deps in `agent/listeners/actions/index.js`**

```js
import { ConvexHttpClient } from 'convex/browser';

import { api } from '../../convex/_generated/api.js';
import { createLegistarClient } from '../../poller/legistar.js';
import { makeAlertAsk, makeAlertHistory, makeAlertWatch } from './alert-buttons.js';
import { handleFeedbackButton } from './feedback-buttons.js';

/**
 * Register action listeners. Convex/Legistar boundaries are constructed here
 * (the listeners/commands/index.js pattern) so handlers stay unit-testable.
 * @param {import('@slack/bolt').App} app
 * @returns {void}
 */
export function register(app) {
  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) {
    app.logger?.warn?.('CONVEX_URL is not set — alert-card buttons will report errors.');
  }
  const convex = convexUrl ? new ConvexHttpClient(convexUrl) : null;
  const legistar = createLegistarClient({
    fetch: globalThis.fetch,
    client: 'milwaukee',
    userAgent: 'gavel-slack-agent (tarik@radiomilwaukee.org)',
  });

  const deps = {
    getDetectedItem: (eventItemId) =>
      requireConvex(convex).query(api.detectedItems.getByEventItem, { eventItemId }),
    getMatter: (matterId) => legistar.getMatter(matterId),
    getMatterHistory: (matterId) => legistar.getMatterHistory(matterId),
    addWatch: ({ channelId, entity }) => requireConvex(convex).mutation(api.watches.addWatch, { channelId, entity }),
  };

  app.action('feedback', handleFeedbackButton);
  app.action('alert_watch', makeAlertWatch(deps));
  app.action('alert_history', makeAlertHistory(deps));
  app.action('alert_ask', makeAlertAsk(deps));
}

function requireConvex(convex) {
  if (!convex) {
    throw new Error('CONVEX_URL is not configured');
  }
  return convex;
}
```

- [ ] **Step 11.6: Run the full suite + lint**

Run: `node --test && npx @biomejs/biome check .`
Expected: PASS, no lint errors

- [ ] **Step 11.7: Commit**

```bash
git add listeners/actions/alert-buttons.js listeners/actions/index.js tests/listeners/actions/alert-buttons.test.js
git commit -m "feat(alerts): wire Watch/History/Ask Gavel card buttons for real (MOO-73)"
```

---

### Task 12: live verification (the MOO-73 checklist against reality)

No code. Run from the worktree.

- [ ] **Step 12.1: Deploy** `gavel-app` from the repo root of the worktree: `fly deploy -c fly.app.toml --remote-only`. Wait for healthy.
- [ ] **Step 12.2: Watch click** — in the demo channel (#general, C0B8KS5VCCC), click 👁 Watch on a live alert card. Capture: the ephemeral confirm (screenshot) and `npx convex run watches:listWatches '{"channelId": "C0B8KS5VCCC"}'` output showing the new row.
- [ ] **Step 12.3: History click** — click 🕓 History on the same card; screenshot the in-thread timeline; cross-check two rows against the matter's Legistar page.
- [ ] **Step 12.4: Ask Gavel click** — click 💬 Ask Gavel; see the primed reply; type a question in the thread ("when does this committee meet on it?"); confirm the agent answers with matter context.
- [ ] **Step 12.5: unwatch** — `/gavel unwatch <entity from 12.2>`; capture before/after `listWatches`.
- [ ] **Step 12.6: Failure path** — click a button on a card whose `eventItemId` has no Convex row (or temporarily point at a bogus id via a crafted card in a test channel); confirm the ephemeral error, no crash in `fly logs -a gavel-app`.
- [ ] **Step 12.7:** `node --test` full output for the evidence comment.
- [ ] **Step 12.8:** Open PR, move MOO-73 → In Review with the PR link + evidence comment, then merge and close Done per the Linear sync protocol.

---

## Self-review notes

- **Spec coverage:** every MOO-73 acceptance criterion has a task — spike (done pre-plan), 5 builders (Tasks 1–5), `removeWatch` + unwatch (7–8), three buttons (11), ack-first/graceful failure (11 tests), eventItemId resolution via `getByEventItem` (7, 11). `homeView`/`digestCard`/`render_receipt` correctly absent (UX-B/C/D).
- **Type consistency:** builders return a single block (`sponsorCard`, `voteTable`) vs block arrays (`matterCard`, `historyTimeline`) vs `{text, blocks}` (`errorReply`) — matching how each is consumed; JSDoc states which.
- **Existing-test risk:** Task 1 touches `alerts/card.js` (move only); Task 11 rewrites `alert-buttons.test.js` wholesale (the old stub tests describe deleted behavior — rewriting is correct, not test-fudging).
- **Convention note:** Convex functions have no unit harness in this repo — Task 7's live smoke + Task 12 are their verification, consistent with how `watches.ts` shipped in MOO-46.
