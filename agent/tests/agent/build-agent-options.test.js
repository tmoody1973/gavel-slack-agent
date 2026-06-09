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
    assert.ok(systemPrompt.includes('You are Gavel'), 'base prompt must be appended to, not replaced');
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
