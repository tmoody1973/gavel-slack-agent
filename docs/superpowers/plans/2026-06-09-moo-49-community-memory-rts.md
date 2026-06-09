# MOO-49 — Community Memory via Real-Time Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Gavel agent a `search_community_memory` tool that live-queries the workspace's own Slack history via `assistant.search.context` (EN+ES, merged/deduped, never stored), presented beside the official civic record, with slack-mcp search as the fallback when RTS is blocked.

**Architecture:** A new `agent/agent/community-memory/` module — `rts-client.js` (one RTS HTTP call, fetch injected), `merge.js` (pure merge/dedup/format), `search.js` (EN+ES fan-out + fallback orchestration), `tool.js` (SDK tool + in-process MCP server). `agent.js` gains an exported `buildAgentOptions(deps, env)` that resolves the user token (`deps.userToken ?? env.SLACK_USER_TOKEN` — the prod gotcha fix), registers `community-memory` + `slack-mcp` when a token exists, and appends a COMMUNITY MEMORY system-prompt section.

**Tech Stack:** Node ESM, `node --test` (node:assert + node:test mock), `@anthropic-ai/claude-agent-sdk` `tool()`/`createSdkMcpServer()`, Zod v4, Biome.

**Spec:** `docs/superpowers/specs/2026-06-09-moo-49-community-memory-rts-design.md` (on `main`).

**Hard rule:** No Slack message content is ever persisted or logged. Nothing in this module may import Convex or write message bodies anywhere.

**Working dir:** all commands run from `agent/` inside the worktree. Run `npm install` once first (fresh worktree has no `node_modules`).

---

### Task 1: `merge.js` — pure merge/dedup/format

**Files:**
- Create: `agent/agent/community-memory/merge.js`
- Test: `agent/tests/community-memory/merge.test.js`

RTS message results carry `channel_id`, `message_ts`, `author_user_id`, `is_author_bot`, `content`, `permalink` (fields are accessed defensively).

- [ ] **Step 1: Write the failing tests**

```js
import assert from 'node:assert';
import { describe, it } from 'node:test';

import { formatResultsAsText, mergeAndDedupe } from '../../agent/community-memory/merge.js';

function message(overrides = {}) {
  return {
    channel_id: 'C001',
    message_ts: '1710000000.000100',
    author_user_id: 'U001',
    is_author_bot: false,
    content: 'we should oppose this rezoning',
    permalink: 'https://example.slack.com/archives/C001/p1710000000000100',
    ...overrides,
  };
}

describe('mergeAndDedupe', () => {
  it('removes duplicates that appear in both language result sets', () => {
    const shared = message();
    const enOnly = message({ message_ts: '1710000001.000100' });
    const merged = mergeAndDedupe([shared, enOnly], [shared]);
    assert.strictEqual(merged.length, 2);
  });

  it('keeps messages with the same ts in different channels', () => {
    const a = message({ channel_id: 'C001' });
    const b = message({ channel_id: 'C002' });
    assert.strictEqual(mergeAndDedupe([a], [b]).length, 2);
  });

  it('sorts newest-first by message_ts', () => {
    const older = message({ message_ts: '1700000000.000100' });
    const newer = message({ message_ts: '1720000000.000100' });
    const merged = mergeAndDedupe([older], [newer]);
    assert.strictEqual(merged[0].message_ts, '1720000000.000100');
  });

  it('caps the merged list at 8 results', () => {
    const en = Array.from({ length: 6 }, (_, i) => message({ message_ts: `17100000${i}0.000100` }));
    const es = Array.from({ length: 6 }, (_, i) => message({ message_ts: `17200000${i}0.000100` }));
    assert.strictEqual(mergeAndDedupe(en, es).length, 8);
  });

  it('handles empty and one-sided inputs', () => {
    assert.deepStrictEqual(mergeAndDedupe([], []), []);
    assert.strictEqual(mergeAndDedupe([message()], []).length, 1);
  });
});

describe('formatResultsAsText', () => {
  it('returns a no-results sentence for an empty list', () => {
    assert.match(formatResultsAsText([]), /No prior community discussion/);
  });

  it('includes date, channel, author, snippet, and permalink', () => {
    const text = formatResultsAsText([message()]);
    assert.match(text, /2024-03-09/);
    assert.match(text, /<#C001>/);
    assert.match(text, /<@U001>/);
    assert.match(text, /oppose this rezoning/);
    assert.match(text, /p1710000000000100/);
  });

  it('labels bot authors instead of mentioning them', () => {
    const text = formatResultsAsText([message({ is_author_bot: true })]);
    assert.match(text, /a bot/);
  });

  it('truncates long content to 300 characters', () => {
    const text = formatResultsAsText([message({ content: 'x'.repeat(500) })]);
    assert.ok(!text.includes('x'.repeat(301)));
  });

  it('survives missing fields without throwing', () => {
    const text = formatResultsAsText([{ message_ts: 'not-a-number' }]);
    assert.match(text, /unknown date/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `agent/`): `node --test tests/community-memory/merge.test.js`
Expected: FAIL — `Cannot find module ... merge.js`

- [ ] **Step 3: Write the implementation**

```js
const MERGED_RESULT_CAP = 8;
const SNIPPET_MAX_LENGTH = 300;

