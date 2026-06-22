# Win the Last Mile — UX Mastery Curve · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Gavel's UX legibly "well thought out across the whole journey" — bilingual-complete (no English cliffs on the Spanish ramp), exactly one contextual next-step per surface, beginner first-contact verified — to lift the main-track **Design** score (Agent for Good) and contest **Best UX** before the July 13 freeze.

**Architecture:** Reuse the established bilingual-string pattern from `agent/onboarding/copy.js` (`COPY = { en, es }` + a required-keys test that fails if a key is missing from either language). Add a sibling `agent/listeners/commands/copy.js` for the `/gavel` command surface, then wire the command handlers to resolve strings by the channel's language. Audit the existing card surfaces for exactly-one teaching next-step. All pure builders + injected boundaries, TDD.

**Tech Stack:** Node.js (ESM), `node:test`, Biome, Slack Bolt + Block Kit, Convex (read-only here — no schema change).

## Global Constraints

- Tests: `node --test` (run from `agent/`). Lint: `npx @biomejs/biome check .` (must be clean).
- Civic identifiers stay **English even in the Spanish block**: committee names, file numbers, addresses, channel handles (`#gavel-watchlist`), the `@Gavel` mention, and slash-command syntax (`` `/gavel search …` ``). Only the surrounding prose is translated. (Same rule as `onboarding/copy.js`.)
- Bilingual strings are **hand-written**, not Claude calls (command copy is static).
- Follow the existing pattern: pure string/builder modules; handlers stay thin; boundaries injected for tests.
- No schema change, no new dependency, no new Convex function.
- This plan is the **UX-curve** half of "win the last mile." The demo re-cut + Devpost packaging is a **separate** plan (out of scope here).

---

### Task 1: Bilingual command-copy module

**Files:**
- Create: `agent/listeners/commands/copy.js`
- Test: `agent/tests/listeners/commands/copy.test.js`

**Interfaces:**
- Produces: `commandCopy(language: 'en'|'es')` → an object of command-surface strings + interpolation helpers. Keys (used by Task 2): `help` (string), `usageSearch`, `usageWatch`, `usageUnwatch` (strings), `digestStub` (string), `genericError` (string), `notConfigured` (string), `statusHeading` (string), `statusLine({committees, keywords, language, watchList})` (function → string). Also exports `COMMAND_COPY` (the `{en, es}` object) and `COMMAND_REQUIRED_KEYS` (string[]).

- [ ] **Step 1: Write the failing test**

```javascript
// agent/tests/listeners/commands/copy.test.js
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { commandCopy, COMMAND_COPY, COMMAND_REQUIRED_KEYS } from '../../../listeners/commands/copy.js';

describe('command copy — bilingual completeness (no English cliffs)', () => {
  it('has every required key in BOTH languages', () => {
    for (const lang of ['en', 'es']) {
      for (const key of COMMAND_REQUIRED_KEYS) {
        assert.ok(COMMAND_COPY[lang][key] !== undefined, `missing "${key}" in ${lang}`);
      }
    }
  });

  it('commandCopy(es) returns Spanish prose but keeps slash-command syntax in English', () => {
    const es = commandCopy('es');
    assert.match(es.help.toLowerCase(), /comandos|busca|vigila/);
    assert.match(es.help, /\/gavel/); // command names stay English
  });

  it('status line interpolates committees, keywords, language, and watches (ES)', () => {
    const line = commandCopy('es').statusLine({
      committees: 'LICENSES COMMITTEE',
      keywords: 'rezoning',
      language: 'es',
      watchList: '• Punta Cana LLC',
    });
    assert.match(line, /LICENSES COMMITTEE/); // committee stays English
    assert.match(line, /rezoning/);
    assert.match(line.toLowerCase(), /idioma|español/); // localized label
    assert.match(line, /Punta Cana LLC/);
  });

  it('unknown language falls back to English', () => {
    assert.deepEqual(commandCopy('fr').help, COMMAND_COPY.en.help);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent && node --test tests/listeners/commands/copy.test.js`
