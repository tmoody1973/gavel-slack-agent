import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { ConvexHttpClient } from 'convex/browser';
import { z } from 'zod';

import { createParcelClient } from '../../../mcp-server/src/parcel.js';
import { api } from '../../convex/_generated/api.js';
import { embedQuery } from '../../zoning/embed.js';
import { zoningClassToFamily } from '../../zoning/family.js';
import { runZoningAnswer } from './search.js';

const TOOL_DESCRIPTION = `\
Answer "what could be built / is allowed at this address?" from the Milwaukee zoning \
code (Chapter 295). Give the property ADDRESS and the user's QUESTION. The tool resolves \
the address to its zoning class, retrieves only the code sections that govern that class \
(plus citywide provisions), and returns them for you to answer FROM — cite the §295-NNN \
sections you use, and never invent one. Translate a Spanish question to English for \
retrieval; you still answer in the user's language with English section citations.`;

/**
 * In-process MCP server exposing ask_zoning_code. Real boundaries wired here;
 * the pure orchestrator (runZoningAnswer) is unit-tested with fakes.
 * @param {{convexUrl:string, openaiApiKey:string, userAgent?:string, fetchFn?:typeof fetch}} options
 */
export function createZoningServer({ convexUrl, openaiApiKey, userAgent = 'gavel-slack-agent', fetchFn = fetch }) {
  const convex = new ConvexHttpClient(convexUrl);
  const parcel = createParcelClient({ fetch: fetchFn, userAgent });
  const deps = {
    resolveZoning: (address) => parcel.checkZoning(address),
    classToFamily: zoningClassToFamily,
    embedQuery: (text) => embedQuery(text, { apiKey: openaiApiKey, fetchFn }),
    search: ({ embedding, family }) => convex.action(api.zoning.search, { embedding, family }),
  };
  const askTool = tool(
    'ask_zoning_code',
    TOOL_DESCRIPTION,
    {
      address: z.string().describe('Street address, e.g. "2000 S 13th St"'),
      question: z.string().describe("The user's zoning question"),
    },
    async ({ address, question }) => {
      const text = await runZoningAnswer({ address, question }, deps);
      return { content: [{ type: 'text', text }] };
    },
  );
  return createSdkMcpServer({ name: 'zoning', version: '0.1.0', tools: [askTool] });
}
