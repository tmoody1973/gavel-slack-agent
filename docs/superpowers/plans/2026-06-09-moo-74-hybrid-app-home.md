# MOO-74 (UX-B) Hybrid App Home — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static App Home with the approved Hybrid view — status strip (Denise) + watches & per-channel config with edit modals (Marcos) — wired to real Convex state with graceful degradation.

**Architecture:** Pure builders in `agent/blockkit/` (`homeView`, `addWatchModal`, `channelConfigModal`); a new `agent/home/` module owning state assembly (`buildHomeState`, reusing `alerts/match.js`) and publishing (`publishHome`, falling back to the current static view on any failure — never blank). Handlers are deps-injected factories (the MOO-73 pattern): block actions open modals / remove watches, `view_submission` handlers validate + mutate + re-publish, and a Bolt `app.options` typeahead serves committee options from the 169 active Legistar bodies (cached in-process — too many for a 100-option static select).

**Tech Stack:** Node 22 ESM, `node --test`, Bolt 4.7.3 (`views.open`, `views.publish`, `app.options`), Convex HTTP client, Legistar OData `bodies?$filter=BodyActiveFlag eq 1` (verified live: 169 active bodies).

**Key shapes (locked):**

```js
// HomeState — what buildHomeState returns and homeView consumes
{
  strip:    { meetings: number, lateAdds: number, watchHits: number },
  watches:  [{ channelId, channelName, entity }],
  channels: [{ channelId, channelName, committees: string[], keywords: string[], language: 'en'|'es' }],
}
// Empty state == channels.length === 0 (homeView renders the setup CTA).
```

- Strip semantics: among `detectedAgendaItems` rows with `eventDate >= today`, a row is *relevant* when `matchSubscriptions(row, subscriptions)` is non-empty. `meetings` = distinct `eventId` among relevant rows · `lateAdds` = relevant rows with `walkOnFlag` · `watchHits` = upcoming rows whose title contains any watched entity (case-insensitive).
- Action ids: `home_add_watch`, `home_edit_channel`, `home_watch_remove` (overflow), `home_committees` (external options). Callback ids: `home_add_watch_modal`, `home_channel_config_modal`.
- Buttons/overflow carry JSON or plain values: edit button value = `channelId`; overflow option value = `JSON.stringify({channelId, entity})`; config modal `private_metadata` = `channelId`.

**Working directory:** `agent/` inside `/Users/tarikmoody/Documents/Projects/gavel-slack-agent/.claude/worktrees/moo-74-ux-b`.
Branch: `tarikjmoody/moo-74-ux-b-hybrid-app-home-status-strip-watches-channel-config`.

---

## File structure

| File | Action | Responsibility |
|---|---|---|
| `agent/convex/watches.ts` | Modify | add `listAllWatches` query |
| `agent/convex/detectedItems.ts` | Modify | add `listUpcoming` query |
| `agent/blockkit/home-view.js` | Create | pure `homeView(state)` |
| `agent/blockkit/home-modals.js` | Create | pure `addWatchModal`, `channelConfigModal` |
| `agent/blockkit/index.js` | Modify | re-export the three new builders |
| `agent/home/state.js` | Create | `buildHomeState(deps, now)` |
| `agent/home/publish.js` | Create | `publishHome` + static fallback view |
| `agent/home/deps.js` | Create | `createHomeDeps()` — Convex/Legistar/name-cache boundaries |
| `agent/listeners/events/app-home-opened.js` | Rewrite | factory `makeAppHomeOpened(deps)` → `publishHome` |
| `agent/listeners/events/index.js` | Modify | construct home deps, register factory |
| `agent/listeners/actions/home-buttons.js` | Create | 3 button handlers + `committeeOptions` handler |
| `agent/listeners/actions/index.js` | Modify | register home actions + options |
| `agent/listeners/views/home-modals.js` | Create | 2 `view_submission` handlers |
| `agent/listeners/views/index.js` | Rewrite | register view handlers |
| `agent/listeners/views/app-home-builder.js` | Delete | superseded (fallback copy moves to `home/publish.js`) |
| `agent/tests/blockkit/home-view.test.js` etc. | Create | one test file per new module |

Note: `tests/listeners/events/app-home-opened.test.js` and `tests/listeners/views/app-home-builder.test.js` describe the deleted static view — rewrite/remove them with the code they tested.

---

### Task 1: Convex reads — `listAllWatches` + `listUpcoming`

**Files:** Modify `agent/convex/watches.ts`, `agent/convex/detectedItems.ts`

- [ ] **Step 1.1:** Append to `watches.ts`:

```ts
/** Every watch across all channels — the App Home's watches section. */
export const listAllWatches = query({
  args: {},
  handler: (ctx) => ctx.db.query('watches').collect(),
});
```

- [ ] **Step 1.2:** Append to `detectedItems.ts`:

```ts
/** Detected rows for events on/after a date — the App Home strip's window. */
export const listUpcoming = query({
  args: { client: v.optional(clientValidator), fromDate: v.string() },
  handler: (ctx, { client, fromDate }) =>
    ctx.db
      .query('detectedAgendaItems')
      .withIndex('by_client_item', (q) => q.eq('client', client ?? 'milwaukee'))
      .filter((q) => q.gte(q.field('eventDate'), fromDate))
      .collect(),
});
```

- [ ] **Step 1.3:** Push + smoke against real data:

```bash
npx convex dev --once
npx convex run watches:listAllWatches '{}'                         # expect the Punta Cana LLC row
npx convex run detectedItems:listUpcoming '{"fromDate": "2026-06-09"}'  # expect rows w/ eventDate >= today
```