/**
 * Merge EN and ES RTS message results, dedupe by channel+ts, newest first, capped.
 * @param {Array<Record<string, any>>} enMessages
 * @param {Array<Record<string, any>>} esMessages
 * @returns {Array<Record<string, any>>}
 */
export function mergeAndDedupe(enMessages, esMessages) {
  const byKey = new Map();
  for (const message of [...enMessages, ...esMessages]) {
    const key = `${message.channel_id}:${message.message_ts}`;
    if (!byKey.has(key)) {
      byKey.set(key, message);
    }
  }
  return [...byKey.values()]
    .sort((a, b) => Number(b.message_ts) - Number(a.message_ts))
    .slice(0, MERGED_RESULT_CAP);
}

/**
 * Render merged RTS results as plain text for the agent (no structuredContent —
 * array payloads fail MCP -32602).
 * @param {Array<Record<string, any>>} messages
 * @returns {string}
 */
export function formatResultsAsText(messages) {
  if (messages.length === 0) {
    return 'No prior community discussion found for this topic.';
  }
  const lines = messages.map((message, index) => {
    const date = formatDate(message.message_ts);
    const author = message.is_author_bot ? 'a bot' : `<@${message.author_user_id}>`;
    const snippet = truncate(message.content ?? '', SNIPPET_MAX_LENGTH);
    const permalink = message.permalink ? ` — ${message.permalink}` : '';
    return `${index + 1}. [${date}] in <#${message.channel_id}> by ${author}: ${snippet}${permalink}`;
  });
  return `Found ${messages.length} prior community message(s), newest first:\n${lines.join('\n')}`;
}

function formatDate(messageTs) {
  const epochSeconds = Number(messageTs);
  if (!Number.isFinite(epochSeconds)) {
    return 'unknown date';
  }
  return new Date(epochSeconds * 1000).toISOString().slice(0, 10);
}

function truncate(text, maxLength) {
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}
```

(The `2024-03-09` assertion matches `1710000000` epoch seconds.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/community-memory/merge.test.js`
Expected: PASS (all)

- [ ] **Step 5: Commit**

```bash
git add agent/agent/community-memory/merge.js agent/tests/community-memory/merge.test.js
git commit -m "feat(agent): community-memory merge/dedup + text formatting (MOO-49)"
```

---

### Task 2: `rts-client.js` — one `assistant.search.context` call

**Files:**
- Create: `agent/agent/community-memory/rts-client.js`
- Test: `agent/tests/community-memory/rts-client.test.js`

- [ ] **Step 1: Write the failing tests**

