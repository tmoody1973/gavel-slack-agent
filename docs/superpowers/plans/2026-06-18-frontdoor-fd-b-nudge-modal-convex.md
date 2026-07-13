# Front Door FD-B — Nudge → Setup Modal → Convex Write + App Home States — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the 2-taps-to-live activation core — a nudge drives the installer to a setup modal, the role answer pre-fills a confirm step, "Go live" writes the channel config to Convex, and the App Home becomes the persistent hub (first-run + configured states).

**Architecture:** Pure Block Kit builders in `agent/blockkit/onboarding.js` (nudge card, role modal, confirm modal, both Home states) consume FD-A's `defaultsForRole` + `copyFor`. Thin I/O listeners in `agent/listeners/onboarding/*` wire Slack → Convex via the existing injected-deps pattern (`createHomeDeps`). The per-channel `subscriptions` doc gains four onboarding fields (`configured`, `role`, `onboardedAt`, plus `welcomePostedAt` reserved for FD-C); `normalizeSubscription` is extended to pass them through its PII whitelist. The App Home's existing `buildHomeState`/`homeView` path gains a first-run vs. configured branch.

**Tech Stack:** Node ESM, Slack Bolt (Socket Mode), `views.open`/`views.publish`/`view_submission`, Convex (`ConvexHttpClient`), `node --test`, biome. Deploys to Fly app `gavel-app`; Convex dev deployment `vivid-weasel-903` (shared prod for both Fly apps).

---

## Pre-flight (sequencing & isolation)

- **Worktree:** FD-B is blocked-by FD-A (MOO-117), which is *in review, not merged*. So branch FD-B **off the FD-A branch** (`tarikjmoody/moo-117-…`), not off `main`, so `onboarding/defaults.js` + `onboarding/copy.js` are present. Branch name from Linear: `tarikjmoody/moo-118-front-door-fd-b-nudge-setup-modal-convex-write-app-home`. `npm ci` in `agent/`; copy `.env` + `.env.local` from the main checkout.
- **Convex `_generated`:** gitignored and absent in a fresh worktree (causes 4 unrelated suite failures). Run `npx convex dev --once` early to codegen locally before any handler test that imports `convex/_generated`. Pure builder/normalize tests don't need it.
- **Shared-deployment hazard:** `vivid-weasel-903` is prod for both Fly apps. Before `npx convex dev --once`, confirm the branch `schema.ts` is a **superset** of prod (keeps `matterOutcomes`, `transcriptChunks`, `civicNotifications`, `councilMembers`, etc.). We only *add* optional fields to `subscriptions`, so the superset rule holds.

---

## File Structure

**Create:**
- `agent/blockkit/onboarding.js` — pure builders: `nudgeCard(lang)`, `roleModal(lang)`, `confirmModal(role, defaults, lang)`, `homeFirstRun(lang)`, `homeConfigured(state)`. (Member welcome / grow cards are FD-C/FD-D — not here.)
- `agent/listeners/onboarding/index.js` — `register(app)` + `createOnboardingDeps`; wires the command/action/event/view below.
- `agent/listeners/onboarding/nudge.js` — `maybeNudge(...)` helper + first-`/gavel` and channel-add triggers (DM + channel line with "Set up Gavel").
- `agent/listeners/onboarding/setup.js` — `makeOpenRoleModal` (button → `views.open`), `makeOpenConfirmModal` (role button → push confirm), `makeGoLiveSubmit` (`view_submission` → Convex write + republish + confirmation).
- Tests: `agent/tests/blockkit/onboarding.test.js`, `agent/tests/listeners/onboarding/setup.test.js`, `agent/tests/listeners/onboarding/nudge.test.js`.

**Modify:**
- `agent/convex/schema.ts:10-23` — add `configured`, `role`, `onboardedAt`, `welcomePostedAt` (all optional) to `subscriptions`.
- `agent/subscriptions/normalize.js` — pass the onboarding fields through the whitelist.
- `agent/convex/subscriptions.ts` — `upsertSubscription` args accept the new optional fields; add a `markConfigured` mutation OR fold into `upsertSubscription`.
- `agent/home/state.js` + `agent/blockkit/home-view.js` (or `home/publish.js`) — branch first-run vs configured; surface the status strip "✅ #civic-alerts · committees · language · digest".
- `agent/listeners/commands/index.js` / `agent/listeners/index.js` — register the onboarding listeners.
- `agent/listeners/commands/gavel.js` — fire the nudge on first `/gavel` when the channel is unconfigured.