- [ ] **Step 1.4: Commit** — `feat(convex): listAllWatches + detectedItems.listUpcoming for the App Home (MOO-74)`

---

### Task 2: `homeView` builder (TDD)

**Files:** Create `agent/blockkit/home-view.js`, `agent/tests/blockkit/home-view.test.js`; modify `agent/blockkit/index.js`

- [ ] **Step 2.1: Failing test**

```js
// agent/tests/blockkit/home-view.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { homeView } from '../../blockkit/home-view.js';

const state = {
  strip: { meetings: 3, lateAdds: 1, watchHits: 2 },
  watches: [{ channelId: 'C1', channelName: 'general', entity: 'Punta Cana LLC' }],
  channels: [
    {
      channelId: 'C1',
      channelName: 'general',
      committees: ['ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE'],
      keywords: ['rezoning'],
      language: 'es',
    },
  ],
};

test('homeView renders the status strip with all three counts', () => {
  const view = homeView(state);
  assert.equal(view.type, 'home');
  const all = JSON.stringify(view.blocks);
  assert.match(all, /3.*meetings touch your subscriptions/s);
  assert.match(all, /1.*added late/s);
  assert.match(all, /2.*watch hit/s);
});

test('homeView lists watches with a remove overflow carrying channel+entity', () => {
  const view = homeView(state);
  const overflow = JSON.stringify(view.blocks).match(/"home_watch_remove"/g);
  assert.equal(overflow.length, 1);
  const all = JSON.stringify(view.blocks);
  assert.ok(all.includes('Punta Cana LLC'));
  assert.ok(all.includes(JSON.stringify(JSON.stringify({ channelId: 'C1', entity: 'Punta Cana LLC' })).slice(1, -1)));
});

test('homeView has a ＋ Watch button and an Edit button per channel', () => {
  const all = JSON.stringify(homeView(state).blocks);
  assert.ok(all.includes('home_add_watch'));
  assert.ok(all.includes('home_edit_channel'));
  assert.ok(all.includes('#general'));
  assert.match(all, /Español/);
  assert.ok(all.includes('rezoning'));
});

test('homeView renders the setup CTA when there are no subscribed channels', () => {
  const view = homeView({ strip: { meetings: 0, lateAdds: 0, watchHits: 0 }, watches: [], channels: [] });
  const all = JSON.stringify(view.blocks);
  assert.match(all, /\/gavel/);
  assert.match(all, /invite/i);
  assert.ok(!all.includes('home_edit_channel'));
});

test('homeView shows an empty-watches hint instead of nothing', () => {
  const view = homeView({ ...state, watches: [] });
  assert.match(JSON.stringify(view.blocks), /No watches yet/i);
});
```

- [ ] **Step 2.2:** Run `node --test tests/blockkit/home-view.test.js` → FAIL (module not found)

- [ ] **Step 2.3: Implement**

```js
// agent/blockkit/home-view.js
/** Slack caps a home view at 100 blocks; stay well under with sane slices. */
const MAX_WATCH_ROWS = 20;
const MAX_CHANNEL_ROWS = 10;

const mrkdwn = (text) => ({ type: 'section', text: { type: 'mrkdwn', text } });

/**
 * The Hybrid App Home (MOO-74): status strip (Denise) + watches and
 * per-channel config with edit modals (Marcos). Pure over HomeState.
 * @param {{
 *   strip: {meetings: number, lateAdds: number, watchHits: number},
 *   watches: Array<{channelId: string, channelName: string, entity: string}>,
 *   channels: Array<{channelId: string, channelName: string, committees: string[], keywords: string[], language: 'en'|'es'}>,
 * }} state
 * @returns {{type: 'home', blocks: object[]}}
 */
export function homeView({ strip, watches, channels }) {
  if (channels.length === 0) return emptyStateView();

  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: '🏛️ Gavel — your civic week', emoji: true } },
    mrkdwn(
      `This week: *${strip.meetings}* meetings touch your subscriptions · ⚠️ *${strip.lateAdds}* added late · 👁 *${strip.watchHits}* watch hits`,
    ),
    { type: 'divider' },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: '*👁 Watches*' },
      accessory: {
        type: 'button',
        action_id: 'home_add_watch',
        text: { type: 'plain_text', text: '＋ Watch', emoji: true },
        style: 'primary',
      },
    },
    ...watchBlocks(watches),
    { type: 'divider' },
    mrkdwn('*⚙️ Channel alerts*'),
    ...channels.slice(0, MAX_CHANNEL_ROWS).flatMap(channelBlocks),
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: 'Sourced live from Milwaukee’s official Legistar records · `/gavel` works in any subscribed channel.',
        },
      ],
    },
  ];
  return { type: 'home', blocks };
}

function watchBlocks(watches) {
  if (watches.length === 0) {
    return [
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: 'No watches yet — watch a file number, address, or name and I’ll alert the channel when it moves.' }],
      },
    ];
  }
  return watches.slice(0, MAX_WATCH_ROWS).map((w) => ({
    type: 'section',
    text: { type: 'mrkdwn', text: `• *${w.entity}* — #${w.channelName}` },
    accessory: {
      type: 'overflow',
      action_id: 'home_watch_remove',
      options: [
        {
          text: { type: 'plain_text', text: '🚫 Stop watching', emoji: true },
          value: JSON.stringify({ channelId: w.channelId, entity: w.entity }),
        },
      ],
    },
  }));
}