```js
import assert from 'node:assert';
import { describe, it, mock } from 'node:test';

import { searchRts } from '../../agent/community-memory/rts-client.js';

function fakeFetch(payload) {
  return mock.fn(async () => ({ json: async () => payload }));
}

describe('searchRts', () => {
  it('POSTs the query with the user token and required params', async () => {
    const fetchFn = fakeFetch({ ok: true, results: { messages: [] } });
    await searchRts('rezoning on 27th street', { userToken: 'xoxp-test', fetchFn });

    assert.strictEqual(fetchFn.mock.callCount(), 1);
    const [url, init] = fetchFn.mock.calls[0].arguments;
    assert.strictEqual(url, 'https://slack.com/api/assistant.search.context');
    assert.strictEqual(init.method, 'POST');
    assert.strictEqual(init.headers.Authorization, 'Bearer xoxp-test');
    const body = init.body;
    assert.strictEqual(body.get('query'), 'rezoning on 27th street');
    assert.strictEqual(body.get('content_types'), 'messages');
    assert.strictEqual(body.get('channel_types'), 'public_channel');
    assert.strictEqual(body.get('limit'), '5');
  });

  it('returns ok with extracted messages on success', async () => {
    const messages = [{ channel_id: 'C1', message_ts: '1.2' }];
    const fetchFn = fakeFetch({ ok: true, results: { messages } });
    const result = await searchRts('q', { userToken: 'xoxp-test', fetchFn });
    assert.deepStrictEqual(result, { ok: true, error: null, messages });
  });

  it('defaults to an empty message list when results are missing', async () => {
    const fetchFn = fakeFetch({ ok: true });
    const result = await searchRts('q', { userToken: 'xoxp-test', fetchFn });
    assert.deepStrictEqual(result.messages, []);
  });

  it('returns ok:false with the Slack error code when blocked', async () => {
    const fetchFn = fakeFetch({ ok: false, error: 'missing_scope' });
    const result = await searchRts('q', { userToken: 'xoxp-test', fetchFn });
    assert.deepStrictEqual(result, { ok: false, error: 'missing_scope', messages: [] });
  });

  it('falls back to unknown_error when Slack omits the error code', async () => {
    const fetchFn = fakeFetch({ ok: false });
    const result = await searchRts('q', { userToken: 'xoxp-test', fetchFn });
    assert.strictEqual(result.error, 'unknown_error');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/community-memory/rts-client.test.js`
Expected: FAIL — `Cannot find module ... rts-client.js`

- [ ] **Step 3: Write the implementation**

```js
const RTS_API_URL = 'https://slack.com/api/assistant.search.context';
const RTS_LIMIT_PER_QUERY = '5';

/**
 * One live Real-Time Search call. Results are returned to the caller only —
 * never persisted (Slack ToS: query the private record live).
 * @param {string} query
 * @param {{ userToken: string, fetchFn?: typeof fetch }} options
 * @returns {Promise<{ ok: boolean, error: string | null, messages: Array<Record<string, any>> }>}
 */
export async function searchRts(query, { userToken, fetchFn = fetch }) {
  const body = new URLSearchParams({
    query,
    content_types: 'messages',
    channel_types: 'public_channel',
    limit: RTS_LIMIT_PER_QUERY,
  });

  const response = await fetchFn(RTS_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${userToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const result = await response.json();

  if (!result.ok) {
    return { ok: false, error: result.error ?? 'unknown_error', messages: [] };
  }
  return { ok: true, error: null, messages: result.results?.messages ?? [] };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/community-memory/rts-client.test.js`
Expected: PASS (all)

- [ ] **Step 5: Commit**

```bash
git add agent/agent/community-memory/rts-client.js agent/tests/community-memory/rts-client.test.js
git commit -m "feat(agent): RTS client for assistant.search.context (MOO-49)"
```

---

### Task 3: `search.js` — EN+ES fan-out, merge, fallback orchestration

**Files:**
- Create: `agent/agent/community-memory/search.js`
- Test: `agent/tests/community-memory/search.test.js`

- [ ] **Step 1: Write the failing tests**

