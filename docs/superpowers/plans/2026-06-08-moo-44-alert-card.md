# MOO-44 Bilingual Alert Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drain the `detectedAgendaItems` pending rows MOO-41 enqueues into a proactive, bilingual Block Kit card posted unprompted to subscribed Slack channels, with a "How to be heard / Cómo participar" footer and action buttons.

**Architecture:** A new `agent/alerts/` module mirrors the poller's shape — pure units (matching, card assembly, footer) + an injected-boundary orchestrator `processPendingAlerts`. The Fly `poll-once.mjs` runs `runPoll` then `processPendingAlerts` each tick. The summarizer gains a single bilingual structured call. Failed posts stay `pending` and retry next tick (idempotent via `alertStatus`).

**Tech Stack:** Node.js (ESM, `node --test`), Anthropic SDK (Sonnet 4.6, structured output), `@slack/web-api` WebClient, Convex, Legistar OData.

**Spec:** `docs/superpowers/specs/2026-06-08-moo-44-alert-card-design.md`

---

## File structure

| Path | Responsibility | Tested by |
|---|---|---|
| `agent/poller/legistar.js` | extend: `getMatter`, `getMatterSponsors`, `getPerson`, `getEvent` + their pure mappers | unit + live |
| `agent/summarizer/prompt.js` | add `BILINGUAL_SYSTEM_PROMPT`, `BILINGUAL_OUTPUT_SCHEMA`, `buildBilingualPrompt` | unit |
| `agent/summarizer/client.js` | parameterize `schema` option (default unchanged) | — |
| `agent/summarizer/bilingual.js` | `summarizeMatterBilingual(matter, {generate})` — validates `{en,es,addresses}` | unit |
| `agent/alerts/match.js` | `matchSubscriptions(row, subs)` → channelIds — pure | unit |
| `agent/alerts/footer.js` | `buildFooter(event, person)` + `HOW_TO_PARTICIPATE_URL` — pure | unit |
| `agent/alerts/card.js` | `buildAlertCard({row, matter, event, summary, footer})` → Block Kit blocks + fallback text — pure | unit |
| `agent/alerts/enrich.js` | `enrichForAlert(row, legistar)` → `{matter, event, person}` — injected boundary | unit (fakes) + live |
| `agent/alerts/process.js` | `processPendingAlerts(deps)` orchestrator — injected boundaries | unit (fakes) |
| `agent/alerts/index.js` | barrel | — |
| `agent/convex/detectedItems.ts` | add `markSent` mutation | live |
| `agent/listeners/actions/alert-buttons.js` | `alert_watch` · `alert_history` · `alert_ask` handlers | unit |
| `agent/listeners/actions/index.js` | register the three alert actions | — |
| `agent/scripts/poll-once.mjs` | call `processPendingAlerts` after `runPoll` | live |
| `agent/scripts/alert-verify.mjs` | live: real pending row → enrich → post real card → screenshot/log | live |

---

## Task 1: Legistar enrichment fetches

**Files:**
- Modify: `agent/poller/legistar.js` (append pure mappers + client methods)
- Test: `agent/tests/alerts/enrich-legistar.test.js`

- [ ] **Step 1: Write the failing test**

```js
// agent/tests/alerts/enrich-legistar.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapMatter, mapSponsor, mapPerson, mapEventDetail } from '../../poller/legistar.js';

test('mapMatter picks the file number', () => {
  assert.deepEqual(mapMatter({ MatterId: 1, MatterFile: '241554', MatterName: '' }), { fileNumber: '241554' });
});

test('mapSponsor picks primary sponsor name + person id', () => {
  assert.deepEqual(mapSponsor({ MatterSponsorName: 'ALD. PEREZ', MatterSponsorNameId: 2462, MatterSponsorSequence: 0 }), {
    name: 'ALD. PEREZ',
    personId: 2462,
    sequence: 0,
  });
});

test('mapPerson picks contact fields, undefined when absent', () => {
  assert.deepEqual(mapPerson({ PersonFullName: 'ALD. PEREZ', PersonEmail: 'jperez@milwaukee.gov', PersonPhone: '414-286-2221' }), {
    name: 'ALD. PEREZ',
    email: 'jperez@milwaukee.gov',
    phone: '414-286-2221',
  });
  assert.deepEqual(mapPerson({ PersonFullName: 'X', PersonEmail: '', PersonPhone: null }), { name: 'X', email: undefined, phone: undefined });
});

test('mapEventDetail picks hearing time, location, links', () => {
  assert.deepEqual(
    mapEventDetail({
      EventDate: '2026-06-08T00:00:00',
      EventTime: '1:30 PM',
      EventLocation: 'Room 301-B, City Hall',
      EventInSiteURL: 'https://milwaukee.legistar.com/x',
      EventAgendaFile: 'https://.../agenda.pdf',
    }),
    { date: '2026-06-08T00:00:00', time: '1:30 PM', location: 'Room 301-B, City Hall', inSiteUrl: 'https://milwaukee.legistar.com/x', agendaPdf: 'https://.../agenda.pdf' },
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent && node --test tests/alerts/enrich-legistar.test.js`
Expected: FAIL — `mapMatter` is not exported.

- [ ] **Step 3: Append pure mappers + client methods to `agent/poller/legistar.js`**

```js
// --- appended to agent/poller/legistar.js ---

/** Normalize a raw Legistar matter to the card's file number. */
export function mapMatter(raw) {
  return { fileNumber: raw.MatterFile };
}

/** Normalize a raw sponsor row (the alderperson behind a matter). */
export function mapSponsor(raw) {
  return { name: raw.MatterSponsorName, personId: raw.MatterSponsorNameId, sequence: raw.MatterSponsorSequence };
}

/** Normalize a raw person to contact fields; empty strings/null → undefined. */
export function mapPerson(raw) {
  const clean = (v) => (v ? v : undefined);
  return { name: raw.PersonFullName, email: clean(raw.PersonEmail), phone: clean(raw.PersonPhone) };
}

/** Normalize a raw event to its hearing detail (time/location/links). */
export function mapEventDetail(raw) {
  return {
    date: raw.EventDate,
    time: raw.EventTime ?? undefined,
    location: raw.EventLocation ?? undefined,
    inSiteUrl: raw.EventInSiteURL ?? undefined,
    agendaPdf: raw.EventAgendaFile ?? undefined,
  };
}
```