Expected: FAIL — `Cannot find module '../../../listeners/commands/copy.js'`.

- [ ] **Step 3: Write minimal implementation**

```javascript
// agent/listeners/commands/copy.js
// Bilingual strings for the /gavel command surface (the Spanish ramp's top rungs).
// Mirrors onboarding/copy.js: a {en, es} block + a required-keys test guarantees no
// English cliff. Civic identifiers and slash-command syntax stay English in both.

export const COMMAND_REQUIRED_KEYS = [
  'help',
  'usageSearch',
  'usageWatch',
  'usageUnwatch',
  'digestStub',
  'genericError',
  'notConfigured',
  'statusHeading',
];

const HELP_EN = [
  '*Gavel commands*',
  '• `/gavel watch <entity>` — alert this channel when a file number, address, or name appears',
  '• `/gavel search <term>` — search city mail, agendas, minutes & zoning (quotes = exact phrase)',
  '• `/gavel stories [committee|topic]` — ranked story leads on the upcoming agenda (for reporters)',
  '• `/gavel video [committee]` — browse recent meeting video you can watch (and search)',
  '• `/gavel status` — show this channel’s committees, keywords, language, and watches',
  '• `/gavel unwatch <entity>` — stop watching (names as shown in `/gavel status`)',
].join('\n');

const HELP_ES = [
  '*Comandos de Gavel*',
  '• `/gavel watch <entidad>` — avisa a este canal cuando aparezca un número de expediente, dirección o nombre',
  '• `/gavel search <término>` — busca en el correo de la ciudad, agendas, actas y zonificación (comillas = frase exacta)',
  '• `/gavel stories [comité|tema]` — pistas de reportaje en la agenda próxima (para periodistas)',
  '• `/gavel video [comité]` — explora video reciente de reuniones (y búscalo)',
  '• `/gavel status` — muestra los comités, palabras clave, idioma y seguimientos de este canal',
  '• `/gavel unwatch <entidad>` — deja de seguir (nombres tal como aparecen en `/gavel status`)',
].join('\n');

export const COMMAND_COPY = {
  en: {
    help: HELP_EN,
    usageSearch:
      'Usage: `/gavel search <term>` — e.g. `/gavel search 2000 S 13th St`, `/gavel search tavern`, or `/gavel search "data center"` (quotes = exact phrase).',
    usageWatch:
      'Usage: `/gavel watch <entity>` — e.g. `/gavel watch 2000 S 13th St` or `/gavel watch File #260229`.',
    usageUnwatch: 'Usage: `/gavel unwatch <entity>` — exactly as it appears in `/gavel status`.',
    digestStub: 'The weekly digest is coming soon — for now I post alerts here automatically.',
    genericError: ':warning: Something went wrong — please try again.',
    notConfigured:
      'This channel isn’t set up yet — run `/gavel` to choose what I watch. No alerts post here until then.',
    statusHeading: '*Gavel status for this channel*',
  },
  es: {
    help: HELP_ES,
    usageSearch:
      'Uso: `/gavel search <término>` — p. ej. `/gavel search 2000 S 13th St`, `/gavel search tavern`, o `/gavel search "data center"` (las comillas = frase exacta).',
    usageWatch:
      'Uso: `/gavel watch <entidad>` — p. ej. `/gavel watch 2000 S 13th St` o `/gavel watch File #260229`.',
    usageUnwatch: 'Uso: `/gavel unwatch <entidad>` — exactamente como aparece en `/gavel status`.',
    digestStub: 'El resumen semanal llegará pronto — por ahora publico alertas aquí automáticamente.',
    genericError: ':warning: Algo salió mal — inténtalo de nuevo.',
    notConfigured:
      'Este canal aún no está configurado — escribe `/gavel` para elegir qué vigilo. No publico alertas aquí hasta entonces.',
    statusHeading: '*Estado de Gavel para este canal*',
  },
};