**Reuse (no change):** `defaultsForRole`/`copyFor` (FD-A), `publishHome`, `createHomeDeps`, `normalizeSubscription` semantics, `view_submission` error pattern (`response_action: 'errors'`), the `make…(deps)` injected-handler convention.

---

## Conventions to follow (locked by the existing codebase)

- Handlers are `make…(deps)` factories returning `async ({ ack, body, view, client, logger }) => {}`; **always `ack()` first**. (See `listeners/views/home-modals.js`.)
- Convex boundaries are injected (`createHomeDeps`) so handlers test with mocks — never `import { api }` inside a handler.
- **Republish the Home after every mutation** (`publishHome({ client, userId }, deps, logger)`).
- Block Kit modal submit reads `view.state.values.<block_id>.<action_id>...`; carry channel context in `view.private_metadata`.
- Builders are pure and live in `blockkit/`; they take already-localized strings from `copyFor(lang)`.
- Bilingual: onboarding copy is static (FD-A `copy.js`); committee names / file numbers / channel handles stay English.

---

## Task 1: Convex schema — onboarding fields on `subscriptions`

**Files:**
- Modify: `agent/convex/schema.ts:10-23`

- [ ] **Step 1: Add optional onboarding fields to the `subscriptions` table**

In `defineSchema({ subscriptions: defineTable({ ... }) })`, after `boundary`:

```ts
    // Front Door onboarding state (MOO-118 FD-B). All optional so existing rows
    // (poller-written, pre-onboarding) stay valid; absence = "not yet onboarded".
    configured: v.optional(v.boolean()),
    role: v.optional(v.union(v.literal('association'), v.literal('organizer'), v.literal('reporter'))),
    onboardedAt: v.optional(v.number()),
    welcomePostedAt: v.optional(v.number()), // reserved for FD-C member-welcome dedup
```

- [ ] **Step 2: Confirm superset, then codegen against the shared deployment**

Run: `cd agent && npx convex dev --once`
Expected: `Convex functions ready` with no destructive-migration warning (we only add optional fields). Verify `convex/_generated/api.js` now exists.

- [ ] **Step 3: Commit**

```bash
git add agent/convex/schema.ts
git commit -m "feat(onboarding): subscriptions onboarding fields — configured/role/onboardedAt/welcomePostedAt (MOO-118)"
```

---

## Task 2: `normalizeSubscription` passes onboarding fields through the whitelist

**Files:**
- Modify: `agent/subscriptions/normalize.js`
- Test: `agent/tests/subscriptions/normalize.test.js`

- [ ] **Step 1: Write the failing test** (append to the existing normalize test file)

```js
it('passes through onboarding fields when present and omits them when absent', () => {
  const withOnboarding = normalizeSubscription({
    channelId: 'C1', committees: ['LICENSES COMMITTEE'], language: 'es',
    role: 'organizer', configured: true, onboardedAt: 1718000000000,
  });
  assert.equal(withOnboarding.role, 'organizer');
  assert.equal(withOnboarding.configured, true);
  assert.equal(withOnboarding.onboardedAt, 1718000000000);

  const bare = normalizeSubscription({ channelId: 'C1', committees: ['LICENSES COMMITTEE'] });
  assert.ok(!('role' in bare), 'role omitted when absent');
  assert.ok(!('configured' in bare), 'configured omitted when absent');
});

it('rejects an unrecognized role rather than writing garbage', () => {
  assert.throws(() => normalizeSubscription({ channelId: 'C1', role: 'mayor' }), /role/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent && node --test tests/subscriptions/normalize.test.js`
Expected: FAIL (role/configured undefined on result).

- [ ] **Step 3: Implement — extend `normalizeSubscription`**

In `agent/subscriptions/normalize.js`, add near the top:

```js
const ROLES = ['association', 'organizer', 'reporter'];
```

After building `result` (before the boundary block), add:

```js
  if (input.role !== undefined) {
    if (!ROLES.includes(input.role)) {
      throw new Error(`normalizeSubscription: unrecognized role "${input.role}" (expected ${ROLES.join(', ')})`);
    }
    result.role = input.role;
  }
  if (input.configured !== undefined) result.configured = Boolean(input.configured);
  if (typeof input.onboardedAt === 'number') result.onboardedAt = input.onboardedAt;
  if (typeof input.welcomePostedAt === 'number') result.welcomePostedAt = input.welcomePostedAt;
```