Then, inside `createLegistarClient`'s returned object (add to the `return { ... }`), add four methods using the existing `getJson` helper:

```js
  async function getMatter(matterId) {
    return mapMatter(await getJson(`matters/${matterId}`));
  }
  async function getMatterSponsors(matterId) {
    const raw = await getJson(`matters/${matterId}/sponsors`);
    return raw.map(mapSponsor).sort((a, b) => a.sequence - b.sequence);
  }
  async function getPerson(personId) {
    return mapPerson(await getJson(`persons/${personId}`));
  }
  async function getEvent(eventId) {
    return mapEventDetail(await getJson(`events/${eventId}`));
  }
```

And extend the return: `return { fetchUpcomingFinalEvents, fetchEventItems, getMatter, getMatterSponsors, getPerson, getEvent };`

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agent && node --test tests/alerts/enrich-legistar.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add agent/poller/legistar.js agent/tests/alerts/enrich-legistar.test.js
git commit -m "feat(legistar): matter/sponsor/person/event enrichment fetches for alerts (MOO-44)"
```

---

## Task 2: Bilingual summarizer

**Files:**
- Modify: `agent/summarizer/prompt.js` (add bilingual prompt + schema + builder)
- Modify: `agent/summarizer/client.js` (parameterize schema)
- Create: `agent/summarizer/bilingual.js`
- Modify: `agent/summarizer/index.js` (export new symbols)
- Test: `agent/tests/summarizer/bilingual.test.js`

- [ ] **Step 1: Write the failing test**

```js
// agent/tests/summarizer/bilingual.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarizeMatterBilingual } from '../../summarizer/bilingual.js';

const matter = { fileNumber: '241554', title: 'An ordinance creating an Immigration Advisory Board', matterText: '', attachments: [] };

function fakeGenerate(result) {
  return async ({ system, prompt }) => {
    assert.match(system, /español|Spanish/i);
    assert.ok(prompt.includes('Immigration Advisory Board'));
    return result;
  };
}

test('returns validated bilingual structure', async () => {
  const out = await summarizeMatterBilingual(matter, {
    generate: fakeGenerate({
      en: { summary: 'The city creates a board.', whyItMatters: 'It affects immigrants.' },
      es: { summary: 'La ciudad crea una junta.', whyItMatters: 'Afecta a los inmigrantes.' },
      addresses: [],
    }),
  });
  assert.equal(out.en.summary, 'The city creates a board.');
  assert.equal(out.es.whyItMatters, 'Afecta a los inmigrantes.');
  assert.deepEqual(out.addresses, []);
  assert.equal(out.sourcesUsed[0], 'title');
});

test('throws on a malformed result missing es', async () => {
  await assert.rejects(
    () => summarizeMatterBilingual(matter, { generate: fakeGenerate({ en: { summary: 'x', whyItMatters: 'y' }, addresses: [] }) }),
    /bilingual/i,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent && node --test tests/summarizer/bilingual.test.js`
Expected: FAIL — cannot find module `../../summarizer/bilingual.js`.

- [ ] **Step 3a: Add bilingual prompt + schema to `agent/summarizer/prompt.js`**

```js
// --- appended to agent/summarizer/prompt.js ---

// Curated EN→ES civic glossary injected so Spanish is composed natively with
// correct civic terms (not machine-translated).
const CIVIC_GLOSSARY = [
  'zoning = zonificación',
  'ordinance = ordenanza',
  'resolution = resolución',
  'hearing = audiencia',
  'public comment = comentario público',
  'alderperson = concejal',
  'Common Council = Concejo Municipal',
  'rezoning = recalificación de zona',
  'demolition = demolición',
  'license = licencia',
].join('; ');

export const BILINGUAL_SYSTEM_PROMPT = `${SUMMARY_SYSTEM_PROMPT}

Produce the SAME three things in BOTH English and Spanish, composed natively in each language (do not translate word-for-word — write each as a fluent civic explainer would). Return an object with "en" and "es" objects, each holding "summary" and "whyItMatters", plus a single shared "addresses" array.

Keep file numbers, street addresses, and committee names in English in both. Use this civic glossary for Spanish terms: ${CIVIC_GLOSSARY}.`;

export const BILINGUAL_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    en: {
      type: 'object',
      properties: { summary: { type: 'string' }, whyItMatters: { type: 'string' } },
      required: ['summary', 'whyItMatters'],
      additionalProperties: false,
    },
    es: {
      type: 'object',
      properties: { summary: { type: 'string' }, whyItMatters: { type: 'string' } },
      required: ['summary', 'whyItMatters'],
      additionalProperties: false,
    },
    addresses: { type: 'array', items: { type: 'string' } },
  },
  required: ['en', 'es', 'addresses'],
  additionalProperties: false,
};

/** Bilingual user prompt — same source context, asks for EN+ES. */
export function buildBilingualPrompt(matter) {
  const { contextText } = buildSourceContext(matter);
  return `Summarize this Milwaukee civic matter for a neighbor, in English and Spanish.\n\n${contextText}`;
}
```

- [ ] **Step 3b: Parameterize the schema in `agent/summarizer/client.js`**

Change the signature and the `output_config` to accept a schema (default preserves existing behavior):

```js
export function createClaudeGenerate(options = {}) {
  const { apiKey, model = SUMMARY_MODEL, client, schema = SUMMARY_OUTPUT_SCHEMA } = options;
  const anthropic = client ?? new Anthropic(apiKey ? { apiKey } : undefined);

  return async function generate({ system, prompt }) {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: prompt }],
      output_config: { format: { type: 'json_schema', schema } },
    });
    const text = response.content.find((block) => block.type === 'text')?.text ?? '';
    try {
      return JSON.parse(text);
    } catch (cause) {
      throw new Error(`Summarizer could not parse model output as JSON: ${text.slice(0, 200)}`, { cause });
    }
  };
}
```

- [ ] **Step 3c: Create `agent/summarizer/bilingual.js`**

```js
import { buildSourceContext } from './source.js';
import { BILINGUAL_SYSTEM_PROMPT, buildBilingualPrompt } from './prompt.js';

