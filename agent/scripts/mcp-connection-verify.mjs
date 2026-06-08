#!/usr/bin/env node

// MOO-47 verification: prove the agent invokes a milwaukee-civic tool THROUGH
// the MCP connection. Drives the SAME @anthropic-ai/claude-agent-sdk query()
// with the SAME external-stdio mcpServers entry the live Slack agent uses
// (agent/agent/agent.js) — minus Slack. Logs every tool_use the agent emits.
// Needs ANTHROPIC_API_KEY (from agent/.env); the MCP server itself needs no token.

import { query } from '@anthropic-ai/claude-agent-sdk';
import { config } from 'dotenv';

config({ path: '.env' });
config({ path: '.env.local' });

const serverPath = new URL('../../mcp-server/src/server.js', import.meta.url).pathname;

const options = {
  systemPrompt:
    'You are a Milwaukee civic assistant. When asked about meetings, ALWAYS use your tools to fetch real data. Do not answer from memory.',
  mcpServers: {
    'milwaukee-civic': { command: 'node', args: [serverPath] },
  },
  allowedTools: ['mcp__milwaukee-civic__*'],
  permissionMode: 'bypassPermissions',
};

const prompt = 'What Milwaukee city meetings are coming up in the next 7 days? Use your tools.';

const toolCalls = [];

for await (const message of query({ prompt, options })) {
  if (message.type === 'assistant') {
    for (const block of message.message.content) {
      if (block.type === 'tool_use') {
        toolCalls.push({ name: block.name, input: block.input });
        console.log(`[tool_use] ${block.name} input=${JSON.stringify(block.input)}`);
      }
    }
  }
}

const civicCalls = toolCalls.filter((t) => t.name.startsWith('mcp__milwaukee-civic__'));
console.log('---');
if (civicCalls.length > 0) {
  console.log(`PASS: agent invoked ${civicCalls.length} milwaukee-civic tool(s) through the MCP connection.`);
  process.exit(0);
}
console.log('FAIL: no milwaukee-civic tool was invoked.');
process.exit(1);
