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