/**
 * Summarize one matter into a native bilingual {en, es} pair + addresses.
 * The Claude call is injected as `generate` (built with BILINGUAL_OUTPUT_SCHEMA).
 *
 * @param {import('./source.js').Matter} matter
 * @param {{ generate: (input: {system: string, prompt: string}) => Promise<any> }} deps
 */
export async function summarizeMatterBilingual(matter, { generate }) {
  const { sourcesUsed } = buildSourceContext(matter);
  const prompt = buildBilingualPrompt(matter);
  const result = await generate({ system: BILINGUAL_SYSTEM_PROMPT, prompt });
  assertBilingual(result);
  return { en: result.en, es: result.es, addresses: result.addresses, sourcesUsed };
}

function assertBilingual(r) {
  const ok = (x) => x && typeof x.summary === 'string' && typeof x.whyItMatters === 'string';
  if (!ok(r?.en) || !ok(r?.es) || !Array.isArray(r?.addresses)) {
    throw new Error('Summarizer returned a malformed bilingual result: need en{summary,whyItMatters}, es{...}, addresses[]');
  }
}
```

- [ ] **Step 3d: Export from `agent/summarizer/index.js`**

Add these lines:

```js
export { summarizeMatterBilingual } from './bilingual.js';
export { BILINGUAL_OUTPUT_SCHEMA, BILINGUAL_SYSTEM_PROMPT, buildBilingualPrompt } from './prompt.js';
```

- [ ] **Step 4: Run tests (new + existing summarizer suite — no regressions)**

Run: `cd agent && node --test tests/summarizer/`
Expected: PASS — existing EN summarizer tests + 2 new bilingual tests.

- [ ] **Step 5: Commit**

```bash
git add agent/summarizer/ agent/tests/summarizer/bilingual.test.js
git commit -m "feat(summarizer): single-call native bilingual EN/ES summary (MOO-44)"
```

---

## Task 3: Footer builder

**Files:**
- Create: `agent/alerts/footer.js`
- Test: `agent/tests/alerts/footer.test.js`

- [ ] **Step 1: Write the failing test**

```js
// agent/tests/alerts/footer.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFooter, HOW_TO_PARTICIPATE_URL } from '../../alerts/footer.js';

const event = { date: '2026-06-10T00:00:00', time: '1:30 PM', location: 'Room 301-B, City Hall', inSiteUrl: 'https://x' };

test('footer includes hearing date/time, location, registration link, person contact', () => {
  const { text } = buildFooter(event, { name: 'ALD. PEREZ', email: 'jperez@milwaukee.gov', phone: '414-286-2221' });
  assert.match(text, /How to be heard \/ Cómo participar/);
  assert.match(text, /Jun 10/);
  assert.match(text, /1:30 PM/);
  assert.match(text, /Room 301-B/);
  assert.ok(text.includes(HOW_TO_PARTICIPATE_URL));
  assert.match(text, /ALD\. PEREZ/);
  assert.match(text, /jperez@milwaukee\.gov/);
  assert.match(text, /414-286-2221/);
});

test('person line omitted gracefully when no sponsor', () => {
  const { text } = buildFooter(event, null);
  assert.ok(!text.includes('✉️'));
  assert.match(text, /Room 301-B/);
});

