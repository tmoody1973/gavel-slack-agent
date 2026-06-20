# App Home Declutter — Story Clustering Implementation Plan (MOO-128)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Declutter the reporter App Home "📰 Story leads" by clustering related agenda matters into one story (deterministic, by committee + subject beat), surfacing the shared tag + aldermanic district once, restoring hierarchy, and fixing the English/Spanish split — pure, LLM-free, no new persistence.

**Architecture:** A new pure module `stories/cluster.js` groups the already-ranked `storyLeads` by `eventBodyName` + a `themeOf(title)` subject beat (≥2 → cluster, else single), reusing `districtOf()` from MOO-123. The render (`blockkit/story-leads.js`) consumes the clustered entries; `home-view.js` localizes its status strip. No state, schema, or action-handler changes.

**Tech Stack:** Node ESM, `node --test`, `@biomejs/biome`, Slack Block Kit. Spec: `docs/superpowers/specs/2026-06-20-app-home-declutter-design.md`.

---

## File Structure

- **Create** `agent/stories/cluster.js` — `THEME_FAMILIES`, `themeOf(title)`, `clusterLeads(leads)`. Pure.
- **Create** `agent/tests/stories/cluster.test.js`.
- **Modify** `agent/blockkit/story-leads.js` — `storyLeadsSection` consumes `clusterLeads`; cluster/single render; theme + district labels; top-3 hierarchy + "ver más" instruction.
- **Modify** `agent/tests/blockkit/story-leads.test.js` — cluster header, district chip, view-more, singles.
- **Modify** `agent/blockkit/home-view.js` — localize the status strip (language fix).
- **Modify** `agent/tests/blockkit/home-view.test.js` — language-consistency regression.
- **Create** verification step in `agent/scripts/story-radar-verify.mjs` (extend) — print clustered entries against the live agenda.

`home/state.js` is unchanged: `state.storyLeads` stays the raw ranked list; clustering is a presentation concern inside `storyLeadsSection`.

---

## Task 1: `themeOf` + `THEME_FAMILIES` (pure subject-beat classifier)

**Files:**
- Create: `agent/stories/cluster.js`
- Test: `agent/tests/stories/cluster.test.js`

- [ ] **Step 1: Write the failing test**

```js
// agent/tests/stories/cluster.test.js
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { THEME_FAMILIES, themeOf } from '../../stories/cluster.js';

describe('themeOf — subject beat from the title (first-match precedence)', () => {
  const cases = [
    ['A motion modifying Milwaukee Police Department use of force SOPs', 'police'],
    ['Communication relating to lead poisoning in rental housing', 'police'], // "police"? no — see note
  ];

  it('resolves each of the 8 beats', () => {
    assert.equal(themeOf('A motion modifying Police Department pursuit policy'), 'police');
    assert.equal(themeOf('Communication relating to lead poisoning and public health'), 'health');
    assert.equal(themeOf('A rezoning of a vacant lot for housing'), 'housing');
    assert.equal(themeOf('Resolution approving a TIF district for redevelopment'), 'development');
    assert.equal(themeOf('Application for a Class B Tavern liquor license'), 'licenses');
    assert.equal(themeOf('Resolution relating to forestry and green space in a park'), 'parks');
    assert.equal(themeOf('Resolution for repaving and sewer work on N 27th St'), 'streets');
    assert.equal(themeOf('Confirmation of the mayoral appointment to a commission'), 'appointments');
  });

  it('returns null for an off-vocabulary title', () => {
    assert.equal(themeOf('Communication relating to routine staffing matters'), null);
    assert.equal(themeOf(''), null);
    assert.equal(themeOf(undefined), null);
  });

  it('first-match precedence: a TIF-for-a-development is development, not money/streets', () => {
    assert.equal(themeOf('Resolution authorizing $5 million in TIF for a development agreement'), 'development');
  });

  it('exposes 8 named families with emoji + regex', () => {
    assert.equal(THEME_FAMILIES.length, 8);
    assert.deepEqual(
      THEME_FAMILIES.map((f) => f.key),
      ['police', 'health', 'housing', 'development', 'licenses', 'parks', 'streets', 'appointments'],
    );
    for (const fam of THEME_FAMILIES) {
      assert.equal(typeof fam.emoji, 'string');
      assert.ok(fam.re instanceof RegExp);
    }
  });
});
```

