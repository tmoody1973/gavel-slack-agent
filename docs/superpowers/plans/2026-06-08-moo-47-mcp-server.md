# Milwaukee Civic MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a standalone stdio MCP server (`mcp-server/`) that exposes Milwaukee Legistar as 9 tools, connectable to the Gavel agent and runnable by any civic-tech builder.

**Architecture:** Standalone Node ESM package, sibling to `agent/`. Vendored Legistar client (ported from `agent/poller/legistar.js`, `{client}`-parameterized) feeds a thin tool layer built on `@modelcontextprotocol/sdk` `McpServer` + `StdioServerTransport`. Each tool validates args with Zod, calls the client, and returns `structuredContent`; any failure/empty/sparse case is caught and returned as `{ status: "information_unavailable", reason }` instead of throwing.

**Tech Stack:** Node 20 ESM (no build step, matches repo) · `@modelcontextprotocol/sdk` · `zod` v4 · `node --test` + `node:assert/strict` · `@biomejs/biome`. Live data: Legistar Web API `https://webapi.legistar.com/v1/milwaukee` (no token).

**Reference:** Design `docs/superpowers/2026-06-08-moo-47-mcp-server-design.md`. Endpoints `docs/gavel-legistar-data-reference.md` §"MCP tool surface" (lines 140–148) and gotchas §"Gotchas" (voice votes empty, 1000-row cap, terse titles).

**Language note:** Repo convention is JS ESM run directly (no `tsc`). This package follows that; the acceptance criterion "scaffolded in TypeScript" is met via the SDK's TS types + JSDoc, not a compile step. If literal `.ts` is required later, add a `tsc` build and point `bin` at `build/`.

---

## File Structure

```
mcp-server/
  package.json          # name "milwaukee-civic-mcp", type module, bin, deps
  README.md             # tool catalog, run instructions, agent-connection snippet
  biome.json            # extends repo style (copy agent/biome.json)
  src/
    legistar.js         # vendored client: getJson, mappers, createLegistarClient (+ new methods)
    errors.js           # informationUnavailable(reason); safeCall(fn) wrapper
    tools.js            # registerTools(server, client): all 9 registerTool calls
    server.js           # entrypoint: McpServer + StdioServerTransport + registerTools
  scripts/
    mcp-verify.mjs      # live Legistar calls for >=3 tools, prints real responses
  test/
    legistar.test.js        # vendored mappers + new fetch methods (fakeFetch)
    errors.test.js          # informationUnavailable + safeCall
    tools.test.js           # tool handlers return structuredContent / information_unavailable
```

Responsibilities: `legistar.js` = all HTTP + OData + mapping (the only network code). `errors.js` = the structured-error contract. `tools.js` = arg schemas + handler wiring (no HTTP logic of its own). `server.js` = transport only. Tests mirror `src/` like `agent/tests/` mirrors `agent/`.

---

### Task 0: Scaffold the package

**Files:**
- Create: `mcp-server/package.json`
- Create: `mcp-server/biome.json`
- Create: `mcp-server/src/server.js` (stub)

- [ ] **Step 1: Create `mcp-server/package.json`**

```json
{
  "name": "milwaukee-civic-mcp",
  "version": "0.1.0",
  "description": "MCP server exposing Milwaukee Legistar (city legislation) as tools.",
  "type": "module",
  "bin": { "milwaukee-civic-mcp": "./src/server.js" },
  "files": ["src", "README.md"],
  "scripts": {
    "start": "node src/server.js",
    "test": "node --test",
    "verify": "node scripts/mcp-verify.mjs",
    "lint": "biome check ."
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@biomejs/biome": "^2.4.16"
  }
}
```

- [ ] **Step 2: Copy the repo Biome config**

Run: `cp agent/biome.json mcp-server/biome.json`
Expected: identical style rules to the rest of the repo.

- [ ] **Step 3: Install deps**

Run: `cd mcp-server && npm install`
Expected: lockfile created; `@modelcontextprotocol/sdk` resolves to a 1.x version. If 1.x exposes `registerTool` (it does on current 1.x), proceed; note the resolved version in the commit.