test('missing time/location degrade without crashing', () => {
  const { text } = buildFooter({ date: '2026-06-10T00:00:00' }, null);
  assert.match(text, /Jun 10/);
  assert.ok(!text.includes('📍'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent && node --test tests/alerts/footer.test.js`
Expected: FAIL — cannot find module `../../alerts/footer.js`.

- [ ] **Step 3: Write `agent/alerts/footer.js`**

```js
// Milwaukee Common Council public-comment / "how to participate" page. No
// per-matter registration link exists in Legistar, so this is a stable
// city-level constant (verify the live URL during the verification gate).
export const HOW_TO_PARTICIPATE_URL = 'https://city.milwaukee.gov/CommonCouncil/Participate';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Format a Legistar local date string ("2026-06-10T00:00:00") as "Jun 10". */
function shortDate(iso) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

/**
 * Build the "How to be heard / Cómo participar" footer mrkdwn from a hearing
 * event and (optional) sponsor person. Degrades field-by-field.
 *
 * @param {{date: string, time?: string, location?: string}} event
 * @param {{name: string, email?: string, phone?: string}|null} person
 */
export function buildFooter(event, person) {
  const lines = ['🗣️ *How to be heard / Cómo participar*'];

  const when = event.time ? `${shortDate(event.date)} · ${event.time}` : shortDate(event.date);
  lines.push(event.location ? `📅 *${when}*  📍 ${event.location}` : `📅 *${when}*`);

  lines.push(`✋ <${HOW_TO_PARTICIPATE_URL}|Register to comment / Regístrese para comentar>`);

  if (person?.name) {
    const contact = ['👤 ' + person.name, person.email && `✉️ ${person.email}`, person.phone && `☎️ ${person.phone}`]
      .filter(Boolean)
      .join(' · ');
    lines.push(contact);
  }

  return { text: lines.join('\n') };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agent && node --test tests/alerts/footer.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add agent/alerts/footer.js agent/tests/alerts/footer.test.js
git commit -m "feat(alerts): How to be heard / Cómo participar footer builder (MOO-44)"
```

---

## Task 4: Subscription matching

**Files:**
- Create: `agent/alerts/match.js`
- Test: `agent/tests/alerts/match.test.js`

- [ ] **Step 1: Write the failing test**

```js
// agent/tests/alerts/match.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchSubscriptions } from '../../alerts/match.js';

const row = { eventBodyName: 'ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE', title: 'An ordinance relating to rezoning of 234 N Ave' };

const sub = (channelId, committees = [], keywords = []) => ({ channelId, committees, keywords });

test('matches on committee name (case-insensitive)', () => {
  const out = matchSubscriptions(row, [sub('C1', ['zoning, neighborhoods & development committee'])]);
  assert.deepEqual(out, ['C1']);
});

test('matches on a title keyword (case-insensitive)', () => {
  const out = matchSubscriptions(row, [sub('C2', [], ['REZONING'])]);
  assert.deepEqual(out, ['C2']);
});

test('no match returns empty', () => {
  assert.deepEqual(matchSubscriptions(row, [sub('C3', ['LICENSES COMMITTEE'], ['demolition'])]), []);
});

test('dedups a channel that matches on both committee and keyword', () => {
  const out = matchSubscriptions(row, [sub('C4', ['ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE'], ['rezoning'])]);
  assert.deepEqual(out, ['C4']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent && node --test tests/alerts/match.test.js`
Expected: FAIL — cannot find module `../../alerts/match.js`.

- [ ] **Step 3: Write `agent/alerts/match.js`**

```js
/**
 * Which subscribed channels should receive this detected item: a channel
 * matches if the item's committee is in its committees list, or any of its
 * keywords appears in the title. Case-insensitive. Returns deduped channelIds.
 *
 * @param {{eventBodyName: string, title: string}} row
 * @param {Array<{channelId: string, committees: string[], keywords: string[]}>} subscriptions
 * @returns {string[]}
 */
export function matchSubscriptions(row, subscriptions) {
  const body = row.eventBodyName.toLowerCase();
  const title = row.title.toLowerCase();
  const channels = new Set();
  for (const sub of subscriptions) {
    const committeeHit = sub.committees.some((c) => c.toLowerCase() === body);
    const keywordHit = sub.keywords.some((k) => title.includes(k.toLowerCase()));
    if (committeeHit || keywordHit) channels.add(sub.channelId);
  }
  return [...channels];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agent && node --test tests/alerts/match.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add agent/alerts/match.js agent/tests/alerts/match.test.js
git commit -m "feat(alerts): subscription matching by committee + title keyword (MOO-44)"
```

---

## Task 5: Card builder (Block Kit)

**Files:**
- Create: `agent/alerts/card.js`
- Test: `agent/tests/alerts/card.test.js`

- [ ] **Step 1: Write the failing test**

```js
// agent/tests/alerts/card.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildAlertCard } from '../../alerts/card.js';

const input = {
  row: { eventItemId: 490695, eventBodyName: 'STEERING & RULES COMMITTEE', title: 'An ordinance creating an Immigration Advisory Board' },
  matter: { fileNumber: '241554' },
  event: { inSiteUrl: 'https://milwaukee.legistar.com/x' },
  summary: {
    en: { summary: 'The city creates a board.', whyItMatters: 'It affects immigrants.' },
    es: { summary: 'La ciudad crea una junta.', whyItMatters: 'Afecta a los inmigrantes.' },
  },
  footer: { text: '🗣️ *How to be heard / Cómo participar*\n📅 *Jun 8 · 1:30 PM*' },
};

test('card has fallback text and a header with the title', () => {
  const { text, blocks } = buildAlertCard(input);
  assert.match(text, /Immigration Advisory Board/);
  assert.equal(blocks[0].type, 'header');
  assert.match(blocks[0].text.text, /Immigration Advisory Board/);
});

test('card contains both EN and ES summary text', () => {
  const { blocks } = buildAlertCard(input);
  const all = JSON.stringify(blocks);
  assert.ok(all.includes('The city creates a board.'));
  assert.ok(all.includes('La ciudad crea una junta.'));
  assert.ok(all.includes('En español'));
});

test('card has the footer and the three action buttons carrying the eventItemId', () => {
  const { blocks } = buildAlertCard(input);
  const all = JSON.stringify(blocks);
  assert.ok(all.includes('How to be heard'));
  const actions = blocks.find((b) => b.type === 'actions');
  assert.deepEqual(actions.elements.map((e) => e.action_id), ['alert_watch', 'alert_history', 'alert_ask']);
  assert.ok(actions.elements.every((e) => e.value === '490695'));
});

test('the <48h warning flag is absent unless row.walkOnFlag is true', () => {
  const without = JSON.stringify(buildAlertCard(input).blocks);
  assert.ok(!without.includes('Added late'));
  const withFlag = JSON.stringify(buildAlertCard({ ...input, row: { ...input.row, walkOnFlag: true } }).blocks);
  assert.ok(withFlag.includes('Added late'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent && node --test tests/alerts/card.test.js`
Expected: FAIL — cannot find module `../../alerts/card.js`.

- [ ] **Step 3: Write `agent/alerts/card.js`**

```js
/** Slack header text caps at 150 chars. */
function headerText(title) {
  const t = `⚖️ ${title}`;
  return t.length > 150 ? `${t.slice(0, 147)}…` : t;
}

/**
 * Assemble the bilingual Block Kit alert card. Pure — returns { text, blocks }
 * where `text` is the notification/accessibility fallback and `blocks` is the
 * Block Kit payload. The <48h walk-on warning is rendered only when
 * row.walkOnFlag is true (dormant until Phase 3 wires it).
 *
 * @param {{
 *   row: {eventItemId: number, eventBodyName: string, title: string, walkOnFlag?: boolean},
 *   matter: {fileNumber?: string},
 *   event: {inSiteUrl?: string},
 *   summary: {en: {summary: string, whyItMatters: string}, es: {summary: string, whyItMatters: string}},
 *   footer: {text: string},
 * }} input
 */
export function buildAlertCard({ row, matter, event, summary, footer }) {
  const value = String(row.eventItemId);
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: headerText(row.title), emoji: true } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `*${row.eventBodyName}*` }] },
  ];

  if (row.walkOnFlag) {
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: '⚠️ *Added late* — on the agenda less than 48h before the meeting.' }] });
  }

  blocks.push(
    { type: 'section', text: { type: 'mrkdwn', text: summary.en.summary } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `💡 *Why it matters:* ${summary.en.whyItMatters}` }] },
    { type: 'divider' },
    { type: 'section', text: { type: 'mrkdwn', text: `*🇪🇸 En español*\n${summary.es.summary}` } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `💡 *Por qué importa:* ${summary.es.whyItMatters}` }] },
    { type: 'divider' },
    { type: 'section', text: { type: 'mrkdwn', text: footer.text } },
    {
      type: 'actions',
      elements: [
        { type: 'button', action_id: 'alert_watch', text: { type: 'plain_text', text: '👁 Watch', emoji: true }, value, style: 'primary' },
        { type: 'button', action_id: 'alert_history', text: { type: 'plain_text', text: '🕓 History', emoji: true }, value },
        { type: 'button', action_id: 'alert_ask', text: { type: 'plain_text', text: '💬 Ask Gavel', emoji: true }, value },
      ],
    },
  );

  const fileBit = matter.fileNumber ? `File #${matter.fileNumber}` : 'Milwaukee civic record';
  const link = event.inSiteUrl ? `<${event.inSiteUrl}|milwaukee.legistar.com>` : 'milwaukee.legistar.com';
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `${fileBit} · ${link}` }] });

  const text = `New: ${row.title} — ${summary.en.summary}`;
  return { text, blocks };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agent && node --test tests/alerts/card.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add agent/alerts/card.js agent/tests/alerts/card.test.js