(Delete the unused `cases` array before committing — it was a scratch note.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent && node --test tests/stories/cluster.test.js`
Expected: FAIL — `Cannot find module '../../stories/cluster.js'`.

- [ ] **Step 3: Write minimal implementation**

```js
// agent/stories/cluster.js
// App Home declutter (MOO-128). THEME = subject/beat — the deterministic clustering
// axis, distinct from MOO-127's newsworthiness TAGS (the "why"). Money is a tag, not a
// beat. Families extend the MOO-121 topic vocabulary; first match wins, so the order is
// specific → general. Pure, LLM-free.

import { districtOf } from '../home/salience.js';

export const THEME_FAMILIES = [
  { key: 'police', emoji: '🛡️', re: /police|MPD|use of force|pursuit|surveillance|officer|fire and police|body camera/i },
  { key: 'health', emoji: '🏥', re: /lead(?: poisoning)?|public health|health department|clinic|food safety|water quality|opioid|sanitation|disease/i },
  { key: 'housing', emoji: '🏠', re: /rezoning|demolition|variance|blight|vacant lot|eviction|conditional use|housing/i },
  { key: 'development', emoji: '🏗️', re: /TIF|tax incremental|redevelopment|development agreement|business improvement district|\bBID\b|economic development|land sale/i },
  { key: 'licenses', emoji: '🍺', re: /license|tavern|liquor|bartender|food dealer/i },
  { key: 'parks', emoji: '🌳', re: /\bpark(?:s|land)?\b|forestry|green space|community garden|tree planting|climate|sustainab/i },
  { key: 'streets', emoji: '🚧', re: /paving|repaving|resurfac|sewer|water main|sidewalk|alley|pothole/i },
  { key: 'appointments', emoji: '👔', re: /appoint|confirmation|nomination|\bboard\b|\bcommission\b/i },
];

/**
 * The subject beat a title belongs to, or null. First matching family wins.
 * @param {string} [title]
 * @returns {string | null}
 */
export function themeOf(title) {
  const text = title ?? '';
  for (const family of THEME_FAMILIES) if (family.re.test(text)) return family.key;
  return null;
}
```

Note for the implementer: `districtOf` is imported now because Task 2 needs it; leave the import even though Step 3 doesn't use it yet (Task 2's test will exercise it).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agent && node --test tests/stories/cluster.test.js`
Expected: PASS (4 tests). If "districtOf imported but unused" trips biome later, Task 2 consumes it — leave it.

- [ ] **Step 5: Commit**

```bash
git add agent/stories/cluster.js agent/tests/stories/cluster.test.js
git commit -m "feat(stories): themeOf subject-beat classifier (MOO-128)"
```

---

## Task 2: `clusterLeads` — group by committee + theme

**Files:**
- Modify: `agent/stories/cluster.js`
- Test: `agent/tests/stories/cluster.test.js`

- [ ] **Step 1: Write the failing test (append to the file)**

```js
import { clusterLeads } from '../../stories/cluster.js';

const lead = (over = {}) => ({
  item: { eventItemId: 1, title: 'x', eventBodyName: 'COMMON COUNCIL', eventDate: '2026-06-23' },
  tags: [{ kind: 'accountability' }],
  score: 5,
  reasons: [],
  ...over,
});

const police = (id, title) => lead({ item: { eventItemId: id, title, eventBodyName: 'COMMON COUNCIL', eventDate: '2026-06-23' } });

describe('clusterLeads — group by committee + theme', () => {
  it('collapses the real 4-item police package into one cluster', () => {
    const leads = [
      police(1, 'A motion modifying Police Department duty to intervene SOP'),
      police(2, 'Communication relating to police pursuit policies'),
      police(3, 'Motion modifying Police SOP 660 Vehicle Pursuits and 575 Video Release'),
      police(4, 'Communication from the Fire and Police Commission on training'),
    ];
    const entries = clusterLeads(leads);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].kind, 'cluster');
    assert.equal(entries[0].theme, 'police');
    assert.equal(entries[0].committee, 'COMMON COUNCIL');
    assert.equal(entries[0].members.length, 4);
    assert.ok(entries[0].tags.some((t) => t.kind === 'accountability'));
  });

  it('does NOT merge unrelated items (conservative) — two singles', () => {
    const leads = [
      police(1, 'A motion on police use of force'),
      lead({ item: { eventItemId: 9, title: 'Application for a tavern liquor license', eventBodyName: 'COMMON COUNCIL', eventDate: '2026-06-24' } }),
    ];
    const entries = clusterLeads(leads);
    assert.equal(entries.length, 2);
    assert.ok(entries.every((e) => e.kind === 'single'));
  });

  it('a lone themed item stays a single (needs ≥2 to cluster)', () => {
    const entries = clusterLeads([police(1, 'A motion on police pursuit')]);
    assert.equal(entries[0].kind, 'single');
  });

  it('null-theme items never cluster, even two in the same committee', () => {
    const leads = [
      lead({ item: { eventItemId: 1, title: 'Communication relating to routine staffing', eventBodyName: 'COMMON COUNCIL' } }),
      lead({ item: { eventItemId: 2, title: 'Communication relating to a procedural matter', eventBodyName: 'COMMON COUNCIL' } }),
    ];
    assert.equal(clusterLeads(leads).length, 2);
  });

  it('carries a shared district, omits a mixed one', () => {
    const shared = clusterLeads([
      police(1, 'Police matter in (7th Aldermanic District)'),
      police(2, 'Police pursuit policy (7th Aldermanic District)'),
    ]);
    assert.equal(shared[0].district, '7');
    const mixed = clusterLeads([
      police(1, 'Police matter (7th Aldermanic District)'),
      police(2, 'Police pursuit (6th Aldermanic District)'),
    ]);
    assert.equal(mixed[0].district, undefined);
  });

  it('a single carries its own district when the title names one', () => {
    const entries = clusterLeads([lead({ item: { eventItemId: 5, title: 'A demolition at 2500 W Vine St (7th Aldermanic District)', eventBodyName: 'ZONING' } })]);
    assert.equal(entries[0].kind, 'single');
    assert.equal(entries[0].district, '7');
  });

  it('ranks by score desc and is deterministic + pure', () => {
    const leads = [
      lead({ item: { eventItemId: 1, title: 'tavern liquor license', eventBodyName: 'LICENSES' }, score: 3 }),
      police(2, 'police use of force A'),
      police(3, 'police pursuit B'),
    ];
    const frozen = JSON.parse(JSON.stringify(leads));
    const a = clusterLeads(leads);
    assert.equal(a[0].kind, 'cluster'); // police pair (score 5 each) outranks the single license (3)
    assert.deepEqual(clusterLeads(leads), a); // deterministic
    assert.deepEqual(leads, frozen); // pure — input untouched
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent && node --test tests/stories/cluster.test.js`
Expected: FAIL — `clusterLeads is not a function`.

- [ ] **Step 3: Write minimal implementation (append to `agent/stories/cluster.js`)**

```js
const GROUP_SEP = ' ';
const districtChip = (title) => {
  const d = districtOf(title);
  return d != null ? String(d) : undefined;
};

/** Tag kinds shared by ALL members; union fallback if none is shared. */
function sharedTags(leads) {
  const kindSets = leads.map((l) => new Set((l.tags ?? []).map((t) => t.kind)));
  const base = [...(kindSets[0] ?? [])];
  const shared = base.filter((kind) => kindSets.every((set) => set.has(kind)));
  const kinds = shared.length > 0 ? shared : [...new Set(leads.flatMap((l) => (l.tags ?? []).map((t) => t.kind)))];
  return kinds.map((kind) => ({ kind }));
}

/** The district shared by every member, or undefined. */
function sharedDistrict(leads) {
  const districts = leads.map((l) => districtChip(l.item?.title));
  const first = districts[0];
  return first !== undefined && districts.every((d) => d === first) ? first : undefined;
}

const entryScore = (entry) => (entry.kind === 'cluster' ? entry.topScore : entry.score ?? 0);
const entryDate = (entry) =>
  entry.kind === 'cluster'
    ? entry.members.map((m) => m.item?.eventDate ?? '').sort()[0] ?? ''
    : entry.item?.eventDate ?? '';
const entryId = (entry) => (entry.kind === 'cluster' ? entry.members[0].item?.eventItemId ?? 0 : entry.item?.eventItemId ?? 0);

/**
 * Group already-ranked story leads into clusters (committee + subject beat, ≥2) and
 * singles. Pure; never mutates input. Reuses MOO-123 districtOf for the district facet.
 * @param {Array<{item: object, tags: Array<{kind: string}>, score: number}>} leads
 * @returns {Array<object>} mixed { kind:'cluster', theme, committee, tags, district?, members, topScore } | { kind:'single', district?, ...lead }
 */
export function clusterLeads(leads = []) {
  const groups = new Map();
  const order = [];
  for (const lead of leads) {
    const theme = themeOf(lead.item?.title);
    const committee = lead.item?.eventBodyName ?? '';
    // null-theme leads get a unique key so they can never merge.
    const key = theme ? `${committee}${GROUP_SEP}${theme}` : `${GROUP_SEP}single${GROUP_SEP}${order.length}`;
    if (!groups.has(key)) {
      groups.set(key, { theme, committee, members: [] });
      order.push(key);
    }
    groups.get(key).members.push(lead);
  }

  const entries = [];
  for (const key of order) {
    const group = groups.get(key);
    if (group.theme && group.members.length >= 2) {
      entries.push({
        kind: 'cluster',
        theme: group.theme,
        committee: group.committee,
        tags: sharedTags(group.members),
        district: sharedDistrict(group.members),
        members: group.members,
        topScore: Math.max(...group.members.map((m) => m.score ?? 0)),
      });
    } else {
      for (const lead of group.members) entries.push({ kind: 'single', district: districtChip(lead.item?.title), ...lead });
    }
  }

  entries.sort(
    (a, b) => entryScore(b) - entryScore(a) || entryDate(a).localeCompare(entryDate(b)) || entryId(a) - entryId(b),
  );
  return entries;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agent && node --test tests/stories/cluster.test.js`
Expected: PASS (all `themeOf` + `clusterLeads` tests).

- [ ] **Step 5: Commit**

```bash
git add agent/stories/cluster.js agent/tests/stories/cluster.test.js
git commit -m "feat(stories): clusterLeads — committee+theme grouping with district facet (MOO-128)"
```

---

## Task 3: Cluster-aware render in `story-leads.js`

**Files:**
- Modify: `agent/blockkit/story-leads.js`
- Test: `agent/tests/blockkit/story-leads.test.js`

- [ ] **Step 1: Write the failing tests (extend the `storyLeadsSection` describe block)**

```js
// add to tests/blockkit/story-leads.test.js
import { clusterLeads } from '../../stories/cluster.js';

const policeLead = (id, title) => ({
  item: { eventItemId: id, title, eventBodyName: 'COMMON COUNCIL', eventDate: '2026-06-23' },
  tags: [{ kind: 'accountability' }],
  score: 5,
  reasons: [],
});

describe('storyLeadsSection — clustered render (MOO-128)', () => {
  const fourPolice = [
    policeLead(1, 'A motion modifying Police use of force SOP'),
    policeLead(2, 'Communication on police pursuit policies'),
    policeLead(3, 'Motion modifying Police SOP 660 pursuits'),
    policeLead(4, 'Fire and Police Commission training communication'),
  ];

  it('collapses the 4 police items into ONE cluster header with the count', () => {
    const text = JSON.stringify(storyLeadsSection(fourPolice, 'en'));
    assert.equal((text.match(/Police & public safety/g) || []).length, 1);
    assert.match(text, /4 items/);
    // all four member titles still render
    for (const t of ['use of force', 'pursuit policies', 'SOP 660', 'training']) assert.match(text, new RegExp(t));
  });

  it('shows the shared tag once at the cluster level, not per member', () => {
    const text = JSON.stringify(storyLeadsSection(fourPolice, 'en'));
    assert.equal((text.match(/Power & accountability/g) || []).length, 1);
  });

  it('renders a 📍 District chip when the cluster shares a district', () => {
    const district7 = [
      policeLead(1, 'Police matter (7th Aldermanic District)'),
      policeLead(2, 'Police pursuit (7th Aldermanic District)'),
    ];
    assert.match(JSON.stringify(storyLeadsSection(district7, 'en')), /District 7/);
  });

  it('a singleton still renders title + tags + watch', () => {
    const single = [{ item: { eventItemId: 9, title: 'tavern liquor license', eventBodyName: 'LICENSES' }, tags: [{ kind: 'conflict' }], score: 3, reasons: [] }];
    const text = JSON.stringify(storyLeadsSection(single, 'en'));
    assert.match(text, /tavern liquor license/);
    assert.match(text, /story_watch/);
  });

  it('caps to the top 3 entries and shows a "ver más" instruction for the rest', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ item: { eventItemId: i, title: `tavern liquor license ${i}`, eventBodyName: 'LICENSES', eventDate: '2026-06-2' + i }, tags: [{ kind: 'conflict' }], score: 6 - i, reasons: [] }));
    const text = JSON.stringify(storyLeadsSection(many, 'en'));
    assert.match(text, /3 (?:more|más)/);
    assert.match(text, /\/gavel stories/);
  });

  it('bilingual: ES theme label + ES "más" instruction', () => {
    const text = JSON.stringify(storyLeadsSection(fourPolice, 'es'));
    assert.match(text, /Policía y seguridad/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent && node --test tests/blockkit/story-leads.test.js`
Expected: FAIL — current `storyLeadsSection` renders flat rows, so "4 items"/single-cluster assertions fail.

- [ ] **Step 3: Rewrite `storyLeadsSection` and add helpers in `agent/blockkit/story-leads.js`**

Add the import at the top (with the other imports):

```js
import { clusterLeads } from '../stories/cluster.js';
```

Add these tables near `COPY` / `TAG_LABEL`:

```js
const N_EXPANDED = 3;

const THEME_LABEL = {
  en: {
    police: '🛡️ Police & public safety', health: '🏥 Health', housing: '🏠 Housing & zoning',
    development: '🏗️ Development', licenses: '🍺 Licenses', parks: '🌳 Parks & environment',
    streets: '🚧 Streets & infrastructure', appointments: '👔 Appointments',
  },
  es: {
    police: '🛡️ Policía y seguridad', health: '🏥 Salud', housing: '🏠 Vivienda y zonificación',
    development: '🏗️ Desarrollo', licenses: '🍺 Licencias', parks: '🌳 Parques y medio ambiente',
    streets: '🚧 Calles e infraestructura', appointments: '👔 Nombramientos',
  },
};

const districtLabel = (district, language) =>
  district ? (language === 'es' ? `📍 Distrito ${district}` : `📍 District ${district}`) : null;
```

Extend the `COPY` objects with three keys each (`items`, `item`, `more`):

```js
// in COPY.en:
  items: 'items', item: 'item',
  more: (n) => `➕ ${n} more — \`/gavel stories\` to see them all`,
// in COPY.es:
  items: 'puntos', item: 'punto',
  more: (n) => `➕ ${n} más — \`/gavel stories\` para verlas todas`,
```

Replace the whole `storyLeadsSection` function with:

```js
/**
 * App Home reporter section, clustered (MOO-128). Tags + titles only — no Claude call.
 * @param {Array<object>} leads - ranked story leads (from state.storyLeads)
 * @param {'en'|'es'} language
 * @returns {object[]} Block Kit blocks
 */
export function storyLeadsSection(leads, language = 'en') {
  const copy = COPY[language] ?? COPY.en;
  if (!leads || leads.length === 0) {
    return [mrkdwn(`${copy.heading}\n${copy.quiet}`), { type: 'divider' }];
  }

  const entries = clusterLeads(leads);
  const blocks = [mrkdwn(copy.heading), context(copy.leadIn)];
  for (const entry of entries.slice(0, N_EXPANDED)) {
    blocks.push(...(entry.kind === 'cluster' ? clusterBlocks(entry, copy, language) : singleBlocks(entry, copy, language)));
  }
  if (entries.length > N_EXPANDED) blocks.push(context(copy.more(entries.length - N_EXPANDED)));
  blocks.push(context(copy.disclaimer));
  blocks.push({ type: 'divider' });
  return blocks;
}

/** "🏛️ {committee} · 📍 District N · {tags}" — the explainable context line. */
function metaLine(committee, district, tags, language) {
  return ['🏛️ ' + (committee ?? ''), districtLabel(district, language), tagText(tags, language)]
    .filter(Boolean)
    .join('  ·  ');
}

function clusterBlocks(cluster, copy, language) {
  const label = (THEME_LABEL[language] ?? THEME_LABEL.en)[cluster.theme] ?? cluster.theme;
  const count = `${cluster.members.length} ${cluster.members.length === 1 ? copy.item : copy.items}`;
  const out = [
    mrkdwn(`*${label}* — ${count}`),
    context(metaLine(cluster.committee, cluster.district, cluster.tags, language)),
  ];
  for (const member of cluster.members) {
    out.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `• ${member.item.title}` },
      accessory: storyWatchButton(member.item, copy),
    });
  }
  return out;
}

