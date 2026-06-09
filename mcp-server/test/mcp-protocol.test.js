import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// Integration test over the real MCP stdio protocol — the path the agent uses.
// Catches result-shape bugs the fake-server unit tests can't (e.g. returning an
// array as structuredContent, which MCP rejects with -32602).
test('a list tool returns a protocol-valid result over stdio (no -32602)', async () => {
  const transport = new StdioClientTransport({ command: 'node', args: ['src/server.js'] });
  const client = new Client({ name: 'protocol-test', version: '0.0.0' });
  await client.connect(transport);
  try {
    const tools = (await client.listTools()).tools.map((t) => t.name);
    assert.ok(tools.includes('get_upcoming_events'));

    // Resolves with data OR a structured information_unavailable — either is a
    // valid result. A protocol/shape error (e.g. array structuredContent) throws.
    const res = await client.callTool({ name: 'get_upcoming_events', arguments: {} });
    assert.ok(Array.isArray(res.content), 'result must carry text content');
  } finally {
    await client.close();
  }
});