git commit -m "feat(alerts): bilingual Block Kit alert card builder (MOO-44)"
```

---

## Task 6: Enrich boundary

**Files:**
- Create: `agent/alerts/enrich.js`
- Test: `agent/tests/alerts/enrich.test.js`

- [ ] **Step 1: Write the failing test**

```js
// agent/tests/alerts/enrich.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { enrichForAlert } from '../../alerts/enrich.js';

function fakeLegistar({ sponsors }) {
  return {
    getMatter: async () => ({ fileNumber: '241554' }),
    getEvent: async () => ({ date: '2026-06-08T00:00:00', time: '1:30 PM', location: 'Room 301-B' }),
    getMatterSponsors: async () => sponsors,
    getPerson: async (id) => ({ name: 'ALD. PEREZ', email: 'jperez@milwaukee.gov', phone: '414-286-2221', _id: id }),
  };
}

const row = { matterId: 70036, eventId: 13355 };

test('enriches matter + event + primary sponsor person', async () => {
  const ctx = await enrichForAlert(row, fakeLegistar({ sponsors: [{ name: 'ALD. PEREZ', personId: 2462, sequence: 0 }] }));
  assert.equal(ctx.matter.fileNumber, '241554');
  assert.equal(ctx.event.location, 'Room 301-B');
  assert.equal(ctx.person.email, 'jperez@milwaukee.gov');
});