```js
import assert from 'node:assert';
import { describe, it, mock } from 'node:test';

import { runCommunitySearch } from '../../agent/community-memory/search.js';

function message(overrides = {}) {
  return {
    channel_id: 'C001',
    message_ts: '1710000000.000100',
    author_user_id: 'U001',
    is_author_bot: false,
    content: 'prior discussion about the developer',
    permalink: 'https://example.slack.com/archives/C001/p1710000000000100',
    ...overrides,
  };
}

function fetchReturning(payload) {
  return mock.fn(async () => ({ json: async () => payload }));
}

const QUERIES = { queryEn: 'developer history', queryEs: 'historial del desarrollador' };

describe('runCommunitySearch', () => {
  it('issues one RTS call per language', async () => {
    const fetchFn = fetchReturning({ ok: true, results: { messages: [] } });
    await runCommunitySearch(QUERIES, { userToken: 'xoxp-test', fetchFn, env: {} });

    assert.strictEqual(fetchFn.mock.callCount(), 2);
    const sentQueries = fetchFn.mock.calls.map((c) => c.arguments[1].body.get('query'));
    assert.deepStrictEqual(sentQueries.sort(), ['developer history', 'historial del desarrollador']);
  });

  it('merges and dedupes results across languages', async () => {
    const shared = message();
    const fetchFn = fetchReturning({ ok: true, results: { messages: [shared] } });
    const text = await runCommunitySearch(QUERIES, { userToken: 'xoxp-test', fetchFn, env: {} });
    assert.match(text, /Found 1 prior community message/);
  });

  it('reports no results in plain language', async () => {
    const fetchFn = fetchReturning({ ok: true, results: { messages: [] } });
    const text = await runCommunitySearch(QUERIES, { userToken: 'xoxp-test', fetchFn, env: {} });
    assert.match(text, /No prior community discussion/);
  });

  it('instructs the slack-mcp fallback when RTS is blocked', async () => {
    const fetchFn = fetchReturning({ ok: false, error: 'missing_scope' });
    const text = await runCommunitySearch(QUERIES, { userToken: 'xoxp-test', fetchFn, env: {} });
    assert.match(text, /Real-Time Search is unavailable/);
    assert.match(text, /missing_scope/);
    assert.match(text, /slack-mcp/);
  });

  it('instructs the fallback when fetch throws', async () => {
    const fetchFn = mock.fn(async () => {
      throw new Error('network down');
    });
    const text = await runCommunitySearch(QUERIES, { userToken: 'xoxp-test', fetchFn, env: {} });
    assert.match(text, /Real-Time Search is unavailable/);
    assert.match(text, /slack-mcp/);
  });

  it('forces the fallback when GAVEL_DISABLE_RTS=1, without calling RTS', async () => {
    const fetchFn = fetchReturning({ ok: true, results: { messages: [message()] } });
    const text = await runCommunitySearch(QUERIES, {
      userToken: 'xoxp-test',
      fetchFn,
      env: { GAVEL_DISABLE_RTS: '1' },
    });
    assert.match(text, /Real-Time Search is unavailable/);
    assert.strictEqual(fetchFn.mock.callCount(), 0);
  });

  it('returns the successful side with a note when one language fails', async () => {
    let call = 0;
    const fetchFn = mock.fn(async () => {
      call += 1;
      const payload =
        call === 1 ? { ok: true, results: { messages: [message()] } } : { ok: false, error: 'internal_error' };
      return { json: async () => payload };
    });
    const text = await runCommunitySearch(QUERIES, { userToken: 'xoxp-test', fetchFn, env: {} });
    assert.match(text, /Found 1 prior community message/);
    assert.match(text, /only one of the two language searches succeeded/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/community-memory/search.test.js`
Expected: FAIL — `Cannot find module ... search.js`

- [ ] **Step 3: Write the implementation**

```js
import { formatResultsAsText, mergeAndDedupe } from './merge.js';
import { searchRts } from './rts-client.js';

/**
 * Run the EN+ES community-memory search: fan out both RTS queries in parallel,
 * merge + dedupe, and render plain text for the agent. When RTS is unavailable
 * (blocked, erroring, or disabled), tell the agent to use the slack-mcp search
 * tools instead. Results are never persisted.
 * @param {{ queryEn: string, queryEs: string }} queries
 * @param {{ userToken: string, fetchFn?: typeof fetch, env?: Record<string, string | undefined> }} options
 * @returns {Promise<string>}
 */
export async function runCommunitySearch({ queryEn, queryEs }, { userToken, fetchFn = fetch, env = process.env }) {
  if (env.GAVEL_DISABLE_RTS === '1') {
    return buildFallbackText('disabled by GAVEL_DISABLE_RTS');
  }

  const settled = await Promise.allSettled([
    searchRts(queryEn, { userToken, fetchFn }),
    searchRts(queryEs, { userToken, fetchFn }),
  ]);
  const successes = settled.filter((r) => r.status === 'fulfilled' && r.value.ok).map((r) => r.value);

  if (successes.length === 0) {
    return buildFallbackText(describeFirstFailure(settled));
  }

  const merged = mergeAndDedupe(successes[0].messages, successes[1]?.messages ?? []);
  const note =
    successes.length === 1 ? '\nNote: only one of the two language searches succeeded; results may be partial.' : '';
  return `${formatResultsAsText(merged)}${note}`;
}

function buildFallbackText(reason) {
  const suffix = reason ? ` (${reason})` : '';
  return `Real-Time Search is unavailable${suffix}. Use the slack-mcp search tools to find prior community discussion instead.`;
}

function describeFirstFailure(settled) {
  for (const result of settled) {
    if (result.status === 'rejected') {
      return result.reason?.message ?? 'request failed';
    }
    if (!result.value.ok) {
      return result.value.error;
    }
  }
  return 'unknown_error';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/community-memory/search.test.js`