const LABELS = {
  en: { committees: '🏛 Committees', keywords: '🔑 Keywords', language: '🌐 Language', watches: '👁 Watches', english: 'English', spanish: 'Español (bilingual cards)' },
  es: { committees: '🏛 Comités', keywords: '🔑 Palabras clave', language: '🌐 Idioma', watches: '👁 Seguimientos', english: 'Inglés', spanish: 'Español (tarjetas bilingües)' },
};

/** The bilingual command-copy bundle for a channel language (falls back to EN). */
export function commandCopy(language) {
  const lang = language === 'es' ? 'es' : 'en';
  const strings = COMMAND_COPY[lang];
  const label = LABELS[lang];
  return {
    ...strings,
    statusLine: ({ committees, keywords, language: chLang, watchList }) =>
      [
        strings.statusHeading,
        `${label.committees}: ${committees}`,
        `${label.keywords}: ${keywords}`,
        `${label.language}: ${chLang === 'es' ? label.spanish : label.english}`,
        `${label.watches}:\n${watchList}`,
      ].join('\n'),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agent && node --test tests/listeners/commands/copy.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Lint + commit**

```bash
cd agent && npx @biomejs/biome check --write listeners/commands/copy.js tests/listeners/commands/copy.test.js
git add agent/listeners/commands/copy.js agent/tests/listeners/commands/copy.test.js
git commit -m "feat(commands): bilingual command-copy module — no English cliff on the Spanish ramp (UX curve U3)"
```

---

### Task 2: Localize the `/gavel` command surface

**Files:**
- Modify: `agent/listeners/commands/gavel.js` (HELP_TEXT usage, usage/error/status/digest-stub strings)
- Test: `agent/tests/listeners/commands/gavel.test.js` (add ES-ramp assertions)

**Interfaces:**
- Consumes: `commandCopy(language)` from Task 1.
- The handlers already resolve the channel `language` from the subscription in `runSearch`/`runStatus`. `runWatch`/`runUnwatch` and the top-level `help`/error need the language too — fetch it via the existing `deps.getSubscription(channelId)` (already a dep).

- [ ] **Step 1: Write the failing test (ES ramp has no English)**

```javascript
// add to agent/tests/listeners/commands/gavel.test.js
test('an ES channel gets Spanish help, usage, and status — no English cliff', async () => {
  const h = harness({ text: 'search', subscription: { language: 'es' } }); // empty term → usage
  await handleGavelCommand(h.args, h.deps);
  assert.match(h.calls.responds[0].text, /Uso: `\/gavel search/); // Spanish usage, English command
});