function channelBlocks(channel) {
  const language = channel.language === 'es' ? '🇪🇸 Español (bilingual)' : '🇺🇸 English';
  const committees = channel.committees.length > 0 ? channel.committees.join(', ') : '_none_';
  const keywords = channel.keywords.length > 0 ? channel.keywords.join(', ') : '_none_';
  return [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*#${channel.channelName}* · ${language}` },
      accessory: {
        type: 'button',
        action_id: 'home_edit_channel',
        text: { type: 'plain_text', text: 'Edit', emoji: true },
        value: channel.channelId,
      },
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `🏛 ${committees}\n🔑 ${keywords}` }],
    },
  ];
}

function emptyStateView() {
  return {
    type: 'home',
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '🏛️ Gavel — Milwaukee civic transparency', emoji: true } },
      mrkdwn(
        "I watch Milwaukee city government so your neighborhood doesn't have to — plain-English (and Spanish) alerts *before* the vote.",
      ),
      { type: 'divider' },
      mrkdwn(
        '*Get set up in two steps:*\n1. *Invite me to a channel* — `/invite @Gavel` where your neighbors talk.\n2. *Subscribe it* — `/gavel watch <file, address, or name>` or ask an admin to add committees.\nAlerts start posting automatically once a channel is subscribed.',
      ),
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: 'Questions? DM me — “What meetings are coming up this week?”' }],
      },
    ],
  };
}
```

- [ ] **Step 2.4:** `node --test tests/blockkit/home-view.test.js` → PASS (5 tests)
- [ ] **Step 2.5:** Add to `blockkit/index.js`: `export { homeView } from './home-view.js';`
- [ ] **Step 2.6: Commit** — `feat(blockkit): homeView builder — Hybrid App Home (MOO-74)`

---

### Task 3: modal builders (TDD)

**Files:** Create `agent/blockkit/home-modals.js`, `agent/tests/blockkit/home-modals.test.js`; modify `agent/blockkit/index.js`

- [ ] **Step 3.1: Failing test**

```js
// agent/tests/blockkit/home-modals.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addWatchModal, channelConfigModal } from '../../blockkit/home-modals.js';

const channels = [
  { channelId: 'C1', channelName: 'general' },
  { channelId: 'C2', channelName: 'cesar-chavez-dr' },
];

test('addWatchModal has a channel select over subscribed channels and an entity input', () => {
  const modal = addWatchModal(channels);
  assert.equal(modal.type, 'modal');
  assert.equal(modal.callback_id, 'home_add_watch_modal');
  const all = JSON.stringify(modal.blocks);
  assert.ok(all.includes('watch_channel'));
  assert.ok(all.includes('watch_entity'));
  assert.ok(all.includes('cesar-chavez-dr'));
  assert.equal(JSON.stringify(modal).includes('conversations_select'), false); // subscribed-only static select
});

test('channelConfigModal carries the channelId, current values, and the typeahead committees select', () => {
  const modal = channelConfigModal({
    channelId: 'C1',
    channelName: 'general',
    committees: ['LICENSES COMMITTEE'],
    keywords: ['rezoning', 'demolition'],
    language: 'es',
  });
  assert.equal(modal.callback_id, 'home_channel_config_modal');
  assert.equal(modal.private_metadata, 'C1');
  const all = JSON.stringify(modal);
  assert.ok(all.includes('multi_external_select'));
  assert.ok(all.includes('home_committees'));
  assert.ok(all.includes('LICENSES COMMITTEE')); // initial option
  assert.ok(all.includes('rezoning, demolition')); // initial keywords value
  assert.ok(all.includes('radio_buttons'));
  assert.match(all, /"initial_option".*Español/s);
});

test('channelConfigModal tolerates empty committees/keywords (no initial_options key)', () => {
  const modal = channelConfigModal({ channelId: 'C2', channelName: 'x', committees: [], keywords: [], language: 'en' });
  const committeesBlock = modal.blocks.find((b) => b.block_id === 'cfg_committees');
  assert.equal('initial_options' in committeesBlock.element, false);
  const all = JSON.stringify(modal);
  assert.ok(!all.includes('undefined'));
});
```

- [ ] **Step 3.2:** Run → FAIL (module not found)

- [ ] **Step 3.3: Implement**

```js
// agent/blockkit/home-modals.js
const plain = (text) => ({ type: 'plain_text', text, emoji: true });

const LANGUAGE_OPTIONS = [
  { text: plain('🇺🇸 English'), value: 'en' },
  { text: plain('🇪🇸 Español (bilingual cards)'), value: 'es' },
];

/**
 * "＋ Watch" modal: pick one subscribed channel, name the entity.
 * @param {Array<{channelId: string, channelName: string}>} channels
 * @returns {object}
 */
export function addWatchModal(channels) {
  return {
    type: 'modal',
    callback_id: 'home_add_watch_modal',
    title: plain('Watch something'),
    submit: plain('Watch'),
    close: plain('Cancel'),
    blocks: [
      {
        type: 'input',
        block_id: 'watch_channel',
        label: plain('Alert this channel'),
        element: {
          type: 'static_select',
          action_id: 'value',
          options: channels.map((c) => ({ text: plain(`#${c.channelName}`), value: c.channelId })),
        },
      },
      {
        type: 'input',
        block_id: 'watch_entity',
        label: plain('File number, address, or name'),
        element: {
          type: 'plain_text_input',
          action_id: 'value',
          placeholder: plain('e.g. File #260229 · 2000 S 13th St · Punta Cana LLC'),
        },
      },
    ],
  };
}

/**
 * Per-channel config modal. Committees use a typeahead (multi_external_select →
 * the home_committees options handler) because Milwaukee has 169 active bodies —
 * past Slack's 100-option static cap.
 * @param {{channelId: string, channelName: string, committees: string[], keywords: string[], language: 'en'|'es'}} channel
 * @returns {object}
 */