- [ ] **Step 4: Stub `src/server.js` so the package boots**

```js
#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new McpServer({ name: 'milwaukee-civic-mcp', version: '0.1.0' });

const transport = new StdioServerTransport();
await server.connect(transport);
```

- [ ] **Step 5: Verify it boots without crashing**

Run: `cd mcp-server && timeout 2 node src/server.js; echo "exit=$?"`
Expected: no stack trace before the timeout kills it (stdio server idles waiting for a client; `exit=124` from timeout is success).

- [ ] **Step 6: Commit**

```bash
git add mcp-server/package.json mcp-server/biome.json mcp-server/src/server.js mcp-server/package-lock.json
git commit -m "feat(mcp): scaffold milwaukee-civic-mcp stdio package (MOO-47)"
```

---

### Task 1: Vendor the Legistar client

Port `agent/poller/legistar.js` verbatim, then port its tests, to prove the vendored copy is byte-faithful before extending it.

**Files:**
- Create: `mcp-server/src/legistar.js`
- Create: `mcp-server/test/legistar.test.js`

- [ ] **Step 1: Copy the proven client**

Run: `cp agent/poller/legistar.js mcp-server/src/legistar.js`
Expected: file copied. It exports `createLegistarClient` with `fetchUpcomingFinalEvents`, `fetchEventItems`, `getMatter`, `getMatterSponsors`, `getPerson`, `getEvent`, plus mappers and `buildEventsQuery`.

- [ ] **Step 2: Port the existing client test as the regression baseline**

Run: `cp agent/tests/poller/legistar-client.test.js mcp-server/test/legistar.test.js`
Then fix the import path in `mcp-server/test/legistar.test.js`:

```js
import { createLegistarClient } from '../src/legistar.js';
```

- [ ] **Step 3: Run the ported tests — they must pass against the vendored copy**

Run: `cd mcp-server && node --test`
Expected: 3 tests PASS (window query, eventitems Attachments=1, throws on non-ok).

- [ ] **Step 4: Commit**

```bash
git add mcp-server/src/legistar.js mcp-server/test/legistar.test.js
git commit -m "feat(mcp): vendor Legistar client from poller (MOO-47)"
```

---

### Task 2: Structured-error contract

**Files:**
- Create: `mcp-server/src/errors.js`
- Create: `mcp-server/test/errors.test.js`

- [ ] **Step 1: Write failing tests**

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { informationUnavailable, safeCall } from '../src/errors.js';

test('informationUnavailable returns the structured shape', () => {
  assert.deepEqual(informationUnavailable('not found'), {
    status: 'information_unavailable',
    reason: 'not found',
  });
});

test('safeCall returns the fn result on success', async () => {
  const out = await safeCall(async () => ({ ok: 1 }), 'ctx');
  assert.deepEqual(out, { ok: 1 });
});