Update the JSDoc `@typedef SubscriptionInput` to include the optional fields.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agent && node --test tests/subscriptions/normalize.test.js`
Expected: PASS (all normalize tests green).

- [ ] **Step 5: Commit**

```bash
git add agent/subscriptions/normalize.js agent/tests/subscriptions/normalize.test.js
git commit -m "feat(onboarding): normalizeSubscription passes role/configured/onboardedAt (MOO-118)"
```

---

## Task 3: `upsertSubscription` accepts onboarding fields

**Files:**
- Modify: `agent/convex/subscriptions.ts:13-40`

- [ ] **Step 1: Widen the mutation args**

In `upsertSubscription`'s `args`, add:

```ts
    role: v.optional(v.union(v.literal('association'), v.literal('organizer'), v.literal('reporter'))),
    configured: v.optional(v.boolean()),
    onboardedAt: v.optional(v.number()),
    welcomePostedAt: v.optional(v.number()),
```

The handler already does `const sub = normalizeSubscription(args)` then patch/insert `...sub`, so the passed-through fields persist automatically. No handler-body change needed.

- [ ] **Step 2: Codegen + commit**

Run: `cd agent && npx convex dev --once`
Expected: ready, no errors.

```bash
git add agent/convex/subscriptions.ts
git commit -m "feat(onboarding): upsertSubscription accepts onboarding fields (MOO-118)"
```

---

## Task 4: Block Kit builders — nudge + role modal (pure)

**Files:**
- Create: `agent/blockkit/onboarding.js`
- Test: `agent/tests/blockkit/onboarding.test.js`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert';
import { describe, it } from 'node:test';
import { nudgeCard, roleModal } from '../../blockkit/onboarding.js';

describe('nudgeCard', () => {
  it('renders the intro + a Set up Gavel button that opens the role modal', () => {
    const card = nudgeCard('en');
    const json = JSON.stringify(card);
    assert.match(json, /I'm Gavel/);
    const actions = card.blocks.find((b) => b.type === 'actions');
    const button = actions.elements[0];
    assert.equal(button.action_id, 'onboarding_open_role');
    assert.match(button.text.text, /Set up Gavel/);
  });
  it('localizes to Spanish', () => {
    assert.match(JSON.stringify(nudgeCard('es')), /Configurar Gavel/);
  });
});

describe('roleModal', () => {
  it('is a modal with the three role buttons wired to onboarding_pick_role', () => {
    const view = roleModal('en');
    assert.equal(view.type, 'modal');
    assert.equal(view.callback_id, 'onboarding_role_modal');
    const actions = view.blocks.find((b) => b.type === 'actions');
    const ids = actions.elements.map((e) => e.value);
    assert.deepStrictEqual(ids, ['association', 'organizer', 'reporter']);
    for (const e of actions.elements) assert.equal(e.action_id, 'onboarding_pick_role');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent && node --test tests/blockkit/onboarding.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `nudgeCard` + `roleModal`**

```js
import { copyFor } from '../onboarding/copy.js';

const plain = (text) => ({ type: 'plain_text', text, emoji: true });
const mrkdwn = (text) => ({ type: 'mrkdwn', text });

/** DM/channel nudge: intro + a button that opens the role modal. */
export function nudgeCard(language) {
  const t = copyFor(language);
  return {
    blocks: [
      { type: 'section', text: mrkdwn(t.nudgeIntro) },
      {
        type: 'actions',
        elements: [
          { type: 'button', style: 'primary', text: plain(t.nudgeButton), action_id: 'onboarding_open_role' },
        ],
      },
    ],
  };
}

