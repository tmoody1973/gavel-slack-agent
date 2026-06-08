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