test('person is null when there are no sponsors', async () => {
  const ctx = await enrichForAlert(row, fakeLegistar({ sponsors: [] }));
  assert.equal(ctx.person, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent && node --test tests/alerts/enrich.test.js`
Expected: FAIL — cannot find module `../../alerts/enrich.js`.

- [ ] **Step 3: Write `agent/alerts/enrich.js`**

```js
/**
 * Gather everything the card needs for one detected row from Legistar:
 * the matter file number, the hearing event detail, and the primary sponsor's
 * contact (via /sponsors → /persons). `legistar` is injected.
 *
 * @param {{matterId: number, eventId: number}} row
 * @param {{getMatter: Function, getEvent: Function, getMatterSponsors: Function, getPerson: Function}} legistar
 * @returns {Promise<{matter: object, event: object, person: object|null}>}
 */
export async function enrichForAlert(row, legistar) {
  const [matter, event, sponsors] = await Promise.all([
    legistar.getMatter(row.matterId),
    legistar.getEvent(row.eventId),
    legistar.getMatterSponsors(row.matterId),
  ]);

  let person = null;
  const primary = sponsors[0];
  if (primary?.personId !== undefined && primary.personId !== null) {
    const p = await legistar.getPerson(primary.personId);
    person = { name: p.name ?? primary.name, email: p.email, phone: p.phone };
  } else if (primary?.name) {
    person = { name: primary.name, email: undefined, phone: undefined };
  }

  return { matter, event, person };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agent && node --test tests/alerts/enrich.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add agent/alerts/enrich.js agent/tests/alerts/enrich.test.js
git commit -m "feat(alerts): Legistar enrichment for one alert (matter+event+sponsor) (MOO-44)"
```

---

## Task 7: Convex markSent mutation

**Files:**
- Modify: `agent/convex/detectedItems.ts`

- [ ] **Step 1: Add the mutation** (after `enqueueDetected`)

```ts
/** Flag a detected item as alerted so the poller never re-posts it. */
export const markSent = mutation({
  args: { client: clientValidator, eventItemId: v.number() },
  handler: async (ctx, { client, eventItemId }) => {
    const existing = await ctx.db
      .query('detectedAgendaItems')
      .withIndex('by_client_item', (q) => q.eq('client', client).eq('eventItemId', eventItemId))
      .unique();
    if (existing) await ctx.db.patch(existing._id, { alertStatus: 'sent' });
    return existing?._id ?? null;
  },
});
```

- [ ] **Step 2: Push + codegen**

Run: `cd agent && npx convex dev --once`
Expected: functions ready, no schema change (reuses `by_client_item`).

- [ ] **Step 3: Lint + commit**

```bash
cd agent && npx @biomejs/biome check convex/detectedItems.ts
cd .. && git add agent/convex/detectedItems.ts
git commit -m "feat(convex): markSent mutation to close out posted alerts (MOO-44)"
```

---

## Task 8: processPendingAlerts orchestrator

**Files:**
- Create: `agent/alerts/process.js`
- Create: `agent/alerts/index.js`
- Test: `agent/tests/alerts/process.test.js`

- [ ] **Step 1: Write the failing test**

```js
// agent/tests/alerts/process.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { processPendingAlerts } from '../../alerts/process.js';

function harness({ pending, subscriptions }) {
  const posted = [];
  const sent = [];
  const deps = {
    client: 'milwaukee',
    listPending: async () => pending,
    listSubscriptions: async () => subscriptions,
    enrich: async (row) => ({ matter: { fileNumber: 'F' + row.matterId }, event: { inSiteUrl: 'u' }, person: null }),
    generateBilingual: async () => ({
      en: { summary: 'en s', whyItMatters: 'en w' },
      es: { summary: 'es s', whyItMatters: 'es w' },
      addresses: [],
    }),
    buildFooterText: () => ({ text: 'footer' }),
    postCard: async (channel, card) => posted.push({ channel, title: card.text }),
    markSent: async (client, eventItemId) => sent.push(eventItemId),
    logger: { error: () => {} },
  };
  return { posted, sent, deps };
}

const row = { eventItemId: 1, matterId: 70036, eventId: 13355, eventBodyName: 'ZONING', title: 'rezoning of X' };

test('posts to each matched channel and marks the row sent', async () => {
  const h = harness({ pending: [row], subscriptions: [{ channelId: 'C1', committees: ['ZONING'], keywords: [] }] });
  const out = await processPendingAlerts(h.deps);
  assert.deepEqual(h.posted.map((p) => p.channel), ['C1']);
  assert.deepEqual(h.sent, [1]);
  assert.equal(out[0].posted, 1);
});

test('no matching subscription still marks sent (no audience, no reprocess)', async () => {
  const h = harness({ pending: [row], subscriptions: [{ channelId: 'C9', committees: ['LICENSES'], keywords: [] }] });
  await processPendingAlerts(h.deps);
  assert.deepEqual(h.posted, []);
  assert.deepEqual(h.sent, [1]);
});

test('an enrichment failure leaves the row pending (not marked sent)', async () => {
  const h = harness({ pending: [row], subscriptions: [] });
  h.deps.enrich = async () => {
    throw new Error('legistar down');
  };
  await processPendingAlerts(h.deps);
  assert.deepEqual(h.sent, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent && node --test tests/alerts/process.test.js`
Expected: FAIL — cannot find module `../../alerts/process.js`.

- [ ] **Step 3: Write `agent/alerts/process.js`**

```js
import { buildAlertCard } from './card.js';
import { matchSubscriptions } from './match.js';

/**
 * Drain pending detected items into posted bilingual alert cards. Every
 * boundary is injected so this is unit-testable with fakes; the card assembly
 * and matching are pure. A row is marked sent once processed (even with no
 * matching channel); a failure leaves it pending so the next tick retries.
 *
 * @param {{
 *   client: string,
 *   listPending: (client: string) => Promise<object[]>,
 *   listSubscriptions: (client: string) => Promise<object[]>,
 *   enrich: (row: object) => Promise<{matter: object, event: object, person: object|null}>,
 *   generateBilingual: (matter: object) => Promise<object>,
 *   buildFooterText: (event: object, person: object|null) => {text: string},
 *   postCard: (channel: string, card: {text: string, blocks: object[]}) => Promise<void>,
 *   markSent: (client: string, eventItemId: number) => Promise<unknown>,
 *   logger?: {error: Function},
 * }} deps
 */
export async function processPendingAlerts(deps) {
  const { client, listPending, listSubscriptions, enrich, generateBilingual, buildFooterText, postCard, markSent, logger } = deps;
  const pending = await listPending(client);
  const subscriptions = await listSubscriptions(client);
  const results = [];

  for (const row of pending) {
    try {
      const ctx = await enrich(row);
      const matter = { fileNumber: ctx.matter.fileNumber, title: row.title, matterText: '', attachments: [] };
      const summary = await generateBilingual(matter);
      const footer = buildFooterText(ctx.event, ctx.person);
      const card = buildAlertCard({ row, matter: ctx.matter, event: ctx.event, summary, footer });

      const channels = matchSubscriptions(row, subscriptions);
      for (const channel of channels) await postCard(channel, card);

      await markSent(client, row.eventItemId);
      results.push({ eventItemId: row.eventItemId, posted: channels.length });
    } catch (err) {
      logger?.error?.(`alert failed for eventItemId ${row.eventItemId}: ${err.message}`);
      results.push({ eventItemId: row.eventItemId, posted: 0, error: err.message });
    }
  }
  return results;
}
```

- [ ] **Step 4: Write `agent/alerts/index.js`**

```js
export { buildAlertCard } from './card.js';
export { enrichForAlert } from './enrich.js';
export { buildFooter, HOW_TO_PARTICIPATE_URL } from './footer.js';
export { matchSubscriptions } from './match.js';
export { processPendingAlerts } from './process.js';
```

- [ ] **Step 5: Run tests + full suite**

Run: `cd agent && node --test tests/alerts/ && node --test`
Expected: PASS — all alerts tests + whole suite green.

- [ ] **Step 6: Commit**

```bash
git add agent/alerts/process.js agent/alerts/index.js agent/tests/alerts/process.test.js
git commit -m "feat(alerts): processPendingAlerts orchestrator — drain, post, mark sent (MOO-44)"
```

---

## Task 9: Alert button handlers

**Files:**
- Create: `agent/listeners/actions/alert-buttons.js`
- Modify: `agent/listeners/actions/index.js`
- Test: `agent/tests/listeners/actions/alert-buttons.test.js`

- [ ] **Step 1: Write the failing test**

```js
// agent/tests/listeners/actions/alert-buttons.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleAlertWatch, handleAlertHistory, handleAlertAsk } from '../../../listeners/actions/alert-buttons.js';

function args() {
  const calls = { ack: 0, ephemeral: [], logs: [] };
  return {
    calls,
    arg: {
      ack: async () => {
        calls.ack += 1;
      },
      body: { channel: { id: 'C1' }, message: { ts: '111.222' }, actions: [{ value: '490695' }] },
      context: { userId: 'U1' },
      client: { chat: { postEphemeral: async (m) => calls.ephemeral.push(m) } },
      logger: { info: (m) => calls.logs.push(m), error: (m) => calls.logs.push(m) },
    },
  };
}

for (const [name, handler] of [
  ['watch', handleAlertWatch],
  ['history', handleAlertHistory],
  ['ask', handleAlertAsk],
]) {
  test(`${name} acks, logs, and posts an ephemeral ack`, async () => {
    const { calls, arg } = args();
    await handler(arg);
    assert.equal(calls.ack, 1);
    assert.equal(calls.ephemeral.length, 1);
    assert.equal(calls.ephemeral[0].user, 'U1');
    assert.ok(calls.logs.some((l) => l.includes('490695')));
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent && node --test tests/listeners/actions/alert-buttons.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write `agent/listeners/actions/alert-buttons.js`**

```js
/**
 * Alert card button handlers. For MOO-44 each one acks, logs, and posts a
 * minimal ephemeral acknowledgement — deep behavior (watchlists, history
 * fetch, RTS-backed Q&A) is wired in Phases 2–3.
 */
function makeHandler(label, message) {
  return async function handle({ ack, body, context, client, logger }) {
    await ack();
    try {
      const userId = /** @type {string} */ (context.userId);
      const channelId = /** @type {string} */ (body.channel?.id);
      const messageTs = /** @type {string} */ (body.message?.ts);
      const eventItemId = body.actions?.[0]?.value;
      await client.chat.postEphemeral({ channel: channelId, user: userId, thread_ts: messageTs, text: message });
      logger.info(`alert ${label}: eventItemId=${eventItemId} user=${userId}`);
    } catch (e) {
      logger.error(`alert ${label} failed: ${e}`);
    }
  };
}

export const handleAlertWatch = makeHandler('watch', "👁 You'll be notified as this item moves through committee. (Watchlists arrive soon.)");
export const handleAlertHistory = makeHandler('history', '🕓 Full history is on the matter page (link in the card footer). Detailed timeline coming soon.');
export const handleAlertAsk = makeHandler('ask', '💬 Ask me about this in a thread — reply here and I’ll dig into the record.');
```

- [ ] **Step 4: Register in `agent/listeners/actions/index.js`**

```js
import { handleAlertAsk, handleAlertHistory, handleAlertWatch } from './alert-buttons.js';
import { handleFeedbackButton } from './feedback-buttons.js';

export function register(app) {
  app.action('feedback', handleFeedbackButton);
  app.action('alert_watch', handleAlertWatch);
  app.action('alert_history', handleAlertHistory);
  app.action('alert_ask', handleAlertAsk);
}
```

- [ ] **Step 5: Run test + commit**

Run: `cd agent && node --test tests/listeners/actions/alert-buttons.test.js`
Expected: PASS (3 tests).

```bash
git add agent/listeners/actions/alert-buttons.js agent/listeners/actions/index.js agent/tests/listeners/actions/alert-buttons.test.js
git commit -m "feat(alerts): Watch/History/Ask Gavel button handlers (MOO-44)"
```

---

## Task 10: Wire into poll-once + live verification

**Files:**
- Modify: `agent/scripts/poll-once.mjs`
- Create: `agent/scripts/alert-verify.mjs`

- [ ] **Step 1: Extend `agent/scripts/poll-once.mjs`** — after the `runPoll(...)` promise chain, compose the alert step. Replace the single `runPoll(...).then(...)` with a sequential async main:

```js
import { WebClient } from '@slack/web-api';
import { buildFooter, processPendingAlerts } from '../alerts/index.js';
import { createClaudeGenerate, summarizeMatterBilingual, BILINGUAL_OUTPUT_SCHEMA } from '../summarizer/index.js';

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
const generate = createClaudeGenerate({ schema: BILINGUAL_OUTPUT_SCHEMA });

async function main() {
  const poll = await runPoll({
    client: CLIENT,
    fetchUpcomingFinalEvents: () => legistar.fetchUpcomingFinalEvents(),
    fetchEventItems: (id) => legistar.fetchEventItems(id),
    readSeenEventItemIds: (client) => convex.query(api.detectedItems.listSeenKeys, { client }),
    enqueueDetected: (items) => convex.mutation(api.detectedItems.enqueueDetected, { items }),
  });

  const alerts = await processPendingAlerts({
    client: CLIENT,
    listPending: (client) => convex.query(api.detectedItems.listPending, { client }),
    listSubscriptions: (client) => convex.query(api.subscriptions.listSubscriptions, { client }),
    enrich: (row) => enrichForAlert(row, legistar),
    generateBilingual: (matter) => summarizeMatterBilingual(matter, { generate }),
    buildFooterText: (event, person) => buildFooter(event, person),
    postCard: (channel, card) => slack.chat.postMessage({ channel, text: card.text, blocks: card.blocks }),
    markSent: (client, eventItemId) => convex.mutation(api.detectedItems.markSent, { client, eventItemId }),
    logger: console,
  });

  const postedCount = alerts.reduce((n, a) => n + a.posted, 0);
  console.log(`[${new Date().toISOString()}] ${CLIENT}: fetched ${poll.fetchedCount}, detected ${poll.newItems.length} new; alerts processed ${alerts.length}, posted ${postedCount}`);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(`[${new Date().toISOString()}] poll/alert failed:`, err.message);
  process.exit(1);
});
```

Add the matching import for `enrichForAlert` at the top: `import { enrichForAlert } from '../alerts/index.js';` (fold into the existing alerts import).

- [ ] **Step 2: Create a demo subscription pointing at a real sandbox channel.**

Get a channel id from the dev Slack workspace (a test channel the bot is in). Then:

Run:
```bash
cd agent && node --input-type=module <<'EOF'
import { config } from 'dotenv'; config({ path: '.env.local' }); config();
import { ConvexHttpClient } from 'convex/browser';
import { api } from './convex/_generated/api.js';
const c = new ConvexHttpClient(process.env.CONVEX_URL);
await c.mutation(api.subscriptions.upsertSubscription, {
  channelId: process.env.DEMO_CHANNEL_ID,
  committees: ['STEERING & RULES COMMITTEE'],
  keywords: ['rezoning', 'immigration'],
  language: 'en',
});
console.log('demo subscription upserted for', process.env.DEMO_CHANNEL_ID);
EOF
```
Set `DEMO_CHANNEL_ID` to the real channel id first (e.g. `export DEMO_CHANNEL_ID=C0XXXX`). Choose committees that have pending rows (Steering & Rules has the Immigration Advisory Board matter).

- [ ] **Step 3: Create `agent/scripts/alert-verify.mjs`** — drains ONE pending row to a real channel and prints what it posted, for repeatable verification.

```js
#!/usr/bin/env node
// MOO-44 verification: post ONE real bilingual alert card to a sandbox channel
// from a real pending row, with real Legistar enrichment. Prints the footer
// fields so they can be cross-checked against Legistar.
//
//   DEMO_CHANNEL_ID=C0XXXX node scripts/alert-verify.mjs

import { WebClient } from '@slack/web-api';
import { ConvexHttpClient } from 'convex/browser';
import { config } from 'dotenv';

config({ path: '.env.local' });
config();

import { api } from '../convex/_generated/api.js';
import { buildAlertCard, buildFooter, enrichForAlert, matchSubscriptions } from '../alerts/index.js';
import { createLegistarClient } from '../poller/index.js';
import { BILINGUAL_OUTPUT_SCHEMA, createClaudeGenerate, summarizeMatterBilingual } from '../summarizer/index.js';

const CLIENT = 'milwaukee';
const channel = process.env.DEMO_CHANNEL_ID;
if (!channel) { console.error('Set DEMO_CHANNEL_ID'); process.exit(1); }

const convex = new ConvexHttpClient(process.env.CONVEX_URL);
const legistar = createLegistarClient({ fetch, client: CLIENT, userAgent: 'GavelCivicAgent/0.1 (contact tarik@radiomilwaukee.org)' });
const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
const generate = createClaudeGenerate({ schema: BILINGUAL_OUTPUT_SCHEMA });

const pending = await convex.query(api.detectedItems.listPending, { client: CLIENT });
const row = pending.find((p) => /immigration|rezoning|ordinance/i.test(p.title)) ?? pending[0];
console.log('Posting card for:', row.eventItemId, '—', row.title.slice(0, 70));

const ctx = await enrichForAlert(row, legistar);
const summary = await summarizeMatterBilingual({ fileNumber: ctx.matter.fileNumber, title: row.title, matterText: '', attachments: [] }, { generate });
const footer = buildFooter(ctx.event, ctx.person);
const card = buildAlertCard({ row, matter: ctx.matter, event: ctx.event, summary, footer });

console.log('\nFOOTER (cross-check against Legistar):\n' + footer.text);
const res = await slack.chat.postMessage({ channel, text: card.text, blocks: card.blocks });
console.log(`\nPosted ts=${res.ts} to ${channel}. Open Slack (desktop + mobile) to screenshot.`);
```

- [ ] **Step 4: Run the live verification**

Run: `cd agent && DEMO_CHANNEL_ID=<real channel> node scripts/alert-verify.mjs`
Expected: prints the matter, the footer fields, and a posted message ts. A real bilingual card appears in the channel.

- [ ] **Step 5: Verify against reality (the acceptance gate)**
  - Screenshot the card on **desktop and mobile** (Slack mobile app).
  - **Cross-check** the footer's hearing time/location + alderperson email/phone against the live Legistar source for that matter (the probe in `enrichForAlert`).
  - Click **Watch / History / Ask Gavel** and confirm each ephemeral ack + a logged line (run `agent` locally with `node app.js` or `slack run` so the handlers are live).

- [ ] **Step 6: Commit**

```bash
git add agent/scripts/poll-once.mjs agent/scripts/alert-verify.mjs
git commit -m "feat(alerts): wire alert drain into poll-once + live card verify (MOO-44)"
```

---

## Task 11: Docs, journal, ship

- [ ] **Step 1: Document** the alert commands in root `CLAUDE.md` (Conventions): `node scripts/alert-verify.mjs` posts one real card; `poll-once.mjs` now detects + posts each tick.
- [ ] **Step 2: Full suite + lint** — `cd agent && node --test && npx @biomejs/biome check .` (auto-format new files only).
- [ ] **Step 3: Redeploy Fly** so the live cron posts cards: `cd agent && fly secrets set SLACK_BOT_TOKEN="$SLACK_BOT_TOKEN" --app gavel-poller && fly deploy --remote-only`. Confirm a tick logs `posted N`.
- [ ] **Step 4: Journal** `journal/2026-06-08.md` (session 3) — the card ships, decisions, screenshots, next.
- [ ] **Step 5: Finish the branch** (superpowers:finishing-a-development-branch) → PR to main.
- [ ] **Step 6: Close MOO-44** (linear-build) → Done with the screenshots + footer cross-check + button logs as evidence.

---

## Self-review

**Spec coverage:**
- Always-bilingual one card → Task 2 (bilingual summarizer) + Task 5 (card with EN/ES sections).
- Single bilingual Claude call → Task 2.
- Orchestration extends poller → Task 8 (`processPendingAlerts`) + Task 10 (poll-once wiring).
- `language` field reserved not removed → no task deletes it; matching (Task 4) ignores it. ✓
- Footer sourcing live + static registration link → Task 1 (fetches), Task 3 (footer + constant), Task 6 (enrich).
- Buttons present + fire handlers logged → Task 5 (buttons in card) + Task 9 (handlers).
- `<48h` dormant flag slot → Task 5 (`walkOnFlag`).
- Mobile-first/accessible → Task 5 (single-column, emoji+text labels, fallback `text`).
- Verification (real card, screenshots, footer cross-check, button logs) → Task 10.
- Acceptance "posts unprompted to a subscribed channel" → Task 10 (poll-once on Fly cron posts to matched subscriptions).

**Placeholder scan:** none — every step has concrete code. `DEMO_CHANNEL_ID` and the live URL constant are real runtime values, set in Task 10 / verified in Task 11.

**Type consistency:** the card input shape `{row, matter, event, summary, footer}` matches across `buildAlertCard` (Task 5), `processPendingAlerts` (Task 8), and `alert-verify.mjs` (Task 10). `summarizeMatterBilingual` returns `{en, es, addresses, sourcesUsed}` (Task 2), consumed as `summary.en/.es` everywhere. `buildFooter(event, person)` signature matches its call in `process.js` (`buildFooterText`) and the verify script. `matchSubscriptions(row, subs)` returns channelIds in Task 4 and is consumed in Task 8. Legistar methods `getMatter/getMatterSponsors/getPerson/getEvent` (Task 1) are consumed in `enrichForAlert` (Task 6).
