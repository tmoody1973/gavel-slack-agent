import { ConvexHttpClient } from 'convex/browser';

import { enrichForAlert } from '../../alerts/enrich.js';
import { api } from '../../convex/_generated/api.js';
import { createLegistarClient } from '../../poller/legistar.js';
import { STORY_ANGLE_SCHEMA } from '../../stories/angle.js';
import { createClaudeGenerate } from '../../summarizer/index.js';
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

    // MOO-153 civic-mail search (/gavel search) — full-text over civicNotifications.
    searchNotifications: ({ term, limit }) =>
      requireConvex(convex).query(api.civicNotifications.searchText, { term, limit }),
  };

  app.command('/gavel', (args) => handleGavelCommand(args, deps));
}

function requireConvex(convex) {
  if (!convex) {
    throw new Error('CONVEX_URL is not configured');
  }
  return convex;
}