test('safeCall converts a thrown error to information_unavailable', async () => {
  const out = await safeCall(async () => {
    throw new Error('Legistar request failed: 503');
  }, 'get_matter(99)');
  assert.equal(out.status, 'information_unavailable');
  assert.match(out.reason, /get_matter\(99\)/);
  assert.match(out.reason, /503/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd mcp-server && node --test test/errors.test.js`
Expected: FAIL — `errors.js` not found.

- [ ] **Step 3: Implement `src/errors.js`**

```js
export function informationUnavailable(reason) {
  return { status: 'information_unavailable', reason };
}

export async function safeCall(fn, context) {
  try {
    return await fn();
  } catch (err) {
    return informationUnavailable(`${context}: ${err.message}`);
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd mcp-server && node --test test/errors.test.js`
Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/errors.js mcp-server/test/errors.test.js
git commit -m "feat(mcp): structured information_unavailable error contract (MOO-47)"
```

---

### Task 3: Extend the client with the 5 new fetch methods

Add `getMatterHistories`, `getMatterTexts`, `getMatterAttachments`, `getEventItemVotes`, and `searchMatters` to the vendored client, each TDD'd with `fakeFetch`. Endpoints come straight from the data reference.

**Files:**
- Modify: `mcp-server/src/legistar.js` (add mappers + methods to the returned object)
- Modify: `mcp-server/test/legistar.test.js` (append tests)

- [ ] **Step 1: Append failing tests** (reuse the file's existing `fakeFetch` helper)

```js
test('getMatterHistories hits /matters/{id}/histories with notes', async () => {
  const { fetch, calls } = fakeFetch({
    histories: [{
      MatterHistoryId: 5, MatterHistoryActionDate: '2026-05-01T00:00:00',
      MatterHistoryActionName: 'Held', MatterHistoryActionBodyName: 'ZONING',
      MatterHistoryPassedFlag: 0, MatterHistoryTally: '4-1',
    }],
  });
  const client = createLegistarClient({ fetch, client: 'milwaukee', userAgent: 'UA' });
  const out = await client.getMatterHistories(73181);
  assert.equal(out[0].actionName, 'Held');
  assert.equal(out[0].tally, '4-1');
  assert.ok(calls[0].url.includes('/matters/73181/histories'));
  assert.ok(calls[0].url.includes('AgendaNote=1'));
});

test('getMatterTexts hits /matters/{id}/versions then /texts/{id}', async () => {
  const fetch = async (url) => {
    if (url.includes('/versions')) return { ok: true, status: 200, json: async () => [{ Key: '2', Value: 'v2' }] };
    return { ok: true, status: 200, json: async () => ({ MatterTextId: 2, MatterTextPlain: 'full text' }) };
  };
  const client = createLegistarClient({ fetch, client: 'milwaukee', userAgent: 'UA' });
  const out = await client.getMatterTexts(73181);
  assert.equal(out.plain, 'full text');
});

test('getMatterAttachments hits /matters/{id}/attachments', async () => {
  const { fetch, calls } = fakeFetch({
    attachments: [{ MatterAttachmentId: 7, MatterAttachmentName: 'Staff report', MatterAttachmentHyperlink: 'http://x/File' }],
  });
  const client = createLegistarClient({ fetch, client: 'milwaukee', userAgent: 'UA' });
  const out = await client.getMatterAttachments(73181);
  assert.equal(out[0].name, 'Staff report');
  assert.ok(calls[0].url.includes('/matters/73181/attachments'));
});

test('getEventItemVotes hits /eventitems/{id}/votes, maps members', async () => {
  const { fetch, calls } = fakeFetch({
    votes: [{ VotePersonId: 11, VotePersonName: 'Ald. Smith', VoteValueName: 'Aye' }],
  });
  const client = createLegistarClient({ fetch, client: 'milwaukee', userAgent: 'UA' });
  const out = await client.getEventItemVotes(491773);
  assert.equal(out[0].person, 'Ald. Smith');
  assert.equal(out[0].value, 'Aye');
  assert.ok(calls[0].url.includes('/eventitems/491773/votes'));
});

test('searchMatters builds substringof + $top filter on /matters', async () => {
  const { fetch, calls } = fakeFetch({
    matters: [{ MatterId: 1, MatterFile: '230001', MatterTitle: 'XYZ Holdings rezoning' }],
  });
  const client = createLegistarClient({ fetch, client: 'milwaukee', userAgent: 'UA' });
  const out = await client.searchMatters({ query: 'XYZ Holdings', top: 20 });
  assert.equal(out[0].file, '230001');
  const url = decodeURIComponent(calls[0].url);
  assert.ok(url.includes("substringof('XYZ Holdings',MatterTitle)"));
  assert.ok(url.includes('$top=20'));
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd mcp-server && node --test test/legistar.test.js`
Expected: 5 new tests FAIL — methods undefined.

- [ ] **Step 3: Add mappers near the existing ones in `src/legistar.js`**

```js
export function mapHistory(raw) {
  return {
    id: raw.MatterHistoryId,
    actionDate: raw.MatterHistoryActionDate,
    actionName: raw.MatterHistoryActionName,
    bodyName: raw.MatterHistoryActionBodyName,
    passed: raw.MatterHistoryPassedFlag === 1,
    tally: raw.MatterHistoryTally ?? null,
    actionText: raw.MatterHistoryActionText ?? null,
  };
}

export function mapAttachment(raw) {
  return {
    id: raw.MatterAttachmentId,
    name: raw.MatterAttachmentName,
    url: raw.MatterAttachmentHyperlink ?? null,
  };
}

export function mapVote(raw) {
  return { personId: raw.VotePersonId, person: raw.VotePersonName, value: raw.VoteValueName };
}

export function mapMatterSummary(raw) {
  return {
    matterId: raw.MatterId,
    file: raw.MatterFile ?? null,
    title: raw.MatterTitle ?? null,
    introDate: raw.MatterIntroDate ?? null,
    status: raw.MatterStatusName ?? null,
  };
}
```

- [ ] **Step 4: Add methods inside `createLegistarClient`, before the `return`**

```js
  async function getMatterHistories(matterId) {
    const raw = await getJson(`matters/${matterId}/histories?AgendaNote=1&MinutesNote=1`);
    return raw.map(mapHistory);
  }

  async function getMatterTexts(matterId) {
    const versions = await getJson(`matters/${matterId}/versions`);
    const latest = versions.at(-1);
    if (!latest) return { plain: null, version: null };
    const text = await getJson(`matters/${matterId}/texts/${latest.Key}`);
    return { version: latest.Key, plain: text.MatterTextPlain ?? text.MatterTextRtf ?? null };
  }

  async function getMatterAttachments(matterId) {
    const raw = await getJson(`matters/${matterId}/attachments`);
    return raw.map(mapAttachment);
  }

  async function getEventItemVotes(eventItemId) {
    const raw = await getJson(`eventitems/${eventItemId}/votes`);
    return raw.map(mapVote);
  }

  async function searchMatters({ query, sinceDate, top = 20, skip = 0 }) {
    const clauses = [];
    if (query) clauses.push(`substringof('${query}',MatterTitle)`);
    if (sinceDate) clauses.push(`MatterIntroDate ge datetime'${sinceDate}'`);
    const filter = clauses.length ? `$filter=${clauses.join(' and ')}&` : '';
    const path = `matters?${filter}$orderby=MatterIntroDate desc&$top=${top}&$skip=${skip}`;
    const raw = await getJson(encodeURI(path));
    return raw.map(mapMatterSummary);
  }
```

Then add all five to the returned object:

```js
  return {
    fetchUpcomingFinalEvents, fetchEventItems, getMatter, getMatterSponsors, getPerson, getEvent,
    getMatterHistories, getMatterTexts, getMatterAttachments, getEventItemVotes, searchMatters,
  };
```

- [ ] **Step 5: Run to verify pass**

Run: `cd mcp-server && node --test test/legistar.test.js`
Expected: all tests PASS (3 original + 5 new).

- [ ] **Step 6: Commit**

```bash
git add mcp-server/src/legistar.js mcp-server/test/legistar.test.js
git commit -m "feat(mcp): add histories/texts/attachments/votes/search client methods (MOO-47)"
```

---

### Task 4: Tool layer — register all 9 tools

`registerTools(server, client)` wires each tool: a Zod `inputSchema`, a handler that calls the client through `safeCall`, and a return of `{ content, structuredContent }`. `client` defaults to a `milwaukee` Legistar client but the factory is injected so tests can pass a fake.

**Files:**
- Create: `mcp-server/src/tools.js`
- Create: `mcp-server/test/tools.test.js`

- [ ] **Step 1: Write failing tests** (inject a fake client; assert the contract, not HTTP)

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerTools } from '../src/tools.js';

function harness(clientOverrides) {
  const registered = new Map();
  const server = {
    registerTool(name, config, handler) { registered.set(name, { config, handler }); },
  };
  registerTools(server, clientOverrides);
  return registered;
}

test('registers all nine tools', () => {
  const tools = harness({});
  for (const name of [
    'get_upcoming_events', 'get_event_agenda', 'get_matter', 'get_sponsors',
    'get_matter_history', 'get_matter_text', 'get_attachments', 'get_votes', 'search_matters',
  ]) assert.ok(tools.has(name), `missing ${name}`);
});

test('get_matter returns structuredContent on success', async () => {
  const tools = harness({ getMatter: async (id) => ({ matterId: id, file: '230001' }) });
  const res = await tools.get('get_matter').handler({ matter_id: 42 });
  assert.equal(res.structuredContent.file, '230001');
  assert.equal(res.content[0].type, 'text');
});

test('get_matter degrades to information_unavailable when the client throws', async () => {
  const tools = harness({ getMatter: async () => { throw new Error('Legistar request failed: 404'); } });
  const res = await tools.get('get_matter').handler({ matter_id: 42 });
  assert.equal(res.structuredContent.status, 'information_unavailable');
});

test('get_sponsors enriches each sponsor with a person contact', async () => {
  const tools = harness({
    getMatterSponsors: async () => [{ personId: 11, name: 'Ald. Smith', sequence: 0 }],
    getPerson: async (id) => ({ personId: id, email: 'smith@milwaukee.gov', phone: '414-555-0100' }),
  });
  const res = await tools.get('get_sponsors').handler({ matter_id: 42 });
  assert.equal(res.structuredContent[0].email, 'smith@milwaukee.gov');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd mcp-server && node --test test/tools.test.js`
Expected: FAIL — `tools.js` not found.

- [ ] **Step 3: Implement `src/tools.js`**

```js
import { z } from 'zod';
import { safeCall } from './errors.js';

const text = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value });

export function registerTools(server, client) {
  const tool = (name, config, run) =>
    server.registerTool(name, config, async (args) => text(await safeCall(() => run(args), `${name}(${JSON.stringify(args)})`)));

  tool('get_upcoming_events',
    { description: 'Final-agenda meetings in the next 7 days.', inputSchema: z.object({}) },
    () => client.fetchUpcomingFinalEvents());

  tool('get_event_agenda',
    { description: 'Agenda items (with attachments) for a meeting.', inputSchema: z.object({ event_id: z.number() }) },
    ({ event_id }) => client.fetchEventItems(event_id));

  tool('get_matter',
    { description: 'A single legislative file by matter id.', inputSchema: z.object({ matter_id: z.number() }) },
    ({ matter_id }) => client.getMatter(matter_id));

  tool('get_sponsors',
    { description: 'Sponsors of a matter with contact info.', inputSchema: z.object({ matter_id: z.number() }) },
    async ({ matter_id }) => {
      const sponsors = await client.getMatterSponsors(matter_id);
      return Promise.all(sponsors.map(async (s) => ({ ...s, ...(await client.getPerson(s.personId)) })));
    });

  tool('get_matter_history',
    { description: 'Every action taken on a matter (committee→Council).', inputSchema: z.object({ matter_id: z.number() }) },
    ({ matter_id }) => client.getMatterHistories(matter_id));

  tool('get_matter_text',
    { description: 'Latest full legal text of a matter.', inputSchema: z.object({ matter_id: z.number() }) },
    ({ matter_id }) => client.getMatterTexts(matter_id));

  tool('get_attachments',
    { description: 'Supporting documents for a matter.', inputSchema: z.object({ matter_id: z.number() }) },
    ({ matter_id }) => client.getMatterAttachments(matter_id));

  tool('get_votes',
    { description: 'Per-member votes for an agenda item (empty for voice votes).', inputSchema: z.object({ event_item_id: z.number() }) },
    ({ event_item_id }) => client.getEventItemVotes(event_item_id));

  tool('search_matters',
    { description: 'Search legislation by title substring and/or intro date.', inputSchema: z.object({
      query: z.string().optional(), since_date: z.string().optional(), top: z.number().optional(), skip: z.number().optional(),
    }) },
    ({ query, since_date, top, skip }) => client.searchMatters({ query, sinceDate: since_date, top, skip }));
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd mcp-server && node --test test/tools.test.js`
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/tools.js mcp-server/test/tools.test.js
git commit -m "feat(mcp): register all 9 Legistar tools with structured-error contract (MOO-47)"
```

---

### Task 5: Wire the server entrypoint

**Files:**
- Modify: `mcp-server/src/server.js`

- [ ] **Step 1: Replace the stub with the full entrypoint**

```js
#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createLegistarClient } from './legistar.js';
import { registerTools } from './tools.js';

const CLIENT = process.env.LEGISTAR_CLIENT || 'milwaukee';
const USER_AGENT =
  'GavelCivicMCP/0.1 (+https://github.com/tmoody1973/gavel-slack-agent; contact tarik@radiomilwaukee.org)';

const legistar = createLegistarClient({ fetch, client: CLIENT, userAgent: USER_AGENT });
const server = new McpServer({ name: 'milwaukee-civic-mcp', version: '0.1.0' });
registerTools(server, legistar);

const transport = new StdioServerTransport();
await server.connect(transport);
```

- [ ] **Step 2: Verify it boots with tools registered**

Run: `cd mcp-server && timeout 2 node src/server.js; echo "exit=$?"`
Expected: no stack trace; `exit=124` (idling on stdio). A registration typo would crash before the timeout.

- [ ] **Step 3: Commit**

```bash
git add mcp-server/src/server.js
git commit -m "feat(mcp): wire stdio entrypoint with live Legistar client (MOO-47)"
```

---

### Task 6: Live verification script (verification checklist)

**Files:**
- Create: `mcp-server/scripts/mcp-verify.mjs`

- [ ] **Step 1: Write the live verify script**

```js
#!/usr/bin/env node
// Calls >=3 tools against LIVE Legistar and prints real responses.
// Proves: get_upcoming_events, get_event_agenda, get_sponsors (alderperson + contact).
import { createLegistarClient } from '../src/legistar.js';

const UA = 'GavelCivicMCP/0.1 (+https://github.com/tmoody1973/gavel-slack-agent; contact tarik@radiomilwaukee.org)';
const client = createLegistarClient({ fetch, client: 'milwaukee', userAgent: UA });

const events = await client.fetchUpcomingFinalEvents();
console.log(`get_upcoming_events -> ${events.length} events; first:`, events[0]);

if (events[0]) {
  const items = await client.fetchEventItems(events[0].eventId);
  const withMatter = items.find((i) => i.eventItemId && i.matterId);
  console.log(`get_event_agenda(${events[0].eventId}) -> ${items.length} items; first w/ matter:`, withMatter);

  if (withMatter) {
    const sponsors = await client.getMatterSponsors(withMatter.matterId);
    const person = sponsors[0] ? await client.getPerson(sponsors[0].personId) : null;
    console.log('get_sponsors -> first sponsor + contact:', sponsors[0], person);
  }
}
```

- [ ] **Step 2: Run against live Legistar**

Run: `cd mcp-server && node scripts/mcp-verify.mjs`
Expected: real event count, a real agenda item with a `matterId`, and a real sponsor with `email`/`phone`. **Paste this output into the MOO-47 verification comment.** (If the current agenda has no roll-call sponsor contact, pick a known recent matter id and call `getMatterSponsors`/`getPerson` directly — the criterion needs one real alderperson + contact.)

- [ ] **Step 3: Commit**

```bash
git add mcp-server/scripts/mcp-verify.mjs
git commit -m "test(mcp): live Legistar verify script for 3 tools (MOO-47)"
```

---

### Task 7: Connect the server to the agent

Add an external stdio `mcpServers` entry so the agent can invoke a tool through the MCP connection (separate from its in-process emoji tool).

**Files:**
- Modify: `agent/agent.js` (the `query()` options `mcpServers`) — read it first to match the existing shape.

- [ ] **Step 1: Read how the agent registers MCP servers**

Run: `grep -n "mcpServers\|createSdkMcpServer" agent/agent.js`
Expected: find the `mcpServers` option object passed to `query()`.

- [ ] **Step 2: Add the external stdio server beside the existing in-process one**

Add to the `mcpServers` map (keep the existing emoji SDK server):

```js
mcpServers: {
  // ...existing in-process server(s)...
  'milwaukee-civic': {
    command: 'node',
    args: [new URL('../mcp-server/src/server.js', import.meta.url).pathname],
  },
},
```

- [ ] **Step 3: Boot the agent and confirm a tool invocation through MCP**

Run (from the main checkout's `agent/`, which has `.slack/` + env): `slack run -a A0B8GP68PLJ --org-workspace-grant all --force`
Then DM the agent something that routes to a tool (e.g. "what meetings are coming up?") and confirm the agent logs a `milwaukee-civic` tool call. **Capture the log line for the verification comment.**

- [ ] **Step 4: Commit**

```bash
git add agent/agent.js
git commit -m "feat(agent): connect milwaukee-civic MCP server over stdio (MOO-47)"
```

---

### Task 8: README for open-source reuse

**Files:**
- Create: `mcp-server/README.md`

- [ ] **Step 1: Write the README**

Include: one-paragraph what/why; install (`npm install`); run (`npx milwaukee-civic-mcp` or `node src/server.js`); the 9-tool catalog table (name · args · what it returns · Legistar endpoint); the structured `information_unavailable` contract; `LEGISTAR_CLIENT` env for multi-city; and the agent-connection `mcpServers` snippet from Task 7. Note the data-reference gotchas users will hit (voice votes empty, terse titles, 1000-row cap).

- [ ] **Step 2: Commit**

```bash
git add mcp-server/README.md
git commit -m "docs(mcp): README documenting the 9 tools for reuse (MOO-47)"
```

---

### Task 9: Lint, full suite, close the issue

- [ ] **Step 1: Lint the package**

Run: `cd mcp-server && npx @biomejs/biome check .`
Expected: no errors. Fix any (often import order / formatting).

- [ ] **Step 2: Run the whole package suite**

Run: `cd mcp-server && node --test`
Expected: all tests PASS (legistar + errors + tools).

- [ ] **Step 3: Confirm the agent suite still passes** (Task 7 touched `agent/agent.js`)

Run: `cd agent && node --test`
Expected: still green (89/89 or more).

- [ ] **Step 4: Verification gate — prove against the checklist**

Confirm, with pasted real output:
- [ ] ≥3 tools called live (Task 6 output).
- [ ] `get_sponsors` returned a real alderperson + contact.
- [ ] Agent invoked a tool through the MCP connection (Task 7 log line).

- [ ] **Step 5: Review, then ship**

Use `superpowers:requesting-code-review` (load-bearing, sponsor-tech). Address findings. Then `superpowers:finishing-a-development-branch` → PR. On merge, `linear-build` moves MOO-47 → Done with the evidence comment. File the tech-debt dedupe issue (vendored client → shared `legistar-core`).

---

## Self-Review

**Spec coverage (vs acceptance criteria):**
- "Scaffolded in TypeScript, runnable + connectable" → Task 0 (scaffold/boot), Task 5 (entrypoint), Task 7 (agent connection). Language note explains the JS-ESM choice.
- "9 tools implemented" → Task 4 registers all 9; Task 3 supplies the 5 new client methods; Tasks 1 reuses the other 4.
- "`{Client}` parameterized" → vendored client keeps the `client` arg (Task 1); `LEGISTAR_CLIENT` env (Task 5).
- "Structured information_unavailable" → Task 2 contract, applied to every tool in Task 4.
- "README" → Task 8.
- Verification checklist → Task 6 (≥3 live tools incl. sponsors+contact) and Task 7 (agent invocation).

**Out of scope honored:** no CKAN/parcel, no knowledge/video, no `get_member_record`, no persistence.

**Placeholder scan:** every code step shows full code; README step (Task 8) lists exact required sections rather than prose code, acceptable for a docs artifact.

**Type/name consistency:** client methods `getMatterHistories/getMatterTexts/getMatterAttachments/getEventItemVotes/searchMatters` defined in Task 3 are the same names called in Task 4; tool ids match the acceptance list and the Task 4 test; `informationUnavailable`/`safeCall` defined in Task 2 are used in Task 4.

**Risk to live spine:** none — `agent/poller/` untouched; only `agent/agent.js` gains an `mcpServers` entry (Task 7), guarded by the agent-suite check in Task 9.
