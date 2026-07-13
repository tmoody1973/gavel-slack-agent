import { execFile } from 'node:child_process';
import { rmSync } from 'node:fs';
import { promisify } from 'node:util';

import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { ConvexHttpClient } from 'convex/browser';
import { z } from 'zod';

import { api } from '../../convex/_generated/api.js';
import { clipVideoMoment, uploadClipToSlack, videoMomentDeepLink } from '../../transcripts/video.js';
import { embedQuery } from '../../zoning/embed.js';
import { runClipMoment, runTranscriptSearch, runVideoMoment } from './search.js';

const LEGISTAR = 'https://webapi.legistar.com/v1/milwaukee';
const run = promisify(execFile);

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

const CLIP_DESCRIPTION = `\
Cut the actual FOOTAGE of a moment out of the meeting webcast and post it as a short video that \
plays right in this Slack thread. Use this when a resident wants to SEE or HEAR what was said — \
"show me", "play it", "can I watch that", "clip that" — or when a quote is contested and the \
footage settles it. Give the EventId, plus EITHER the EventItemId of the agenda item OR the exact \
startSeconds (the timestamp on a search_transcripts receipt). The clip posts itself into the \
thread: tell the user to press play, and do NOT also paste a link. Milwaukee publishes video but \
no transcripts, so this footage is otherwise unsearchable.`;

/**
 * In-process MCP server exposing search_transcripts + get_video_moment, and — when a Slack channel
 * is wired — clip_video_moment, which posts the real footage into the thread. Real boundaries wired
 * here; the pure orchestrators (search.js) are unit-tested.
 * @param {{convexUrl:string, openaiApiKey:string, userAgent?:string, fetchFn?:typeof fetch,
 *          slack?:import('@slack/web-api').WebClient, channelId?:string, threadTs?:string}} options
 */
export function createTranscriptsServer({
  convexUrl,
  openaiApiKey,
  userAgent = 'gavel-slack-agent',
  fetchFn = fetch,
  slack = undefined,
  channelId = undefined,
  threadTs = undefined,
}) {
  const convex = new ConvexHttpClient(convexUrl);
  const headers = { 'User-Agent': userAgent };
  const legistar = async (path) => (await fetchFn(LEGISTAR + path, { headers })).json();
  const deps = {
    embedQuery: (text) => embedQuery(text, { apiKey: openaiApiKey, fetchFn }),
    search: (args) => convex.action(api.transcripts.search, args),
    getSpeakerMap: (eventId) => convex.query(api.speakerMaps.getByEvent, { eventId }),
    deepLink: videoMomentDeepLink,
    getEventItem: (eventId, itemId) => legistar(`/events/${eventId}/eventitems/${itemId}`),
    getEvent: (eventId) => legistar(`/events/${eventId}`),
    // Cuts the window out of the archive webcast and uploads it, so it plays inline in the thread.
    // Requires ffmpeg + yt-dlp on the host; the clip tool is only registered when Slack is wired.
    postClip: async ({ eventMedia, eventId, startSeconds, durationSeconds, title, comment }) => {
      const outPath = `/tmp/gavel-clip-${eventId}-${Math.floor(startSeconds)}.mp4`;
      try {
        await clipVideoMoment({ eventMedia, startSeconds, durationSeconds, outPath }, { run });
        await uploadClipToSlack(slack, {
          channel: channelId,
          thread_ts: threadTs,
          filePath: outPath,
          title,
          initialComment: comment,
        });
      } finally {
        rmSync(outPath, { force: true });
      }
    },
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

  const clipTool = tool(
    'clip_video_moment',
    CLIP_DESCRIPTION,
    {
      eventId: z.number().describe('The Legistar EventId of the meeting (from get_event_agenda)'),
      eventItemId: z
        .number()
        .optional()
        .describe('The agenda item to clip — its video index is the start. Omit if giving startSeconds.'),
      startSeconds: z
        .number()
        .optional()
        .describe('Exact second to start the clip, e.g. the timestamp on a search_transcripts receipt'),
      durationSeconds: z.number().optional().describe('Clip length in seconds (default 90, minimum 30)'),
    },
    async ({ eventId, eventItemId, startSeconds, durationSeconds }) => {
      const text = await runClipMoment({ eventId, eventItemId, startSeconds, durationSeconds }, deps);
      return { content: [{ type: 'text', text }] };
    },
  );

  // Clipping needs a Slack channel to upload into (and ffmpeg on the host). Without one, the
  // agent still gets search + the timestamped deep link.
  const tools = slack && channelId ? [searchTool, momentTool, clipTool] : [searchTool, momentTool];
  return createSdkMcpServer({ name: 'transcripts', version: '0.1.0', tools });
}
