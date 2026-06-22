import { ConvexHttpClient } from 'convex/browser';

import { enrichForAlert } from '../../alerts/enrich.js';
import { api } from '../../convex/_generated/api.js';
import { createLegistarClient } from '../../poller/legistar.js';
import { STORY_ANGLE_SCHEMA } from '../../stories/angle.js';
import { createClaudeGenerate } from '../../summarizer/index.js';
import { embedTexts } from '../../zoning/embed.js';
import { handleGavelCommand } from './gavel.js';

/**
 * Register slash-command listeners. The Convex boundary is constructed here
 * so the handler stays pure and unit-testable.
 * @param {import('@slack/bolt').App} app
 * @returns {void}
 */
export function register(app) {
  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) {
    app.logger?.warn?.('CONVEX_URL is not set — /gavel commands will report errors instead of reading config.');
  }
  const convex = convexUrl ? new ConvexHttpClient(convexUrl) : null;
  const legistar = createLegistarClient({
    fetch: globalThis.fetch,
    client: 'milwaukee',
    userAgent: 'gavel-slack-agent (tarik@radiomilwaukee.org)',
  });
  // The story-angle Claude call (MOO-127), constructed once and constrained to the
  // {hook, whyStory} schema. Only invoked on `/gavel stories`, never on the Home path.
  const generateAngle = createClaudeGenerate({ schema: STORY_ANGLE_SCHEMA });

  const deps = {
    addWatch: ({ channelId, entity }) => requireConvex(convex).mutation(api.watches.addWatch, { channelId, entity }),
    getSubscription: (channelId) => requireConvex(convex).query(api.subscriptions.getSubscription, { channelId }),
    listWatches: (channelId) => requireConvex(convex).query(api.watches.listWatches, { channelId }),
    removeWatch: ({ channelId, entity }) =>
      requireConvex(convex).mutation(api.watches.removeWatch, { channelId, entity }),

    // MOO-127 Story Radar boundaries.
    listUpcoming: () =>
      requireConvex(convex).query(api.detectedItems.listUpcoming, {
        fromDate: new Date().toISOString().slice(0, 10),
      }),
    listMembers: () => requireConvex(convex).query(api.councilMembers.listMembers, {}),
    enrichLead: (item) => enrichForAlert(item, legistar),
    generateAngle,
    countTranscript: (eventId) => requireConvex(convex).query(api.transcripts.countByEvent, { eventId }),

    // MOO-142 video-discovery boundaries (/gavel video).
    listRecentMeetingsWithVideo: () => legistar.listRecentMeetingsWithVideo(),
    listIngestedEventIds: () => requireConvex(convex).query(api.transcripts.listIngestedEventIds, {}),

    // MOO-153 federated /gavel search — civic mail (keyword + semantic), Legistar
    // agendas (keyword over title), minutes + zoning (semantic). The query is embedded
    // once (embedQuery) and the three vector lanes share it. No OpenAI key → embedQuery
    // returns null and the semantic lanes are skipped (keyword still works).
    embedQuery: async (query) => {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) return null;
      const [vector] = await embedTexts([query], { apiKey });
      return vector;
    },
    searchNotifications: ({ term, limit }) =>
      requireConvex(convex).query(api.civicNotifications.searchText, { term, limit }),
    semanticSearch: async (vector) => {
      const hits = await requireConvex(convex).action(api.civicNotifications.findSimilar, {
        embedding: vector,
        limit: 12,
      });
      if (hits.length === 0) return [];
      return requireConvex(convex).query(api.civicNotifications.getByIds, { ids: hits.map((hit) => hit._id) });
    },
    searchAgendas: (term) =>
      requireConvex(convex).query(api.detectedItems.searchTitle, { term, client: 'milwaukee', limit: 8 }),
    searchMinutes: (vector) => requireConvex(convex).action(api.transcripts.search, { embedding: vector, limit: 5 }),
    searchZoning: (vector) => requireConvex(convex).action(api.zoning.search, { embedding: vector, limit: 5 }),
  };

  app.command('/gavel', (args) => handleGavelCommand(args, deps));
}

function requireConvex(convex) {
  if (!convex) {
    throw new Error('CONVEX_URL is not configured');
  }
  return convex;
}