Expected: PASS (all)

- [ ] **Step 5: Commit**

```bash
git add agent/agent/community-memory/search.js agent/tests/community-memory/search.test.js
git commit -m "feat(agent): EN+ES community search fan-out with slack-mcp fallback (MOO-49)"
```

---

### Task 4: `tool.js` — the SDK tool + in-process MCP server

**Files:**
- Create: `agent/agent/community-memory/tool.js`
- Test: `agent/tests/community-memory/tool.test.js`

- [ ] **Step 1: Write the failing tests**

```js
import assert from 'node:assert';
import { describe, it } from 'node:test';

import { createCommunityMemoryServer } from '../../agent/community-memory/tool.js';

describe('createCommunityMemoryServer', () => {
  it('returns an SDK MCP server config named community-memory', () => {
    const server = createCommunityMemoryServer({ userToken: 'xoxp-test' });
    assert.strictEqual(server.type, 'sdk');
    assert.strictEqual(server.name, 'community-memory');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/community-memory/tool.test.js`
Expected: FAIL — `Cannot find module ... tool.js`

- [ ] **Step 3: Write the implementation**

```js
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

import { runCommunitySearch } from './search.js';

const TOOL_DESCRIPTION = `\
Live-search THIS Slack workspace's own public-channel history for prior community \
discussion of a matter, address, developer, organization, or topic. Provide the query in \
both English and Spanish. Results are queried live via Slack Real-Time Search and never \
stored. If the result says Real-Time Search is unavailable, use the slack-mcp search \
tools instead.`;

/**
 * Build the in-process MCP server exposing search_community_memory.
 * @param {{ userToken: string, fetchFn?: typeof fetch, env?: Record<string, string | undefined> }} options
 */
