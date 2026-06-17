import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { ConvexHttpClient } from 'convex/browser';
import { z } from 'zod';

import { api } from '../../convex/_generated/api.js';
import { videoMomentDeepLink } from '../../transcripts/video.js';
import { embedQuery } from '../../zoning/embed.js';
import { runTranscriptSearch, runVideoMoment } from './search.js';

const LEGISTAR = 'https://webapi.legistar.com/v1/milwaukee';

const SEARCH_DESCRIPTION = `\
Search what was actually SAID and DECIDED in Milwaukee committee meetings — the public \
webcast transcripts. Use this when a user asks what someone said, what the debate was, \
the reasoning behind a decision, or "what did the committee say about X". Give the QUERY \
in English (translate a Spanish question for retrieval). It returns real speaker quotes \
with the agenda item and a timestamped ▶ video link — quote ONLY what it returns and \
include the link; never invent a quote. Optionally scope to one meeting (eventId) or \
committee (exact EventBodyName).`;

const MOMENT_DESCRIPTION = `\
Get a timestamped video link to the moment a specific agenda item begins in the meeting \
webcast. Give the Legistar EventItemId AND the EventId of its meeting (both come from \
get_event_agenda). Returns a Granicus deep link positioned at that second. Use it to point \
a resident straight to the footage of an item they care about.`;

/**
 * In-process MCP server exposing search_transcripts + get_video_moment. Real
 * boundaries wired here; the pure orchestrators (search.js) are unit-tested.
 * @param {{convexUrl:string, openaiApiKey:string, userAgent?:string, fetchFn?:typeof fetch}} options
 */
export function createTranscriptsServer({ convexUrl, openaiApiKey, userAgent = 'gavel-slack-agent', fetchFn = fetch }) {
  const convex = new ConvexHttpClient(convexUrl);
  const headers = { 'User-Agent': userAgent };
  const legistar = async (path) => (await fetchFn(LEGISTAR + path, { headers })).json();
  const deps = {
    embedQuery: (text) => embedQuery(text, { apiKey: openaiApiKey, fetchFn }),
    search: (args) => convex.action(api.transcripts.search, args),
    deepLink: videoMomentDeepLink,
    getEventItem: (eventId, itemId) => legistar(`/events/${eventId}/eventitems/${itemId}`),
    getEvent: (eventId) => legistar(`/events/${eventId}`),
  };

  const searchTool = tool(
    'search_transcripts',
    SEARCH_DESCRIPTION,
    {
      query: z.string().describe('What was said/decided to search for, in English'),
      eventId: z.number().optional().describe('Restrict to one meeting (Legistar EventId)'),
      committee: z.string().optional().describe('Restrict to one committee (exact EventBodyName)'),
    },
    async ({ query, eventId, committee }) => {
      const text = await runTranscriptSearch({ query, eventId, committee }, deps);
      return { content: [{ type: 'text', text }] };
    },
  );

  const momentTool = tool(
    'get_video_moment',
    MOMENT_DESCRIPTION,
    {
      eventItemId: z.number().describe('The Legistar EventItemId of the agenda item'),
      eventId: z.number().describe('The Legistar EventId of the meeting the item is on (from get_event_agenda)'),
    },
    async ({ eventItemId, eventId }) => {
      const text = await runVideoMoment({ eventItemId, eventId }, deps);
      return { content: [{ type: 'text', text }] };
    },
  );

  return createSdkMcpServer({ name: 'transcripts', version: '0.1.0', tools: [searchTool, momentTool] });
}