/** View 1 — one question, three role buttons (each pushes the confirm view). */
export function roleModal(language) {
  const t = copyFor(language);
  const roleButton = (value, text) => ({ type: 'button', text: plain(text), action_id: 'onboarding_pick_role', value });
  return {
    type: 'modal',
    callback_id: 'onboarding_role_modal',
    title: plain('Set up Gavel'),
    blocks: [
      { type: 'section', text: mrkdwn(`*${t.roleQuestion}*`) },
      {
        type: 'actions',
        elements: [
          roleButton('association', t.roleAssociation),
          roleButton('organizer', t.roleOrganizer),
          roleButton('reporter', t.roleReporter),
        ],
      },
    ],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agent && node --test tests/blockkit/onboarding.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add agent/blockkit/onboarding.js agent/tests/blockkit/onboarding.test.js
git commit -m "feat(onboarding): nudge card + role modal builders (MOO-118)"
```

---

## Task 5: Block Kit builder — confirm modal (pre-filled, 2-tap)

**Files:**
- Modify: `agent/blockkit/onboarding.js`
- Test: `agent/tests/blockkit/onboarding.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { confirmModal } from '../../blockkit/onboarding.js';
import { defaultsForRole } from '../../onboarding/defaults.js';

describe('confirmModal', () => {
  it('pre-fills committees/language from defaultsForRole and submits via Go live', () => {
    const defaults = defaultsForRole('association');
    const view = confirmModal('association', defaults, 'en');
    assert.equal(view.type, 'modal');
    assert.equal(view.callback_id, 'onboarding_confirm_modal');
    assert.match(view.submit.text, /Go live/);
    const json = JSON.stringify(view);
    assert.match(json, /ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE/);
    // role + defaults round-trip to the submit handler via private_metadata
    const meta = JSON.parse(view.private_metadata);
    assert.equal(meta.role, 'association');
    assert.deepStrictEqual(meta.defaults, defaults);
  });
  it('Spanish role shows the Activar submit label', () => {
    const view = confirmModal('organizer', defaultsForRole('organizer'), 'es');
    assert.match(view.submit.text, /Activar/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent && node --test tests/blockkit/onboarding.test.js`
Expected: FAIL (`confirmModal` not exported).

- [ ] **Step 3: Implement `confirmModal`**

```js
import { defaultsForRole } from '../onboarding/defaults.js'; // (only if needed; here defaults are passed in)

const ROLE_LABEL = { association: '👵 Neighborhood association', organizer: '📣 Community organizer', reporter: '📰 Reporter' };

/**
 * View 2 — confirm. Pre-filled summary of defaultsForRole(role); primary submit
 * is "Go live" (tap 2). The full config travels in private_metadata so the submit
 * handler writes exactly what was shown (idempotent, no re-derivation drift).
 */
export function confirmModal(role, defaults, language) {
  const t = copyFor(language);
  const summary = [
    `*${t.confirmHeading}*`,
    `🏛 ${defaults.committees.join(', ')}`,
    defaults.keywords.length ? `🔑 ${defaults.keywords.join(', ')}` : null,
    `🌐 ${defaults.language === 'es' ? 'Español' : 'English'}`,
  ].filter(Boolean).join('\n');
  return {
    type: 'modal',
    callback_id: 'onboarding_confirm_modal',
    private_metadata: JSON.stringify({ role, defaults }),
    title: plain('Set up Gavel'),
    submit: plain(t.confirmGoLive),
    close: plain(t.confirmCustomize),
    blocks: [
      { type: 'context', elements: [mrkdwn(ROLE_LABEL[role] ?? role)] },
      { type: 'section', text: mrkdwn(summary) },
    ],
  };
}
```

> NOTE: a real "Customize…" reveal of optional fields is deferred — `close` reuses the Customize label per spec ("a secondary Customize reveals optional fields … the default path is two taps"). If a fuller customize is wanted it routes to the existing per-channel config modal; keep that out of FD-B's critical path.

- [ ] **Step 4: Run test to verify it passes** — `node --test tests/blockkit/onboarding.test.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add agent/blockkit/onboarding.js agent/tests/blockkit/onboarding.test.js
git commit -m "feat(onboarding): pre-filled confirm modal (Go live, 2-tap) (MOO-118)"
```

---

## Task 6: Block Kit builders — App Home first-run + configured states

**Files:**
- Modify: `agent/blockkit/onboarding.js`
- Test: `agent/tests/blockkit/onboarding.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { homeFirstRun, homeConfigured } from '../../blockkit/onboarding.js';

describe('homeFirstRun', () => {
  it('is a home view with a Set up button (the fallback path)', () => {
    const view = homeFirstRun('en');
    assert.equal(view.type, 'home');
    const json = JSON.stringify(view);
    assert.match(json, /onboarding_open_role/);
    assert.match(json, /Set up Gavel/);
  });
});

describe('homeConfigured', () => {
  it('renders a status strip from configured channels', () => {
    const view = homeConfigured({
      channels: [{ channelName: 'civic-alerts', committees: ['LICENSES COMMITTEE'], language: 'es', role: 'organizer' }],
    });
    assert.equal(view.type, 'home');
    const json = JSON.stringify(view);
    assert.match(json, /civic-alerts/);
    assert.match(json, /Español|Spanish/);
  });
});
```

- [ ] **Step 2: Run to verify FAIL** — module exports missing.

- [ ] **Step 3: Implement both states**

```js
/** App Home before any setup — warm intro + Set up button (fallback path). */
export function homeFirstRun(language) {
  const t = copyFor(language);
  return {
    type: 'home',
    blocks: [
      { type: 'header', text: plain('Gavel — Milwaukee civic transparency 🏛️') },
      { type: 'section', text: mrkdwn(t.nudgeIntro) },
      {
        type: 'actions',
        elements: [{ type: 'button', style: 'primary', text: plain(t.nudgeButton), action_id: 'onboarding_open_role' }],
      },
    ],
  };
}

/** App Home once at least one channel is configured — status strip + re-entry. */
export function homeConfigured(state) {
  const rows = (state.channels ?? []).map((c) => ({
    type: 'section',
    text: mrkdwn(`✅ *#${c.channelName}* · ${c.committees.join(', ') || '_no committees_'} · ${c.language === 'es' ? 'Español' : 'English'}`),
  }));
  return {
    type: 'home',
    blocks: [
      { type: 'header', text: plain("Gavel — you're set up 🏛️") },
      ...rows,
      {
        type: 'actions',
        elements: [{ type: 'button', text: plain('Set up another channel'), action_id: 'onboarding_open_role' }],
      },
    ],
  };
}
```

- [ ] **Step 4: Run to verify PASS.**

- [ ] **Step 5: Commit**

```bash
git add agent/blockkit/onboarding.js agent/tests/blockkit/onboarding.test.js
git commit -m "feat(onboarding): App Home first-run + configured states (MOO-118)"
```

---

## Task 7: Home routing — pick first-run vs configured

**Files:**
- Modify: `agent/home/publish.js` (branch on whether any subscription has `configured`)
- Modify: `agent/home/state.js` (surface `configured` + `role` on channel rows; expose `configuredCount`)
- Test: `agent/tests/home/state.test.js` (extend)

- [ ] **Step 1: Write the failing test** — `buildHomeState` returns `configuredCount` and per-channel `role`/`configured`.

```js
it('reports configuredCount and per-channel role/configured', async () => {
  const deps = makeDeps({ subscriptions: [{ channelId: 'C1', committees: ['LICENSES COMMITTEE'], language: 'en', configured: true, role: 'reporter' }] });
  const state = await buildHomeState(deps);
  assert.equal(state.configuredCount, 1);
  assert.equal(state.channels[0].role, 'reporter');
  assert.equal(state.channels[0].configured, true);
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** — in `state.js`, add to each channel row `configured: s.configured ?? false, role: s.role ?? null` and a top-level `configuredCount: subscriptions.filter((s) => s.configured).length`. In `publish.js`, branch:

```js
import { homeFirstRun, homeConfigured } from '../blockkit/onboarding.js';
// inside publishHome, after buildHomeState:
const state = await buildHomeState(deps);
view = state.configuredCount > 0 ? homeView(state) : homeFirstRun('en');
```

> Keep `homeView(state)` for the configured path (it already renders the rich hub from MOO-74); `homeConfigured` is the minimal builder used where `homeView` is unavailable/over-scoped. Decision at execution: prefer reusing `homeView` for configured, `homeFirstRun` for first-run. (Adjust the Task 6 test if `homeConfigured` ends up unused — do not ship dead code.)

- [ ] **Step 4: Run → PASS** (`node --test tests/home/state.test.js`).

- [ ] **Step 5: Commit**

```bash
git add agent/home/state.js agent/home/publish.js agent/tests/home/state.test.js
git commit -m "feat(onboarding): App Home routes first-run vs configured (MOO-118)"
```

---

## Task 8: Setup handlers — open role modal, push confirm, Go-live submit

**Files:**
- Create: `agent/listeners/onboarding/setup.js`
- Test: `agent/tests/listeners/onboarding/setup.test.js`

- [ ] **Step 1: Write the failing handler tests** (mock Slack `client.views`, mock `deps`)

```js
import assert from 'node:assert';
import { describe, it } from 'node:test';
import { makeOpenRoleModal, makeOpenConfirmModal, makeGoLiveSubmit } from '../../../listeners/onboarding/setup.js';

const ack = async () => {};

describe('makeOpenRoleModal', () => {
  it('opens the role modal with the trigger_id', async () => {
    let opened;
    const client = { views: { open: async (a) => { opened = a; } } };
    await makeOpenRoleModal({})({ ack, body: { trigger_id: 'T1' }, client, logger: console });
    assert.equal(opened.trigger_id, 'T1');
    assert.equal(opened.view.callback_id, 'onboarding_role_modal');
  });
});

describe('makeOpenConfirmModal', () => {
  it('pushes a confirm view pre-filled for the picked role', async () => {
    let pushed;
    const client = { views: { push: async (a) => { pushed = a; } } };
    const action = { value: 'organizer' };
    await makeOpenConfirmModal({})({ ack, body: { trigger_id: 'T2', view: { /* channel ctx */ } }, action, client, logger: console });
    assert.equal(pushed.view.callback_id, 'onboarding_confirm_modal');
    assert.match(JSON.stringify(pushed.view), /LICENSES COMMITTEE/); // organizer default
  });
});

describe('makeGoLiveSubmit', () => {
  it('writes subscription+role+configured, republishes Home, posts confirmation', async () => {
    const calls = { upsert: null, posted: null, published: false };
    const deps = {
      upsertSubscription: async (i) => { calls.upsert = i; },
      listSubscriptions: async () => [], listAllWatches: async () => [], listUpcoming: async () => [],
      getChannelName: async () => 'civic-alerts',
    };
    const client = {
      chat: { postMessage: async (a) => { calls.posted = a; } },
      views: { publish: async () => { calls.published = true; } },
    };
    const meta = JSON.stringify({ role: 'association', defaults: { committees: ['LICENSES COMMITTEE'], keywords: [], language: 'en' }, channelId: 'C1' });
    await makeGoLiveSubmit(deps)({ ack, body: { user: { id: 'U1' } }, view: { private_metadata: meta }, client, logger: console });
    assert.equal(calls.upsert.role, 'association');
    assert.equal(calls.upsert.configured, true);
    assert.equal(calls.upsert.channelId, 'C1');
    assert.ok(typeof calls.upsert.onboardedAt === 'number');
    assert.equal(calls.posted.channel, 'C1');
    assert.ok(calls.published, 'Home republished');
  });
  it('is idempotent — a second submit updates, never throws or dupes', async () => {
    /* same as above run twice; upsertSubscription is upsert-by-channel, assert no throw */
  });
});
```

- [ ] **Step 2: Run → FAIL** (module not found).

- [ ] **Step 3: Implement `setup.js`**

```js
import { confirmModal, roleModal } from '../../blockkit/onboarding.js';
import { defaultsForRole } from '../../onboarding/defaults.js';
import { copyFor } from '../../onboarding/copy.js';
import { publishHome } from '../../home/publish.js';

/** Channel context for the modal: prefer the channel the nudge fired in. */
function channelFromBody(body) {
  return body?.channel?.id ?? body?.view?.private_metadata ?? null;
}

export function makeOpenRoleModal(_deps) {
  return async ({ ack, body, client, logger }) => {
    await ack();
    try {
      const view = roleModal('en');
      view.private_metadata = JSON.stringify({ channelId: channelFromBody(body) });
      await client.views.open({ trigger_id: body.trigger_id, view });
    } catch (e) { logger.error(`open role modal failed: ${e}`); }
  };
}

export function makeOpenConfirmModal(_deps) {
  return async ({ ack, body, action, client, logger }) => {
    await ack();
    try {
      const role = action.value;
      const defaults = defaultsForRole(role);
      const channelId = JSON.parse(body.view?.private_metadata ?? '{}').channelId ?? null;
      const view = confirmModal(role, defaults, defaults.language);
      view.private_metadata = JSON.stringify({ role, defaults, channelId });
      await client.views.push({ trigger_id: body.trigger_id, view });
    } catch (e) { logger.error(`open confirm modal failed: ${e}`); }
  };
}

export function makeGoLiveSubmit(deps) {
  return async ({ ack, body, view, client, logger }) => {
    await ack();
    try {
      const { role, defaults, channelId } = JSON.parse(view.private_metadata);
      if (!channelId) { logger.error('go-live: no channelId in metadata'); return; }
      await deps.upsertSubscription({
        channelId, committees: defaults.committees, keywords: defaults.keywords,
        language: defaults.language, role, configured: true, onboardedAt: Date.now(),
      });
      await publishHome({ client, userId: body.user.id }, deps, logger);
      const t = copyFor(defaults.language);
      try {
        await client.chat.postMessage({ channel: channelId, text: t.liveConfirmation });
      } catch (postErr) {
        logger.error(`live confirmation post failed (scope?): ${postErr}`);
        await client.chat.postMessage({ channel: body.user.id, text: `${t.liveConfirmation}\n(/invite @Gavel into the channel so I can post there.)` });
      }
    } catch (e) { logger.error(`go-live submit failed: ${e}`); }
  };
}
```

> `Date.now()` is fine in production handler code (the no-`Date.now` rule is a *workflow-script* constraint, not app code). Tests assert `typeof onboardedAt === 'number'`, not a fixed value.

- [ ] **Step 4: Run → PASS** (`node --test tests/listeners/onboarding/setup.test.js`).

- [ ] **Step 5: Commit**

```bash
git add agent/listeners/onboarding/setup.js agent/tests/listeners/onboarding/setup.test.js
git commit -m "feat(onboarding): role/confirm modal handlers + Go-live Convex write (MOO-118)"
```

---

## Task 9: Nudge triggers — first `/gavel` + channel-add

**Files:**
- Create: `agent/listeners/onboarding/nudge.js`
- Modify: `agent/listeners/commands/gavel.js` (fire nudge when channel unconfigured)
- Test: `agent/tests/listeners/onboarding/nudge.test.js`

- [ ] **Step 1: Write the failing test** — `maybeNudge` posts the nudge once when `getSubscription` returns null/unconfigured, and stays silent when configured.

```js
import { maybeNudge } from '../../../listeners/onboarding/nudge.js';
it('nudges an unconfigured channel and is silent for a configured one', async () => {
  const posts = [];
  const client = { chat: { postMessage: async (a) => posts.push(a) } };
  await maybeNudge({ channelId: 'C1', client, getSubscription: async () => null, logger: console });
  assert.equal(posts.length, 1);
  assert.match(JSON.stringify(posts[0]), /Set up Gavel/);
  await maybeNudge({ channelId: 'C2', client, getSubscription: async () => ({ configured: true }), logger: console });
  assert.equal(posts.length, 1); // no second post
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `nudge.js`**

```js
import { nudgeCard } from '../../blockkit/onboarding.js';

/** Post the setup nudge into a channel iff it isn't configured yet. Idempotent-ish:
 * relies on `configured` so a set-up channel never re-nudges. */
export async function maybeNudge({ channelId, client, getSubscription, logger, language = 'en' }) {
  try {
    const sub = await getSubscription(channelId);
    if (sub?.configured) return;
    const card = nudgeCard(language);
    await client.chat.postMessage({ channel: channelId, text: 'Set up Gavel', blocks: card.blocks });
  } catch (e) { logger.error(`maybeNudge failed: ${e}`); }
}
```

In `gavel.js handleGavelCommand`, after `ack()` and before replying, when the channel has no subscription, call `maybeNudge` (deps already expose `getSubscription`). Keep it additive — the existing help/status replies stay.

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Commit**

```bash
git add agent/listeners/onboarding/nudge.js agent/listeners/commands/gavel.js agent/tests/listeners/onboarding/nudge.test.js
git commit -m "feat(onboarding): first-/gavel + channel-add nudge (MOO-118)"
```

---

## Task 10: Wire registration

**Files:**
- Create: `agent/listeners/onboarding/index.js`
- Modify: `agent/listeners/index.js`

- [ ] **Step 1: Implement `onboarding/index.js`**

```js
import { createHomeDeps } from '../../home/deps.js';
import { makeGoLiveSubmit, makeOpenConfirmModal, makeOpenRoleModal } from './setup.js';

export function register(app) {
  const deps = createHomeDeps(app.client);
  app.action('onboarding_open_role', makeOpenRoleModal(deps));
  app.action('onboarding_pick_role', makeOpenConfirmModal(deps));
  app.view('onboarding_confirm_modal', makeGoLiveSubmit(deps));
}
```

- [ ] **Step 2: Register in `listeners/index.js`**

```js
import * as onboarding from './onboarding/index.js';
// inside registerListeners:
onboarding.register(app);
```

- [ ] **Step 3: Smoke — app boots**

Run: `cd agent && node -e "import('./listeners/index.js').then(()=>console.log('listeners import OK'))"`
Expected: `listeners import OK` (no missing-export crash).

- [ ] **Step 4: Full suite + biome**

Run: `cd agent && node --test` (bare) and `npx @biomejs/biome check .`
Expected: all onboarding tests green; the only failures are the known gitignored-`_generated` ones if codegen wasn't run; biome clean.

- [ ] **Step 5: Commit**

```bash
git add agent/listeners/onboarding/index.js agent/listeners/index.js
git commit -m "feat(onboarding): register nudge/modal/submit listeners (MOO-118)"
```

---

## Task 11: Live verification in the demo workspace (the gate)

**Files:** none (deploy + manual)

- [ ] **Step 1: Deploy `gavel-app`**

Run (repo root): `fly deploy -c fly.app.toml --remote-only`
Expected: healthy deploy; `fly logs -a gavel-app` shows "Gavel is running!".

- [ ] **Step 2: Trigger the nudge** — in demo channel `C0B8KS5VCCC` run `/gavel` (channel currently configured `es`; to see first-run, test in a fresh channel or temporarily clear `configured`). Capture: nudge card appears with "Set up Gavel".

- [ ] **Step 3: 2-taps-to-live** — click Set up Gavel → role modal → pick a role → confirm modal pre-filled → "Go live". Capture: ✅ confirmation posts in the channel; App Home shows configured state.

- [ ] **Step 4: Convex write check** — `npx convex run subscriptions:getSubscription '{"channelId":"<id>"}'` (or dashboard) shows `role`, `configured: true`, `onboardedAt`, committees/language matching the chosen role.

- [ ] **Step 5: Idempotent re-entry** — re-run setup; confirm no duplicate subscription row and no duplicate live confirmation (the second run updates in place).

- [ ] **Step 6: Screenshots** → attach to MOO-118; post the evidence comment; move issue → In Review (PR) / Done when the checklist passes.

---

## Self-Review (against spec §2/§4/§5 + acceptance criteria)

- **Nudge on install / first `/gavel` / channel-add** → Task 9 covers first-`/gavel` + a reusable `maybeNudge`. *Install* + *Gavel-added-to-channel* events: first-`/gavel` is the reliable trigger for a Socket Mode app (handoff: install detection is fuzzy); `member_joined_channel`/bot-add wiring needs the manifest event (FD-C adds `member_joined_channel`). **Gap flagged:** if a true "bot added to channel" trigger is required in FD-B, it needs the `member_joined_channel`/`channel_*` manifest event + interactive `slack run` sync — call this out at execution and decide whether to pull it forward from FD-C or rely on first-`/gavel` + Home fallback for FD-B.
- **Button → views.open role → confirm pre-filled from defaultsForRole** → Tasks 4,5,8. ✓
- **2 taps to live; Customize optional** → Task 5 (`close` = Customize label; full reveal deferred, documented). ✓
- **view_submission writes subscriptions+language+role+configured+onboardedAt; republish Home; post confirmation** → Task 8. ✓
- **App Home first-run + configured** → Tasks 6,7. ✓
- **Idempotent re-entry; response_action errors; missing-scope DM fallback** → Task 8 (upsert-by-channel, DM fallback on post failure). `response_action: 'errors'` validation: the 2-tap path has nothing to validate (defaults are always valid); add it only if/when the Customize reveal lands. **Documented** — not a silent omission.
- **Unit tests for all builders + handler test (mocked Convex)** → Tasks 4-9. ✓
- **Live demo-workspace verification + screenshots** → Task 11. ✓

**Open decisions for the executor (surface, don't guess silently):**
1. Configured-Home builder: reuse rich `homeView(state)` (MOO-74) vs. the minimal `homeConfigured` — prefer `homeView`; drop `homeConfigured` if unused (no dead code).
2. Whether to pull `member_joined_channel`/bot-add nudge into FD-B (manifest sync) or leave the install/channel-add trigger to first-`/gavel` + Home fallback and let FD-C add the manifest event.