export function createCommunityMemoryServer({ userToken, fetchFn = fetch, env = process.env }) {
  const searchTool = tool(
    'search_community_memory',
    TOOL_DESCRIPTION,
    {
      query_en: z.string().describe('Search query in English'),
      query_es: z.string().describe('The same search query, written natively in Spanish'),
    },
    async ({ query_en: queryEn, query_es: queryEs }) => {
      const text = await runCommunitySearch({ queryEn, queryEs }, { userToken, fetchFn, env });
      return { content: [{ type: 'text', text }] };
    },
  );

  return createSdkMcpServer({ name: 'community-memory', version: '0.1.0', tools: [searchTool] });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/community-memory/tool.test.js`
Expected: PASS. If `server.name` is not exposed at the top level of the returned config, inspect the actual shape (`console.dir(server)` in a scratch run) and assert on the real location (e.g., `server.instance` metadata) — the SDK returns `McpSdkServerConfigWithInstance`. Adjust the assertion, not the implementation.

- [ ] **Step 5: Commit**

```bash
git add agent/agent/community-memory/tool.js agent/tests/community-memory/tool.test.js
git commit -m "feat(agent): search_community_memory SDK tool + in-process MCP server (MOO-49)"
```

---

### Task 5: `agent.js` — token threading + wiring + prompt section

**Files:**
- Modify: `agent/agent/agent.js` (extract `buildAgentOptions`, add prompt section, env-token fallback)
- Test: `agent/tests/agent/build-agent-options.test.js`

- [ ] **Step 1: Write the failing tests**

```js
import assert from 'node:assert';
import { describe, it } from 'node:test';

import { buildAgentOptions } from '../../agent/agent.js';

describe('buildAgentOptions', () => {
  it('registers only milwaukee-civic when no user token exists anywhere', () => {
    const { mcpServers, allowedTools, systemPrompt } = buildAgentOptions(undefined, {});
    assert.deepStrictEqual(Object.keys(mcpServers), ['milwaukee-civic']);
    assert.deepStrictEqual(allowedTools, ['mcp__milwaukee-civic__*']);
    assert.ok(!systemPrompt.includes('COMMUNITY MEMORY'));
  });

  it('registers community-memory and slack-mcp when deps carry a user token', () => {
    const { mcpServers, allowedTools, systemPrompt } = buildAgentOptions({ userToken: 'xoxp-deps' }, {});
    assert.ok(mcpServers['community-memory']);
    assert.ok(mcpServers['slack-mcp']);
    assert.ok(allowedTools.includes('mcp__community-memory__*'));
    assert.ok(allowedTools.includes('mcp__slack-mcp__*'));
    assert.ok(systemPrompt.includes('COMMUNITY MEMORY'));
  });

  it('falls back to SLACK_USER_TOKEN from the environment (the prod path)', () => {
    const { mcpServers } = buildAgentOptions(undefined, { SLACK_USER_TOKEN: 'xoxp-env' });
    assert.ok(mcpServers['community-memory']);
    assert.strictEqual(mcpServers['slack-mcp'].headers.Authorization, 'Bearer xoxp-env');
  });

  it('prefers the context user token over the environment token', () => {
    const { mcpServers } = buildAgentOptions({ userToken: 'xoxp-deps' }, { SLACK_USER_TOKEN: 'xoxp-env' });
    assert.strictEqual(mcpServers['slack-mcp'].headers.Authorization, 'Bearer xoxp-deps');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/agent/build-agent-options.test.js`
Expected: FAIL — `buildAgentOptions` is not exported

- [ ] **Step 3: Modify `agent/agent/agent.js`**

Add the import at the top, the prompt constant after `SYSTEM_PROMPT`, and replace the option-building section of `runAgent` with `buildAgentOptions`:

```js
import { query } from '@anthropic-ai/claude-agent-sdk';

import { createCommunityMemoryServer } from './community-memory/tool.js';
```

After the existing `SYSTEM_PROMPT` constant, add:

```js
const COMMUNITY_MEMORY_PROMPT = `\
## COMMUNITY MEMORY (Real-Time Search)
You also have the search_community_memory tool. It live-searches THIS workspace's own \
public-channel history — the community's memory of what neighbors said before. When a \
user asks about a specific matter, address, developer, organization, or recurring topic, \
call it even if they don't explicitly ask "have we discussed this?" — surfacing prior \
discussion unprompted is part of your job. Provide the query in BOTH English (query_en) \
and Spanish (query_es), each written natively.
- Present what you find as a "💬 Your community's memory" section beside the official \
record ("📋 Official record") — e.g. "your channel discussed this in March 2024" — with \
dates and permalinks, in the user's language.
- If the tool reports Real-Time Search is unavailable, use the slack-mcp search tools \
instead to find prior discussion.
- Community messages are queried live and never stored. If nothing is found, say so in \
one short sentence and move on.`;
```

Then replace the body of `runAgent` up to the `options` declaration with:

```js
/**
 * Build the agent's MCP servers, allowed tools, and system prompt.
 * The user token comes from Bolt context when present, else the environment
 * (SLACK_USER_TOKEN — the deployed bot-token app never populates context.userToken).
 * The bot token still does all posting; the user token is only for RTS/search.
 * @param {AgentDeps} [deps]
 * @param {Record<string, string | undefined>} [env]
 */
export function buildAgentOptions(deps = undefined, env = process.env) {
  const userToken = deps?.userToken ?? env.SLACK_USER_TOKEN;

  /** @type {Record<string, any>} */
  const mcpServers = {
    'milwaukee-civic': {
      command: 'node',
      args: [new URL('../../mcp-server/src/server.js', import.meta.url).pathname],
    },
  };
  const allowedTools = ['mcp__milwaukee-civic__*'];
  let systemPrompt = SYSTEM_PROMPT;

  if (userToken) {
    mcpServers['community-memory'] = createCommunityMemoryServer({ userToken, env });
    allowedTools.push('mcp__community-memory__*');
    mcpServers['slack-mcp'] = {
      type: 'http',
      url: SLACK_MCP_URL,
      headers: { Authorization: `Bearer ${userToken}` },
    };
    allowedTools.push('mcp__slack-mcp__*');
    systemPrompt = `${SYSTEM_PROMPT}\n\n${COMMUNITY_MEMORY_PROMPT}`;
  }

  return { mcpServers, allowedTools, systemPrompt };
}

export async function runAgent(text, sessionId = undefined, deps = undefined) {
  const { mcpServers, allowedTools, systemPrompt } = buildAgentOptions(deps);

  /** @type {import('@anthropic-ai/claude-agent-sdk').Options} */
  const options = {
    systemPrompt,
    mcpServers,
    allowedTools,
    permissionMode: 'bypassPermissions',
    ...(sessionId && { resume: sessionId }),
  };
  // ... rest of runAgent unchanged (the for-await loop and return)
}
```

The old inline `mcpServers`/`allowedTools`/`if (deps?.userToken)` block inside `runAgent` is removed — `buildAgentOptions` replaces it. The listeners (`message.js`, `app-mentioned.js`) stay unchanged: they keep passing `context.userToken`, and the env fallback lives in one place.

- [ ] **Step 4: Run the full test suite**

Run: `node --test`
Expected: PASS — all existing tests plus the four new files

- [ ] **Step 5: Commit**

```bash
git add agent/agent/agent.js agent/tests/agent/build-agent-options.test.js
git commit -m "feat(agent): thread SLACK_USER_TOKEN into agent, wire community-memory + slack-mcp + prompt (MOO-49)"
```

---

### Task 6: Lint, full suite, local live smoke

**Files:** none new.

- [ ] **Step 1: Lint**

Run (from `agent/`): `npx @biomejs/biome check .`
Expected: no errors (run `npx @biomejs/biome check --write .` for fixable formatting, then re-run)

- [ ] **Step 2: Full test suite**

Run: `node --test`
Expected: PASS, zero failures

- [ ] **Step 3: Local live smoke of the search path (no agent loop, real RTS)**

Run (from `agent/`, uses `.env`):

```bash
node --input-type=module -e "
import 'dotenv/config';
import { runCommunitySearch } from './agent/community-memory/search.js';
const text = await runCommunitySearch(
  { queryEn: 'zoning meeting agenda', queryEs: 'agenda de la reunión de zonificación' },
  { userToken: process.env.SLACK_USER_TOKEN },
);
console.log(text);
"
```

Expected: either `Found N prior community message(s)…` or `No prior community discussion found…` — NOT a fallback/unavailable message. Then force the fallback:

```bash
GAVEL_DISABLE_RTS=1 node --input-type=module -e "
import 'dotenv/config';
import { runCommunitySearch } from './agent/community-memory/search.js';
console.log(await runCommunitySearch(
  { queryEn: 'zoning', queryEs: 'zonificación' },
  { userToken: process.env.SLACK_USER_TOKEN },
));
"
```

Expected: `Real-Time Search is unavailable (disabled by GAVEL_DISABLE_RTS). Use the slack-mcp search tools…`

- [ ] **Step 4: No-persistence review**

Run: `grep -rn "convex" agent/agent/community-memory/` — expected: no matches.
Confirm no `console.log` of message content in the module.

- [ ] **Step 5: Commit any lint fixes**

```bash
git add -A && git commit -m "chore(agent): lint fixes for community-memory (MOO-49)" || echo "nothing to commit"
```

---

### Post-plan verification (the issue's checklist — done after merge/deploy, not by the plan executor)

1. Deploy `gavel-app` (`fly deploy -c fly.app.toml --remote-only` from repo root) and DM the bot about a topic with seeded/real channel history → paste the RTS-backed reply into MOO-49.
2. Force fallback in prod or locally (`GAVEL_DISABLE_RTS=1`) → show community context still returned via slack-mcp.
3. Code-path review: no Convex write, no message persistence → comment on MOO-49.