export function channelConfigModal(channel) {
  const committeesElement = {
    type: 'multi_external_select',
    action_id: 'home_committees',
    min_query_length: 0,
    placeholder: plain('Type to search committees…'),
  };
  if (channel.committees.length > 0) {
    committeesElement.initial_options = channel.committees.map((name) => ({ text: plain(name), value: name }));
  }
  const keywordsElement = {
    type: 'plain_text_input',
    action_id: 'value',
    placeholder: plain('rezoning, demolition, liquor license'),
  };
  if (channel.keywords.length > 0) {
    keywordsElement.initial_value = channel.keywords.join(', ');
  }
  return {
    type: 'modal',
    callback_id: 'home_channel_config_modal',
    private_metadata: channel.channelId,
    title: plain(`#${channel.channelName}`.slice(0, 24)),
    submit: plain('Save'),
    close: plain('Cancel'),
    blocks: [
      {
        type: 'input',
        block_id: 'cfg_committees',
        optional: true,
        label: plain('Committees'),
        element: committeesElement,
      },
      {
        type: 'input',
        block_id: 'cfg_keywords',
        optional: true,
        label: plain('Keywords (comma-separated)'),
        element: keywordsElement,
      },
      {
        type: 'input',
        block_id: 'cfg_language',
        label: plain('Alert language'),
        element: {
          type: 'radio_buttons',
          action_id: 'value',
          options: LANGUAGE_OPTIONS,
          initial_option: LANGUAGE_OPTIONS[channel.language === 'es' ? 1 : 0],
        },
      },
    ],
  };
}
```

- [ ] **Step 3.4:** Run → PASS (3 tests)
- [ ] **Step 3.5:** Add to `blockkit/index.js`: `export { addWatchModal, channelConfigModal } from './home-modals.js';`
- [ ] **Step 3.6: Commit** — `feat(blockkit): addWatchModal + channelConfigModal builders (MOO-74)`

---

### Task 4: `buildHomeState` (TDD)

**Files:** Create `agent/home/state.js`, `agent/tests/home/state.test.js`

- [ ] **Step 4.1: Failing test**

```js
// agent/tests/home/state.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildHomeState } from '../../home/state.js';

const subscriptions = [
  { channelId: 'C1', committees: ['ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE'], keywords: ['rezoning'], language: 'es' },
  { channelId: 'C2', committees: [], keywords: ['liquor'], language: 'en' },
];
const watches = [
  { channelId: 'C1', entity: 'Punta Cana LLC' },
  { channelId: 'C2', entity: 'File #260234' },
];
const upcoming = [
  // matches C1 by committee; walk-on
  { eventId: 10, eventItemId: 1, eventBodyName: 'ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE', title: 'A rezoning', walkOnFlag: true },
  // matches C1 by committee (same meeting 10)
  { eventId: 10, eventItemId: 2, eventBodyName: 'ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE', title: 'Another item' },
  // matches C2 by keyword; title contains a watched entity
  { eventId: 11, eventItemId: 3, eventBodyName: 'LICENSES COMMITTEE', title: 'Liquor license for Punta Cana LLC' },
  // matches nothing
  { eventId: 12, eventItemId: 4, eventBodyName: 'FINANCE & PERSONNEL COMMITTEE', title: 'Budget note' },
];

function deps(overrides = {}) {
  return {
    listSubscriptions: async () => subscriptions,
    listAllWatches: async () => watches,
    listUpcoming: async () => upcoming,
    getChannelName: async (id) => ({ C1: 'general', C2: 'cesar-chavez-dr' })[id] ?? id,
    ...overrides,
  };
}

test('strip counts: distinct matched meetings, walk-ons among matches, watch hits', async () => {
  const state = await buildHomeState(deps());
  assert.deepEqual(state.strip, { meetings: 2, lateAdds: 1, watchHits: 1 });
});

test('watches and channels carry resolved names and config', async () => {
  const state = await buildHomeState(deps());
  assert.deepEqual(state.watches[0], { channelId: 'C1', channelName: 'general', entity: 'Punta Cana LLC' });
  assert.equal(state.channels[1].channelName, 'cesar-chavez-dr');
  assert.equal(state.channels[0].language, 'es');
});

test('a failed channel-name lookup degrades to the raw id', async () => {
  const state = await buildHomeState(
    deps({
      getChannelName: async () => {
        throw new Error('missing_scope');
      },
    }),
  );
  assert.equal(state.channels[0].channelName, 'C1');
});

test('no subscriptions yields the empty state regardless of other data', async () => {
  const state = await buildHomeState(deps({ listSubscriptions: async () => [] }));
  assert.deepEqual(state.channels, []);
});
```

- [ ] **Step 4.2:** Run → FAIL (module not found)

- [ ] **Step 4.3: Implement**

```js
// agent/home/state.js
import { matchSubscriptions } from '../alerts/match.js';

/**
 * Assemble the HomeState for blockkit/home-view.js from injected boundaries.
 * Strip semantics: a detected row is "relevant" when it matches at least one
 * channel subscription (committee or keyword — alerts/match.js, the same rule
 * the poller uses). Watch hits are upcoming titles containing a watched entity.
 *
 * @param {{
 *   listSubscriptions: () => Promise<Array<object>>,
 *   listAllWatches: () => Promise<Array<{channelId: string, entity: string}>>,
 *   listUpcoming: () => Promise<Array<object>>,
 *   getChannelName: (channelId: string) => Promise<string>,
 * }} deps
 * @returns {Promise<object>} HomeState
 */