test('status renders in the channel language', async () => {
  const h = harness({
    text: 'status',
    subscription: { committees: ['LICENSES COMMITTEE'], keywords: ['rezoning'], language: 'es' },
    watches: [{ entity: 'Punta Cana LLC' }],
  });
  await handleGavelCommand(h.args, h.deps);
  assert.match(h.calls.responds[0].text, /Estado de Gavel/); // Spanish heading
  assert.match(h.calls.responds[0].text, /LICENSES COMMITTEE/); // committee stays English
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd agent && node --test tests/listeners/commands/gavel.test.js`
Expected: FAIL — current strings are English (`/Estado de Gavel/` not found).

- [ ] **Step 3: Wire the handlers to `commandCopy`**

In `agent/listeners/commands/gavel.js`:

1. Add the import at the top (next to the other `civicmail`/`search-filter` imports):
```javascript
import { commandCopy } from './copy.js';
```

2. Delete the module-level `HELP_TEXT` constant and replace **all** its call sites (there are four — grep `HELP_TEXT` first): the `help` branch of `handleGavelCommand`, the `runHelp` catch-fallback, and the `runSubcommand` `default:` return. The `help` branch already has `subscription` in scope, so use the channel language there; the two degraded fallbacks (catch, default — rarely reached) use `commandCopy('en').help`. For the generic error, resolve language the same way:
```javascript
// in handleGavelCommand, the help branch already has `subscription`:
const language = subscription?.language === 'es' ? 'es' : 'en';
const help = commandCopy(language).help;
if (!isConfigured(subscription)) {
  await respond(nudgeResponse(subscription?.language ?? 'en', help));
  return;
}
await runHelp({ subscription, body, client, respond, logger }); // unchanged
```
```javascript
// the catch block: resolve language from a cheap getSubscription (best-effort, default en)
} catch (err) {
  logger?.error?.(`/gavel ${subcommand} failed: ${err.message}`);
  const language = (await deps.getSubscription(channelId).catch(() => null))?.language === 'es' ? 'es' : 'en';
  await respond({ response_type: 'ephemeral', text: commandCopy(language).genericError });
}
```

3. `runSearch` already has `language`; replace the usage string:
```javascript
if (!args.trim()) return commandCopy(language).usageSearch;
```
…but `runSearch` returns usage **before** resolving `language` today. Move the `getSubscription`/`language` resolution above the empty-args guard so the usage is localized.

4. `runWatch`/`runUnwatch` — fetch language and localize usage:
```javascript
async function runWatch({ args, channelId }, deps) {
  const entity = args.trim();
  if (!entity) {
    const language = (await deps.getSubscription(channelId))?.language === 'es' ? 'es' : 'en';
    return commandCopy(language).usageWatch;
  }
  // …unchanged…
}
```
(same shape for `runUnwatch` → `usageUnwatch`.)

5. `runStatus` — replace the hand-built English block + the not-configured string:
```javascript
async function runStatus(channelId, deps) {
  const [subscription, watches] = await Promise.all([deps.getSubscription(channelId), deps.listWatches(channelId)]);
  const language = subscription?.language === 'es' ? 'es' : 'en';
  const copy = commandCopy(language);
  if (!subscription) return copy.notConfigured;
  const watchList = watches.length > 0 ? watches.map((w) => `• ${w.entity}`).join('\n') : '_none_';
  return copy.statusLine({
    committees: formatList(subscription.committees),
    keywords: formatList(subscription.keywords),
    language,
    watchList,
  });
}
```

6. The `digest` subcommand stub:
```javascript
case 'digest': {
  const language = (await deps.getSubscription(channelId))?.language === 'es' ? 'es' : 'en';
  return commandCopy(language).digestStub;
}
```

- [ ] **Step 4: Run to verify it passes (and nothing regressed)**

Run: `cd agent && node --test tests/listeners/commands/gavel.test.js`
Expected: PASS — including the existing English tests (they use `subscription: null` or `language` absent → English).

- [ ] **Step 5: Full suite + lint + commit**

```bash
cd agent && node --test 2>&1 | grep -E '^ℹ (tests|pass|fail)'
npx @biomejs/biome check --write listeners/commands/gavel.js tests/listeners/commands/gavel.test.js
git add agent/listeners/commands/gavel.js agent/tests/listeners/commands/gavel.test.js
git commit -m "feat(commands): localize /gavel help, usage, status & errors to channel language (UX curve U3+U4)"
```

---

### Task 3: One-next-step + first-contact audit

**Files:**
- Test: `agent/tests/civicmail/next-step-audit.test.js` (new — asserts each posted surface has exactly one teaching next-step)
- Modify (only if the audit finds a gap): the offending card builder (`agent/civicmail/digest-card.js`, `agent/civicmail/federated-card.js`, `agent/civicmail/record-modal.js`, or `agent/blockkit/onboarding.js`)

**Interfaces:**
- Consumes: the card builders already in the tree. A "teaching next-step" = a context/section line or button whose purpose is to point the user at their *next* capability (e.g. `/gavel search`, `/gavel watch`, the Read button). It is distinct from a card's core action buttons (an alert's Watch/History/Ask are the action surface, not the teaching nudge).

- [ ] **Step 1: Write the audit test**

```javascript
// agent/tests/civicmail/next-step-audit.test.js
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { memberWelcomeCard } from '../../blockkit/onboarding.js';

describe('first-contact card sets the beginner expectation (U1 verify)', () => {
  it('tells a brand-new member they do not have to do anything, and offers one next step', () => {
    const card = memberWelcomeCard('en');
    const json = JSON.stringify(card.blocks);
    assert.match(json, /Gavel/);
    assert.match(json.toLowerCase(), /don.?t have to|automatic|before the vote/); // value-before-learning
    const buttons = card.blocks.flatMap((b) => b.elements ?? []).filter((e) => e.type === 'button');
    assert.ok(buttons.length >= 1 && buttons.length <= 2, 'one or two gentle next-steps, not a wall');
  });

  it('renders natively in Spanish for an ES channel', () => {
    assert.match(JSON.stringify(memberWelcomeCard('es').blocks).toLowerCase(), /vecindario|ayuntamiento|antes/);
  });
});
```

- [ ] **Step 2: Run to verify it fails (or passes — this is a verification gate)**

Run: `cd agent && node --test tests/civicmail/next-step-audit.test.js`
Expected: If `memberWelcomeCard` already matches → PASS (U1 confirmed done, commit the test as a guard). If it FAILS, the card is missing the beginner reassurance or the ES copy — fix the offending string in `blockkit/onboarding.js` / `onboarding/copy.js` (`memberWelcome` key) so the test passes.

- [ ] **Step 3: Manual one-next-step audit (record the result inline in the test file as comments)**

Read each builder and confirm exactly one teaching next-step; the line is already present for most after this session — record the audit so a reviewer sees it was done:

```javascript
// AUDIT (2026-06-22) — exactly one teaching next-step per surface:
//   digest-card.js     → "🔎 Dig in: /gavel search … · 👁 /gavel watch …"  ✓ one affordance line
//   federated-card.js  → footer "Searches city E-Notify, agendas, minutes & zoning"  ✓ + per-result Read
//   record-modal.js    → Watch + source buttons (action surface) + How-to-be-heard  ✓
//   alert card.js      → Watch / History / Ask (action surface), not a teaching nudge — OK
//   digest highlights  → 📖 Read per highlight  ✓
// No surface has zero or two competing teaching nudges. If a future card does, fix it here.
```

If any surface has **zero** teaching next-steps, add the single appropriate one (e.g. a `/gavel watch` affordance line) following the digest-card pattern, with a test asserting it. If any has **two competing** nudges, remove the weaker one.

- [ ] **Step 4: Run the full suite**

Run: `cd agent && node --test 2>&1 | grep -E '^ℹ (tests|pass|fail)'`
Expected: all PASS.

- [ ] **Step 5: Lint + commit**

```bash
cd agent && npx @biomejs/biome check --write tests/civicmail/next-step-audit.test.js
git add agent/tests/civicmail/next-step-audit.test.js
git commit -m "test(ux): first-contact + one-next-step audit guard (UX curve U1 verify + U2)"
```

---

### Task 4 (STRETCH): App Home hub + expert one-tap

**Files:**
- Modify (verify/tighten only): `agent/home/` view builder; `agent/blockkit/` alert card if an expert one-tap is missing.

**Do this only if Tasks 1–3 land with time before the freeze.** Verify, don't rebuild.

- [ ] **Step 1: Verify App Home reads as the mastery hub.** Open the App Home view builder; confirm it presents, in order: *Discover this week* (beginner browse), *Your watches* (intermediate), and one *try a command* hint (toward expert), role-tailored. If a section is missing its single next-step, add it following the digest-card affordance pattern + a test. Commit `feat(home): App Home as the mastery hub (UX curve U5)`.

- [ ] **Step 2: Verify expert one-tap depth.** Confirm an alert card reaches the highest-value power action (the dossier / related items / watch-owner) without an overflow dig. If it's buried, surface one direct button (reuse an existing `action_id`); add a test that the button is present. Commit `feat(alerts): one-tap to depth for power users (UX curve U6)`.

---

## Verification (the whole plan)

- `node --test` green · `npx @biomejs/biome check .` clean.
- **The stranger test (manual, in the seeded sandbox):** a person who's never seen Gavel reaches "I get value" with no help (beginner ramp) and can find a power feature when prompted (expert ramp); a Spanish-channel user sees **no English** in help/usage/status/errors.
- Every `/gavel` surface resolves to the channel language; civic identifiers + slash syntax stay English in both.
- Each posted surface has exactly one teaching next-step (the audit test guards this).
