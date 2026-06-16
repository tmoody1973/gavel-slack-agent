import { query } from '@anthropic-ai/claude-agent-sdk';

import { createCommunityMemoryServer } from './community-memory/tool.js';
import { createReceiptsServer } from './receipts/tool.js';
import { createZoningServer } from './zoning/tool.js';

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
NEVER invent, guess, or construct a URL — only share a link a tool actually returned to you. \
If an address lookup comes back empty, the usual cause is a wrong N/S/E/W directional or a typo \
(Milwaukee's grid is easy to get wrong); ask the user to double-check the direction and spelling \
rather than fabricating a "look it up yourself" link.

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

const COMMUNITY_MEMORY_PROMPT = `\
## COMMUNITY MEMORY (Real-Time Search)
You also have the search_community_memory tool. It live-searches THIS workspace's own \
public-channel history — the community's memory of what neighbors said before. When a \
user asks about a specific matter, address, developer, organization, or recurring topic, \
call it even if they don't explicitly ask "have we discussed this?" — surfacing prior \
discussion unprompted is part of your job. Provide the query in BOTH English (query_en) \
and Spanish (query_es), each written natively.
- Present what you find as a "💬 Your community's memory" section, and label the \
civic-tool findings "📋 Official record" when you show both — e.g. "your channel \
discussed this in March 2024" — with dates and permalinks, in the user's language.
- If the tool reports Real-Time Search is unavailable, use the slack-mcp search tools \
instead to find prior discussion.
- Community messages are queried live and never stored. If nothing is found, say so in \
one short sentence and move on.`;

const RECEIPTS_PROMPT = `\
## STRUCTURED RECEIPTS (render_receipt)
When your answer contains a vote record, a matter's action history, or a sponsor \
identification, ALSO call the render_receipt tool with the typed data — it attaches a \
formatted table/card/timeline under your reply when it finishes streaming:
- vote records → type "votes" (caption + member/vote rows)
- what happened to a file over time → type "timeline" (the get_matter_history actions)
- who sponsored it → type "sponsor" (name, title, and the headshot imageUrl if known)
- a file's identity card → type "matter" (file number, title, status, Legistar link)
- a civic tool returned information_unavailable → type "unavailable" (kind + the \
thread's language, "es" if the user wrote in Spanish, plus a Legistar link if you have one)
Keep your prose lead short — the receipt carries the detail; do NOT repeat the table \
contents as text. End with a one-line source note (file number + committee). If \
render_receipt returns an error, fix the payload or just answer in prose — never let a \
rendering problem stop your answer.`;

const ZONING_PROMPT = `\
## ZONING CODE (ask_zoning_code)
When a user asks what can be built, used, or changed at a specific ADDRESS — duplex, \
ADU, corner store, height, setbacks, parking, permitted uses, rezoning effects — call \
ask_zoning_code with the address and their question. It returns the governing Chapter 295 \
sections; answer ONLY from them and cite the §295-NNN sections. If it returns \
information_unavailable or no sections, say so plainly and point to milwaukee.gov — never \
invent code text or section numbers.`;

const SLACK_MCP_URL = 'https://mcp.slack.com/mcp';

// Pin the agent model. Sonnet 4.6 is the default for fast interactive replies;
// override with the GAVEL_AGENT_MODEL env var (e.g. claude-opus-4-8) without a
// code change. Unset, the Agent SDK defaults to the Opus tier (slower).
const AGENT_MODEL = process.env.GAVEL_AGENT_MODEL || 'claude-sonnet-4-6';

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
 * Build the agent's MCP servers, allowed tools, and system prompt.
 * The user token comes from Bolt context when present, else the environment
 * (SLACK_USER_TOKEN — the deployed bot-token app never populates context.userToken).
 * The bot token still does all posting; the user token is only for RTS/search.
 * @param {AgentDeps} [deps]
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ mcpServers: Record<string, any>, allowedTools: string[], systemPrompt: string }}
 *   The slack-mcp entry carries the raw bearer token in its headers — never log this object.
 */
export function buildAgentOptions(deps = undefined, env = process.env) {
  const userToken = deps?.userToken ?? env.SLACK_USER_TOKEN;

  /** @type {Record<string, any>} */
  const mcpServers = {
    'milwaukee-civic': {
      command: 'node',
      args: [new URL('../../mcp-server/src/server.js', import.meta.url).pathname],
    },
  };
  const allowedTools = ['mcp__milwaukee-civic__*'];
  let systemPrompt = SYSTEM_PROMPT;

  if (userToken) {
    mcpServers['community-memory'] = createCommunityMemoryServer({ userToken, env });
    allowedTools.push('mcp__community-memory__*');
    mcpServers['slack-mcp'] = {
      type: 'http',
      url: SLACK_MCP_URL,
      headers: { Authorization: `Bearer ${userToken}` },
    };
    allowedTools.push('mcp__slack-mcp__*');
    systemPrompt = `${systemPrompt}\n\n${COMMUNITY_MEMORY_PROMPT}`;
  }

  if (Array.isArray(deps?.receipts)) {
    mcpServers.receipts = createReceiptsServer({ receipts: deps.receipts });
    allowedTools.push('mcp__receipts__*');
    systemPrompt = `${systemPrompt}\n\n${RECEIPTS_PROMPT}`;
  }

  if (env.CONVEX_URL && env.OPENAI_API_KEY) {
    mcpServers.zoning = createZoningServer({ convexUrl: env.CONVEX_URL, openaiApiKey: env.OPENAI_API_KEY });
    allowedTools.push('mcp__zoning__*');
    systemPrompt = `${systemPrompt}\n\n${ZONING_PROMPT}`;
  }

  return { mcpServers, allowedTools, systemPrompt };
}

/**
 * Run the agent with the given text and optional session ID.
 * @param {string} text - The user's message text.
 * @param {string} [sessionId] - An existing session ID to resume conversation.
 * @param {AgentDeps} [deps] - Dependencies for tools that need Slack API access.
 * @returns {Promise<{responseText: string, sessionId: string | null, receiptBlocks: object[]}>}
 */
export async function runAgent(text, sessionId = undefined, deps = undefined) {
  // Per-run receipt accumulator: render_receipt pushes Block Kit blocks here;
  // the listeners attach them at stream end (MOO-75).
  const receipts = [];
  const { mcpServers, allowedTools, systemPrompt } = buildAgentOptions({ ...(deps ?? {}), receipts });

  /** @type {import('@anthropic-ai/claude-agent-sdk').Options} */
  const options = {
    model: AGENT_MODEL,
    systemPrompt,
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
  return { responseText, sessionId: newSessionId, receiptBlocks: receipts };
}
