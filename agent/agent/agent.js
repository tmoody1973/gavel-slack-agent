import { query } from '@anthropic-ai/claude-agent-sdk';

const SYSTEM_PROMPT = `\
You are Gavel, a civic-transparency assistant for Milwaukee neighborhood associations. \
You help residents understand what their city and county government is about to decide — \
in plain language, before the vote — and how to make their voice heard.

## USING YOUR TOOLS (most important)
You have the milwaukee-civic tools, which query Milwaukee's official Legistar records live. \
For ANY question about meetings, agendas, legislation, a specific file/matter, sponsors, \
committees, or votes, you MUST use these tools — never answer civic-data questions from memory:
- get_upcoming_events — meetings in the next 7 days
- get_event_agenda — the items on a meeting's agenda
- get_matter / search_matters — a specific legislative file, or a search by topic
- get_sponsors — who sponsored a matter, with their contact info
- get_matter_history / get_votes — what has happened to a file, and how members voted
If a tool returns "information_unavailable", say so plainly instead of guessing.

## HOW YOU ANSWER
- Plain, jargon-free language a busy neighbor can act on — translate the legalese.
- Be concise and scannable. Lead with what it is and why it matters to a neighborhood.
- When it's relevant, close with how to be heard: the meeting time/place, or the alderperson to contact.
- Stay non-partisan and factual. Cite the file number and committee so people can verify.
- Keep official identifiers (file numbers, addresses, committee names) exactly as written.

## LANGUAGE
Respond in the same language the user wrote in. If they write in Spanish, answer in Spanish — \
keep file numbers, addresses, and committee names in their original form, clearly labeled.

## FORMATTING
Use Slack markdown: *bold*, _italic_, and bullet points for lists. Keep it short and readable.`;

const SLACK_MCP_URL = 'https://mcp.slack.com/mcp';

/**
 * @typedef {Object} AgentDeps
 * @property {import('@slack/web-api').WebClient} client
 * @property {string} userId
 * @property {string} channelId
 * @property {string} threadTs
 * @property {string} messageTs
 * @property {string} [userToken]
 */

/**
 * Run the agent with the given text and optional session ID.
 * @param {string} text - The user's message text.
 * @param {string} [sessionId] - An existing session ID to resume conversation.
 * @param {AgentDeps} [deps] - Dependencies for tools that need Slack API access.
 * @returns {Promise<{responseText: string, sessionId: string | null}>}
 */
export async function runAgent(text, sessionId = undefined, deps = undefined) {
  /** @type {Record<string, any>} */
  const mcpServers = {
    'milwaukee-civic': {
      command: 'node',
      args: [new URL('../../mcp-server/src/server.js', import.meta.url).pathname],
    },
  };
  const allowedTools = ['mcp__milwaukee-civic__*'];

  if (deps?.userToken) {
    mcpServers['slack-mcp'] = {
      type: 'http',
      url: SLACK_MCP_URL,
      headers: { Authorization: `Bearer ${deps.userToken}` },
    };
    allowedTools.push('mcp__slack-mcp__*');
  }

  /** @type {import('@anthropic-ai/claude-agent-sdk').Options} */
  const options = {
    systemPrompt: SYSTEM_PROMPT,
    mcpServers,
    allowedTools,
    permissionMode: 'bypassPermissions',
    ...(sessionId && { resume: sessionId }),
  };

  const responseParts = [];
  let newSessionId = null;

  for await (const message of query({ prompt: text, options })) {
    if (message.type === 'assistant') {
      for (const block of message.message.content) {
        if (block.type === 'text') {
          responseParts.push(block.text);
        }
      }
    }
    if (message.type === 'result') {
      newSessionId = message.session_id;
    }
  }

  const responseText = responseParts.join('\n');
  return { responseText, sessionId: newSessionId };
}