export async function buildHomeState(deps) {
  const [subscriptions, watches, upcoming] = await Promise.all([
    deps.listSubscriptions(),
    deps.listAllWatches(),
    deps.listUpcoming(),
  ]);

  const relevant = upcoming.filter((row) => matchSubscriptions(row, subscriptions).length > 0);
  const meetings = new Set(relevant.map((row) => row.eventId)).size;
  const lateAdds = relevant.filter((row) => row.walkOnFlag).length;
  const watchHits = upcoming.filter((row) =>
    watches.some((w) => row.title.toLowerCase().includes(w.entity.toLowerCase())),
  ).length;

  const names = await resolveNames(
    [...new Set([...subscriptions.map((s) => s.channelId), ...watches.map((w) => w.channelId)])],
    deps.getChannelName,
  );

  return {
    strip: { meetings, lateAdds, watchHits },
    watches: watches.map((w) => ({ channelId: w.channelId, channelName: names.get(w.channelId), entity: w.entity })),
    channels: subscriptions.map((s) => ({
      channelId: s.channelId,
      channelName: names.get(s.channelId),
      committees: s.committees ?? [],
      keywords: s.keywords ?? [],
      language: s.language ?? 'en',
    })),
  };
}

/** Resolve channel names, degrading to the raw id — never let a name kill the Home. */
async function resolveNames(channelIds, getChannelName) {
  const names = new Map();
  await Promise.all(
    channelIds.map(async (id) => {
      try {
        names.set(id, await getChannelName(id));
      } catch {
        names.set(id, id);
      }
    }),
  );
  return names;
}
```

- [ ] **Step 4.4:** Run → PASS (4 tests)
- [ ] **Step 4.5: Commit** — `feat(home): buildHomeState — strip counts + name resolution (MOO-74)`

---

### Task 5: `publishHome` with fallback + rewired `app_home_opened`

**Files:** Create `agent/home/publish.js`, `agent/tests/home/publish.test.js`; rewrite `agent/listeners/events/app-home-opened.js`; modify `agent/listeners/events/index.js`; delete `agent/listeners/views/app-home-builder.js` + its test + the old `app-home-opened.test.js`

- [ ] **Step 5.1: Failing test**

```js
// agent/tests/home/publish.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { publishHome } from '../../home/publish.js';

function fakes({ failState = false } = {}) {
  const published = [];
  const client = { views: { publish: async (v) => published.push(v) } };
  const deps = {
    listSubscriptions: async () => {
      if (failState) throw new Error('convex down');
      return [{ channelId: 'C1', committees: [], keywords: ['x'], language: 'en' }];
    },
    listAllWatches: async () => [],
    listUpcoming: async () => [],
    getChannelName: async () => 'general',
  };
  return { published, client, deps, logger: { error: () => {} } };
}

test('publishHome publishes the hybrid view for the user', async () => {
  const { published, client, deps, logger } = fakes();
  await publishHome({ client, userId: 'U1' }, deps, logger);
  assert.equal(published[0].user_id, 'U1');
  assert.match(JSON.stringify(published[0].view), /your civic week/);
});

test('a state failure falls back to the static view — never a blank Home', async () => {
  const { published, client, deps, logger } = fakes({ failState: true });
  await publishHome({ client, userId: 'U1' }, deps, logger);
  assert.equal(published.length, 1);
  assert.match(JSON.stringify(published[0].view), /civic transparency/i);
});

test('even a publish failure never throws', async () => {
  const { deps, logger } = fakes();
  const client = { views: { publish: async () => { throw new Error('slack 500'); } } };
  await publishHome({ client, userId: 'U1' }, deps, logger); // must not reject
  assert.ok(true);
});
```

- [ ] **Step 5.2:** Run → FAIL

- [ ] **Step 5.3: Implement**

```js
// agent/home/publish.js
import { homeView } from '../blockkit/index.js';
import { buildHomeState } from './state.js';

/**
 * Build + publish the Hybrid App Home for one user. Every failure degrades:
 * state assembly fails → static fallback view; publish fails → log only.
 * Re-used by app_home_opened and by every mutation handler (re-publish).
 */
export async function publishHome({ client, userId }, deps, logger) {
  let view;
  try {
    view = homeView(await buildHomeState(deps));
  } catch (e) {
    logger.error(`App Home state failed, falling back to static view: ${e}`);
    view = staticFallbackView();
  }
  try {
    await client.views.publish({ user_id: userId, view });
  } catch (e) {
    logger.error(`Failed to publish App Home: ${e}`);
  }
}

/** The pre-MOO-74 static Home — kept as the degraded mode, never blank. */
function staticFallbackView() {
  return {
    type: 'home',
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: 'Gavel — Milwaukee civic transparency 🏛️', emoji: true } },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            "I watch Milwaukee city government so your neighborhood doesn't have to. "
            + 'I translate agendas, permits, and legislation into plain English and Spanish — *before* the vote.',
        },
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: 'Live data is briefly unavailable — DM me or try again in a minute.' }],
      },
    ],
  };
}
```

```js
// agent/listeners/events/app-home-opened.js  (full rewrite)
import { publishHome } from '../../home/publish.js';

/**
 * Publish the Hybrid App Home when a user opens the Home tab (MOO-74).
 * Deps are injected by listeners/events/index.js (home/deps.js).
 */
