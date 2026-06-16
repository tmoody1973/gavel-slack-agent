import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildAgentOptions } from '../../agent/agent.js';

test('zoning tool is registered when CONVEX_URL + OPENAI_API_KEY are set', () => {
  const env = { CONVEX_URL: 'https://x.convex.cloud', OPENAI_API_KEY: 'sk-x' };
  const { mcpServers, allowedTools, systemPrompt } = buildAgentOptions(undefined, env);
  assert.ok(mcpServers.zoning, 'expected a zoning MCP server');
  assert.ok(allowedTools.includes('mcp__zoning__*'));
  assert.match(systemPrompt, /ask_zoning_code/);
});

test('zoning tool is omitted when its env is missing (no crash)', () => {
  const { mcpServers, allowedTools } = buildAgentOptions(undefined, {});
  assert.equal(mcpServers.zoning, undefined);
  assert.ok(!allowedTools.includes('mcp__zoning__*'));
});
