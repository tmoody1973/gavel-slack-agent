import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildAgentOptions } from '../../agent/agent.js';

test('transcript tools are registered when CONVEX_URL + OPENAI_API_KEY are set', () => {
  const env = { CONVEX_URL: 'https://x.convex.cloud', OPENAI_API_KEY: 'sk-x' };
  const { mcpServers, allowedTools, systemPrompt } = buildAgentOptions(undefined, env);
  assert.ok(mcpServers.transcripts, 'expected a transcripts MCP server');
  assert.ok(allowedTools.includes('mcp__transcripts__*'));
  assert.match(systemPrompt, /search_transcripts/);
  assert.match(systemPrompt, /get_video_moment/);
});

test('transcript tools are omitted when their env is missing (no crash)', () => {
  const { mcpServers, allowedTools } = buildAgentOptions(undefined, {});
  assert.equal(mcpServers.transcripts, undefined);
  assert.ok(!allowedTools.includes('mcp__transcripts__*'));
});