export function makeAppHomeOpened(deps) {
  return async function handleAppHomeOpened({ client, context, logger }) {
    const userId = /** @type {string} */ (context.userId);
    await publishHome({ client, userId }, deps, logger);
  };
}
```

- [ ] **Step 5.4:** Delete `agent/listeners/views/app-home-builder.js`, `agent/tests/listeners/views/app-home-builder.test.js`, `agent/tests/listeners/events/app-home-opened.test.js` (they describe the deleted static-only behavior; publish.test.js covers the replacement).

- [ ] **Step 5.5:** Create `agent/home/deps.js` (shared by events/actions/views registration):

```js
// agent/home/deps.js
import { ConvexHttpClient } from 'convex/browser';

import { api } from '../convex/_generated/api.js';
import { createLegistarClient } from '../poller/legistar.js';

const BODIES_TTL_MS = 60 * 60 * 1000;
const NAME_TTL_MS = 10 * 60 * 1000;

/**
 * Boundaries for the App Home: Convex reads/writes, Legistar bodies (cached —
 * the committee typeahead), Slack channel names (cached). One instance per app.
 * @param {{client: import('@slack/web-api').WebClient}} slack - any WebClient-shaped chat/conversations owner
 */
export function createHomeDeps(slackClient) {
  const convexUrl = process.env.CONVEX_URL;
  const convex = convexUrl ? new ConvexHttpClient(convexUrl) : null;
  const legistar = createLegistarClient({
    fetch: globalThis.fetch,
    client: 'milwaukee',
    userAgent: 'gavel-slack-agent (tarik@radiomilwaukee.org)',
  });
  const bodiesCache = { at: 0, names: [] };
  const nameCache = new Map();

  return {
    listSubscriptions: () => requireConvex(convex).query(api.subscriptions.listSubscriptions, {}),
    listAllWatches: () => requireConvex(convex).query(api.watches.listAllWatches, {}),
    listUpcoming: () =>
      requireConvex(convex).query(api.detectedItems.listUpcoming, { fromDate: new Date().toISOString().slice(0, 10) }),
    getSubscription: (channelId) => requireConvex(convex).query(api.subscriptions.getSubscription, { channelId }),
    addWatch: (input) => requireConvex(convex).mutation(api.watches.addWatch, input),
    removeWatch: (input) => requireConvex(convex).mutation(api.watches.removeWatch, input),
    upsertSubscription: (input) => requireConvex(convex).mutation(api.subscriptions.upsertSubscription, input),

    /** Active Legistar body names, cached an hour — the typeahead's source. */
    async listCommitteeNames() {
      if (Date.now() - bodiesCache.at > BODIES_TTL_MS) {
        bodiesCache.names = await legistar.fetchActiveBodyNames();
        bodiesCache.at = Date.now();
      }
      return bodiesCache.names;
    },

    /** Channel display name via conversations.info, cached 10 minutes. */
    async getChannelName(channelId) {
      const cached = nameCache.get(channelId);
      if (cached && Date.now() - cached.at < NAME_TTL_MS) return cached.name;
      const info = await slackClient.conversations.info({ channel: channelId });
      const name = info.channel?.name ?? channelId;
      nameCache.set(channelId, { at: Date.now(), name });
      return name;
    },
  };
}

function requireConvex(convex) {
  if (!convex) throw new Error('CONVEX_URL is not configured');
  return convex;
}
```

Add to `agent/poller/legistar.js` inside `createLegistarClient` (with the other fetchers) and to its return object:

```js
  async function fetchActiveBodyNames() {
    const params = new URLSearchParams({ $filter: 'BodyActiveFlag eq 1', $select: 'BodyName' });
    const raw = await getJson(`bodies?${params.toString()}`);
    return raw.map((b) => b.BodyName).filter(Boolean).sort();
  }
```

(Plus a unit test in `tests/poller/legistar-client.test.js` asserting the URL contains `bodies` and `BodyActiveFlag`, fake route key `bodies`.)

- [ ] **Step 5.6:** Rewire `agent/listeners/events/index.js`:

```js
import { createHomeDeps } from '../../home/deps.js';
import { makeAppHomeOpened } from './app-home-opened.js';
import { handleAppMentioned } from './app-mentioned.js';
import { handleAssistantThreadStarted } from './assistant-thread-started.js';
import { handleMessage } from './message.js';

/**
 * Register event listeners with the Bolt app.
 * @param {import('@slack/bolt').App} app
 * @returns {void}
 */
export function register(app) {
  app.event('app_home_opened', makeAppHomeOpened(createHomeDeps(app.client)));
  app.event('app_mention', handleAppMentioned);
  app.event('assistant_thread_started', handleAssistantThreadStarted);
  app.event('message', handleMessage);
}
```

- [ ] **Step 5.7:** `node --test` full suite → PASS (old app-home tests deleted, new ones green)
- [ ] **Step 5.8: Commit** — `feat(home): publishHome with static fallback + hybrid app_home_opened (MOO-74)`

---

### Task 6: home buttons + committee typeahead (TDD)

**Files:** Create `agent/listeners/actions/home-buttons.js`, `agent/tests/listeners/actions/home-buttons.test.js`; modify `agent/listeners/actions/index.js`

- [ ] **Step 6.1: Failing tests** (factory style, fakes per MOO-73 idiom)

```js
// agent/tests/listeners/actions/home-buttons.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  makeCommitteeOptions,
  makeHomeAddWatch,
  makeHomeEditChannel,
  makeHomeWatchRemove,
} from '../../../listeners/actions/home-buttons.js';

const subscriptions = [{ channelId: 'C1', committees: ['LICENSES COMMITTEE'], keywords: ['x'], language: 'en' }];