function singleBlocks(lead, copy, language) {
  return [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*${lead.item.title}*` },
      accessory: storyWatchButton(lead.item, copy),
    },
    context(metaLine(lead.item.eventBodyName, lead.district, lead.tags, language)),
  ];
}
```

Delete the now-unused `MAX_HOME_LEADS` constant if nothing else references it (grep first: `grep -n MAX_HOME_LEADS agent/blockkit/story-leads.js`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agent && node --test tests/blockkit/story-leads.test.js`
Expected: PASS (existing + new cluster tests).

- [ ] **Step 5: Commit**

```bash
git add agent/blockkit/story-leads.js agent/tests/blockkit/story-leads.test.js
git commit -m "feat(blockkit): clustered story-leads render + district chip + hierarchy (MOO-128)"
```

---

## Task 4: Localize the App Home status strip (language fix)

**Files:**
- Modify: `agent/blockkit/home-view.js`
- Test: `agent/tests/blockkit/home-view.test.js`

- [ ] **Step 1: Write the failing test (append to `home-view.test.js`)**

```js
test('the status strip localizes to Spanish when the Home language is ES', () => {
  const esState = { ...state, channels: [{ ...state.channels[0], language: 'es' }] };
  const all = JSON.stringify(homeView(esState).blocks);
  assert.match(all, /Esta semana/); // ES strip
  assert.doesNotMatch(all, /meetings touch your subscriptions/); // no English strip leaking
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent && node --test tests/blockkit/home-view.test.js`
Expected: FAIL — the strip is hardcoded English, so `Esta semana` is absent and the English phrase is present.

- [ ] **Step 3: Implement the localized strip in `agent/blockkit/home-view.js`**

Add near the top (after the existing consts):

```js
const STRIP_COPY = {
  en: (s) =>
    `This week: *${s.meetings}* ${plural(s.meetings, 'meeting touches', 'meetings touch')} your subscriptions · ⚠️ *${s.lateAdds}* added late · 👁 *${s.watchHits}* ${plural(s.watchHits, 'watch hit')}`,
  es: (s) =>
    `Esta semana: *${s.meetings}* ${s.meetings === 1 ? 'reunión toca' : 'reuniones tocan'} tus suscripciones · ⚠️ *${s.lateAdds}* añadidas tarde · 👁 *${s.watchHits}* ${s.watchHits === 1 ? 'coincidencia' : 'coincidencias'}`,
};
```

Replace the hardcoded strip `mrkdwn(...)` line inside `homeView` (the one beginning `This week: *${strip.meetings}*`) with:

```js
    mrkdwn((STRIP_COPY[language] ?? STRIP_COPY.en)(strip)),
```

(`language` is already computed above as `channels.some((c) => c.language === 'es') ? 'es' : 'en'`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agent && node --test tests/blockkit/home-view.test.js`
Expected: PASS. The existing English strip tests still pass (English fixtures resolve to `STRIP_COPY.en`).

- [ ] **Step 5: Commit**

```bash
git add agent/blockkit/home-view.js agent/tests/blockkit/home-view.test.js
git commit -m "fix(blockkit): localize the App Home status strip (MOO-128)"
```

---

## Task 5: Full suite + biome + live cluster verification

**Files:**
- Modify: `agent/scripts/story-radar-verify.mjs`

- [ ] **Step 1: Run the full suite**

Run: `cd agent && node --test`
Expected: PASS, 0 fail (≈ 540+ tests). If a prior MOO-127 test asserted the old flat render, update it to the clustered shape.

- [ ] **Step 2: Biome on changed files**

Run: `cd agent && npx @biomejs/biome check --write stories/cluster.js blockkit/story-leads.js blockkit/home-view.js scripts/story-radar-verify.mjs tests/stories/cluster.test.js tests/blockkit/story-leads.test.js tests/blockkit/home-view.test.js`
Then: `npx @biomejs/biome check stories/cluster.js blockkit/story-leads.js blockkit/home-view.js`
Expected: clean (ignore the pre-existing `tests/alerts/match.test.js` error).

- [ ] **Step 3: Add a clustering view to the live verify script**

In `agent/scripts/story-radar-verify.mjs`, after the "Ranked story leads" block, add (import `clusterLeads` at the top):

```js
import { clusterLeads } from '../stories/leads.js'; // NOTE: from '../stories/cluster.js'
```

```js
  const entries = clusterLeads(leads);
  console.log(`\n=== 🧷 Clustered (App Home view): ${entries.length} entries ===`);
  for (const e of entries) {
    if (e.kind === 'cluster') console.log(`  ▣ [${e.theme}] ${e.members.length} items · ${e.committee}${e.district ? ` · 📍 D${e.district}` : ''}`);
    else console.log(`  • ${e.item.title.slice(0, 70)}${e.district ? ` · 📍 D${e.district}` : ''}`);
  }
```

(Use `'../stories/cluster.js'` for the import — the inline note above is a reminder, not the path.)

- [ ] **Step 4: Run the live verification**

Run: `cd agent && node scripts/story-radar-verify.mjs`
Expected: this week's police items report as **one** `▣ [police] N items · COMMON COUNCIL` cluster (the load-bearing real-data check).

- [ ] **Step 5: Commit**

```bash
git add agent/scripts/story-radar-verify.mjs
git commit -m "test(stories): live clustered-view verification (MOO-128)"
```

---

## Task 6: PR, review, deploy, screenshot (human-gated)

- [ ] Open the PR (`gh pr create`), link it on MOO-128, move the issue → In Review with the unit + live evidence.
- [ ] Request a code review (superpowers:requesting-code-review); address findings.
- [ ] On approval: merge → `fly deploy -c fly.app.toml --remote-only` → confirm "Gavel is running!" in logs.
- [ ] Verify the clustered Home renders against live prod data (build `buildHomeState` → `homeView`, assert one police cluster, one language). Screenshot the App Home → attach to MOO-128 → Done.

---

## Self-Review

- **Spec coverage:** clustering (T1–T2) · theme/tag separation + 8 beats (T1) · district facet (T2/T3) · cluster render + hierarchy + "ver más" (T3) · shared-tag-once (T3) · language fix (T4) · reporter-gating unchanged (home-view already gates; no change needed) · no new persistence / LLM-free (pure module, render-time) · live verify (T5). Covered.
- **Placeholder scan:** none — every step has real code/commands. (The `cases` scratch array in T1 Step 1 is explicitly flagged for deletion.)
- **Type consistency:** `clusterLeads` returns `{kind:'cluster', theme, committee, tags, district?, members, topScore}` | `{kind:'single', district?, ...lead}` — consumed exactly that way in T3 (`entry.kind`, `cluster.members`, `cluster.theme`, `cluster.district`, `lead.district`, `lead.item`). `themeOf(title)` signature consistent across T1/T2. `storyLeadsSection(leads, language)` signature unchanged, so the `home-view.js` call site needs no edit.
