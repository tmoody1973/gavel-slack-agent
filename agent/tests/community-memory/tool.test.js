import assert from 'node:assert';
import { describe, it } from 'node:test';

import { createCommunityMemoryServer } from '../../agent/community-memory/tool.js';

describe('createCommunityMemoryServer', () => {
  it('returns an SDK MCP server config named community-memory', () => {
    const server = createCommunityMemoryServer({ userToken: 'xoxp-test' });
    assert.strictEqual(server.type, 'sdk');
    assert.strictEqual(server.name, 'community-memory');
  });

  it('executes the search tool handler and returns text-only content', async () => {
    const fetchFn = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, results: { messages: [] } }),
    });
    const server = createCommunityMemoryServer({ userToken: 'xoxp-test', fetchFn, env: {} });
    const registered = /** @type {any} */ (server).instance;
    assert.ok(registered, 'server should carry an MCP instance');

    // Invoke the handler directly to verify text-only content and no structuredContent
    const toolHandler = registered._registeredTools.search_community_memory?.handler;
    assert.ok(toolHandler, 'search_community_memory tool should be registered');
    const result = await toolHandler({ query_en: 'test query', query_es: 'consulta de prueba' });
    assert.ok(Array.isArray(result.content), 'result should have content array');
    assert.strictEqual(result.content[0].type, 'text', 'content[0] type should be text');
    assert.strictEqual(typeof result.content[0].text, 'string', 'content[0].text should be a string');
    assert.strictEqual(result.structuredContent, undefined, 'structuredContent must not be present');
  });
});