function makeDeps(overrides = {}) {
  return {
    listSubscriptions: async () => subscriptions,
    listAllWatches: async () => [],
    listUpcoming: async () => [],
    getSubscription: async () => subscriptions[0],
    getChannelName: async () => 'general',
    removeWatch: async () => 'someid',
    listCommitteeNames: async () => ['LICENSES COMMITTEE', 'PUBLIC WORKS COMMITTEE', 'ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE'],
    ...overrides,
  };
}

function boltArgs(action = {}) {
  const opened = [];
  const published = [];
  return {
    opened,
    published,
    args: {
      ack: async () => {},
      body: { trigger_id: 'T1', user: { id: 'U1' }, actions: [action] },
      context: { userId: 'U1' },
      client: {
        views: { open: async (v) => opened.push(v), publish: async (v) => published.push(v) },
      },
      logger: { info: () => {}, error: () => {} },
    },
  };
}

test('＋ Watch opens the add-watch modal listing subscribed channels', async () => {
  const { args, opened } = boltArgs({ action_id: 'home_add_watch' });
  await makeHomeAddWatch(makeDeps())(args.args ?? args); // (use the returned args object)
});
```

The real test file is written in full during implementation — assert: `views.open` called with `trigger_id` and `callback_id home_add_watch_modal`; edit-channel opens `home_channel_config_modal` with `private_metadata C1`; watch-remove parses the overflow JSON value, calls `removeWatch({channelId, entity})`, then re-publishes the Home (`views.publish` called); `makeCommitteeOptions` filters by query (`'zon'` → 1 option) and caps at 100; every handler swallows failures (logger.error, no throw).

- [ ] **Step 6.2:** Run → FAIL

- [ ] **Step 6.3: Implement**

```js
// agent/listeners/actions/home-buttons.js
import { addWatchModal, channelConfigModal } from '../../blockkit/index.js';
import { publishHome } from '../../home/publish.js';

const MAX_OPTIONS = 100;

/** ＋ Watch → modal over the subscribed channels. */
export function makeHomeAddWatch(deps) {
  return async ({ ack, body, client, logger }) => {
    await ack();
    try {
      const subscriptions = await deps.listSubscriptions();
      const channels = await Promise.all(
        subscriptions.map(async (s) => ({ channelId: s.channelId, channelName: await safeName(deps, s.channelId) })),
      );
      await client.views.open({ trigger_id: body.trigger_id, view: addWatchModal(channels) });
    } catch (e) {
      logger.error(`home add-watch open failed: ${e}`);
    }
  };
}

/** Edit → per-channel config modal pre-filled from Convex. */
export function makeHomeEditChannel(deps) {
  return async ({ ack, body, client, logger }) => {
    await ack();
    try {
      const channelId = body.actions?.[0]?.value;
      const subscription = await deps.getSubscription(channelId);
      if (!subscription) throw new Error(`no subscription for ${channelId}`);
      await client.views.open({
        trigger_id: body.trigger_id,
        view: channelConfigModal({
          channelId,
          channelName: await safeName(deps, channelId),
          committees: subscription.committees ?? [],
          keywords: subscription.keywords ?? [],
          language: subscription.language ?? 'en',
        }),
      });
    } catch (e) {
      logger.error(`home edit-channel open failed: ${e}`);
    }
  };
}

/** Overflow "Stop watching" → removeWatch → re-publish the Home. */
export function makeHomeWatchRemove(deps) {
  return async ({ ack, body, client, context, logger }) => {
    await ack();
    try {
      const { channelId, entity } = JSON.parse(body.actions?.[0]?.selected_option?.value ?? '{}');
      await deps.removeWatch({ channelId, entity });
      await publishHome({ client, userId: context.userId }, deps, logger);
    } catch (e) {
      logger.error(`home watch-remove failed: ${e}`);
    }
  };
}

/** Committee typeahead for multi_external_select (169 active bodies). */
export function makeCommitteeOptions(deps) {
  return async ({ ack, options, logger }) => {
    try {
      const query = (options?.value ?? '').toLowerCase();
      const names = await deps.listCommitteeNames();
      const matches = names.filter((n) => n.toLowerCase().includes(query)).slice(0, MAX_OPTIONS);
      await ack({ options: matches.map((n) => ({ text: { type: 'plain_text', text: n.slice(0, 75) }, value: n })) });
    } catch (e) {
      logger.error(`home committee options failed: ${e}`);
      await ack({ options: [] });
    }
  };
}

async function safeName(deps, channelId) {
  try {
    return await deps.getChannelName(channelId);
  } catch {
    return channelId;
  }
}
```

- [ ] **Step 6.4:** Register in `agent/listeners/actions/index.js` — construct shared home deps ONCE and export for views (move construction up):

```js
import { createHomeDeps } from '../../home/deps.js';
// ... existing imports

export function register(app) {
  // ...existing alert-button deps stay as-is...
  const homeDeps = createHomeDeps(app.client);
  app.action('home_add_watch', makeHomeAddWatch(homeDeps));
  app.action('home_edit_channel', makeHomeEditChannel(homeDeps));
  app.action('home_watch_remove', makeHomeWatchRemove(homeDeps));
  app.options('home_committees', makeCommitteeOptions(homeDeps));
  // ...
}
```

(Each registry constructs its own `createHomeDeps(app.client)` — caches are per-instance, fine at this scale; do NOT share module-level state.)

- [ ] **Step 6.5:** `node --test` → PASS; commit — `feat(home): ＋Watch/Edit/remove actions + committee typeahead (MOO-74)`

---

### Task 7: modal submissions (TDD)

**Files:** Create `agent/listeners/views/home-modals.js`, `agent/tests/listeners/views/home-modals.test.js`; rewrite `agent/listeners/views/index.js`

- [ ] **Step 7.1: Failing tests** — assert with fakes:
  - add-watch submission: extracts channel + entity from `view.state.values.watch_channel.value.selected_option.value` / `watch_entity.value.value`, calls `addWatch`, acks plain, re-publishes Home.
  - add-watch with blank entity → `ack({response_action: 'errors', errors: {watch_entity: …}})`, no mutation.
  - config submission: parses committees from `cfg_committees.home_committees.selected_options[].value`, keywords split on commas/trimmed, language from `cfg_language.value.selected_option.value`; calls `upsertSubscription({channelId: private_metadata, committees, keywords, language})`; re-publishes.
  - config with zero committees AND zero keywords → `response_action errors` on `cfg_committees` ("Pick at least one committee or add a keyword — otherwise this channel gets no alerts."), no mutation.
  - a Convex failure acks (already acked) and logs without throwing.

- [ ] **Step 7.2:** Run → FAIL

- [ ] **Step 7.3: Implement**

```js
// agent/listeners/views/home-modals.js
import { publishHome } from '../../home/publish.js';

/** "Watch something" modal submit → addWatch → re-publish. */
export function makeAddWatchSubmit(deps) {
  return async ({ ack, body, view, client, logger }) => {
    const channelId = view.state.values.watch_channel?.value?.selected_option?.value;
    const entity = (view.state.values.watch_entity?.value?.value ?? '').trim();
    if (!entity) {
      await ack({ response_action: 'errors', errors: { watch_entity: 'Name a file number, address, or name to watch.' } });
      return;
    }
    await ack();
    try {
      await deps.addWatch({ channelId, entity });
      await publishHome({ client, userId: body.user.id }, deps, logger);
    } catch (e) {
      logger.error(`home add-watch submit failed: ${e}`);
    }
  };
}

/** Channel config modal submit → upsertSubscription → re-publish. */
export function makeChannelConfigSubmit(deps) {
  return async ({ ack, body, view, client, logger }) => {
    const channelId = view.private_metadata;
    const committees = (view.state.values.cfg_committees?.home_committees?.selected_options ?? []).map((o) => o.value);
    const keywords = (view.state.values.cfg_keywords?.value?.value ?? '')
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    const language = view.state.values.cfg_language?.value?.selected_option?.value ?? 'en';

    if (committees.length === 0 && keywords.length === 0) {
      await ack({
        response_action: 'errors',
        errors: { cfg_committees: 'Pick at least one committee or add a keyword — otherwise this channel gets no alerts.' },
      });
      return;
    }
    await ack();
    try {
      await deps.upsertSubscription({ channelId, committees, keywords, language });
      await publishHome({ client, userId: body.user.id }, deps, logger);
    } catch (e) {
      logger.error(`home config submit failed: ${e}`);
    }
  };
}
```

```js
// agent/listeners/views/index.js  (full rewrite)
import { createHomeDeps } from '../../home/deps.js';
import { makeAddWatchSubmit, makeChannelConfigSubmit } from './home-modals.js';

/**
 * Register view listeners with the Bolt app.
 * @param {import('@slack/bolt').App} app
 * @returns {void}
 */
export function register(app) {
  const homeDeps = createHomeDeps(app.client);
  app.view('home_add_watch_modal', makeAddWatchSubmit(homeDeps));
  app.view('home_channel_config_modal', makeChannelConfigSubmit(homeDeps));
}
```

- [ ] **Step 7.4:** `node --test && npx @biomejs/biome check .` → PASS, clean
- [ ] **Step 7.5: Commit** — `feat(home): modal submissions with inline validation + re-publish (MOO-74)`

---

### Task 8: live verification (the MOO-74 checklist)

- [ ] **8.1:** `npx convex dev --once` (already pushed in Task 1) · deploy: `fly deploy -c fly.app.toml --remote-only` from the worktree root.
- [ ] **8.2:** Verify-state script run (`node scripts/moo-74-verify.mjs`, written during this task): `buildHomeState(createHomeDeps(...))` against real Convex/Slack — print the strip counts and assert they reconcile with `listUpcoming`/`listSubscriptions` raw rows. Paste output.
- [ ] **8.3 (human):** Open the App Home in the hackathon workspace — screenshot the strip + watches + #general config row.
- [ ] **8.4 (human):** Edit #general via the modal (e.g., toggle language) — confirm Convex row changed (`npx convex run subscriptions:getSubscription`), then toggle back. Add + remove a watch from the Home; paste before/after `listWatches`.
- [ ] **8.5:** Empty-state: render `homeView({strip:{...0}, watches:[], channels:[]})` via a one-off `views.publish` to a second user OR paste the unit-tested JSON + a staged screenshot — disclose as staged.
- [ ] **8.6:** `fly logs` healthy; PR; Linear → In Review w/ evidence; merge on approval; → Done.

---

## Self-review notes

- Every MOO-74 acceptance criterion maps: builder (T2), reads+publish (T1/T4/T5), strip (T4), watches section (T2/T6/T7), config rows + modal (T3/T6/T7), re-publish after mutations (T6/T7), `response_action: 'errors'` (T7), empty state (T2), graceful degradation (T4 name fallback, T5 static fallback, T6/T7 try/catch).
- Out of scope respected: no boundary select, no welcome message.
- Deleted-test honesty: the static-home tests die with the static home; replacements cover the new behavior (publish fallback keeps the old copy alive as degraded mode).
- Type consistency: `HomeState` shape identical in T2 tests, T4 return, T5 consumption. Action/callback ids identical across T2/T3 builders and T6/T7 registrations.
