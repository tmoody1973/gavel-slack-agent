import { ConvexHttpClient } from 'convex/browser';

import { enrichForAlert } from '../../alerts/enrich.js';
import { api } from '../../convex/_generated/api.js';
import { createHomeDeps } from '../../home/deps.js';
import { createLegistarClient } from '../../poller/legistar.js';
import { STORY_ANGLE_SCHEMA } from '../../stories/angle.js';
import { findMatterMoment } from '../../stories/dossier.js';
import { createClaudeGenerate } from '../../summarizer/index.js';
import { embedQuery } from '../../zoning/embed.js';
import { makeAlertAsk, makeAlertHistory, makeAlertWatch } from './alert-buttons.js';
import { makeDossierSend, makeDossierWatch } from './dossier-buttons.js';
import { handleFeedbackButton } from './feedback-buttons.js';
import {
  makeCommitteeOptions,
  makeDiscoverWatch,
  makeHomeAddWatch,
  makeHomeEditChannel,
  makeHomeWatchRemove,
} from './home-buttons.js';
import { makeParcelWatch } from './parcel-buttons.js';
import { makeStoryAsk, makeStoryBrowse, makeStoryLeadOverflow, makeStoryModalFilter } from './story-buttons.js';
import { makeVideoBrowse, makeVideoFilter } from './video-buttons.js';

/**
 * Register action listeners. Convex/Legistar boundaries are constructed here
 * (the listeners/commands/index.js pattern) so handlers stay unit-testable.
 * @param {import('@slack/bolt').App} app
 * @returns {void}
 */
export function register(app) {
  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) {
    app.logger?.warn?.('CONVEX_URL is not set — alert-card buttons will report errors.');
  }
  const convex = convexUrl ? new ConvexHttpClient(convexUrl) : null;
  const legistar = createLegistarClient({
    fetch: globalThis.fetch,
    client: 'milwaukee',
    userAgent: 'gavel-slack-agent (tarik@radiomilwaukee.org)',
  });

  const deps = {
    getDetectedItem: (eventItemId) => requireConvex(convex).query(api.detectedItems.getByEventItem, { eventItemId }),
    getMatter: (matterId) => legistar.getMatter(matterId),
    getMatterHistory: (matterId) => legistar.getMatterHistory(matterId),
    addWatch: ({ channelId, entity }) => requireConvex(convex).mutation(api.watches.addWatch, { channelId, entity }),
  };

  app.action('feedback', handleFeedbackButton);
  app.action('alert_watch', makeAlertWatch(deps));
  app.action('alert_history', makeAlertHistory(deps));
  app.action('alert_ask', makeAlertAsk(deps));

  app.action('parcel_watch', makeParcelWatch(deps));
  app.action('parcel_open_map', async ({ ack }) => ack());

  const homeDeps = createHomeDeps(app.client);
  app.action('home_add_watch', makeHomeAddWatch(homeDeps));
  app.action('discover_watch', makeDiscoverWatch(homeDeps));
  // MOO-127: the "📰 Story leads" watch button opens the same pre-filled add-watch
  // modal as Discover (App Home has no channel context to resolve a watch directly).
  // MOO-130: the /gavel stories carousel reuses story_watch the same way.
  app.action('story_watch', makeDiscoverWatch(homeDeps));
  app.action('home_edit_channel', makeHomeEditChannel(homeDeps));
  app.action('home_watch_remove', makeHomeWatchRemove(homeDeps));
  app.options('home_committees', makeCommitteeOptions(homeDeps));

  // MOO-130: Story-leads rich view. The modal/overflow/Ask need both the Home
  // boundaries (subscriptions, upcoming, channel names) and the alert-style record
  // lookups (detected row + matter file number) for the primed Ask-Gavel DM.
  // MOO-129: the reporter dossier. "📋 Brief me" assembles every reporting thread for one lead —
  // angle (Claude) + sponsor/contact + matter history + the transcript moment (vector search) +
  // outcome. The overflow handler routes 'b::' into openDossier, so storyDeps carries the dossier
  // boundaries too. Single-language (channel language), grounded, leads-not-verdicts.
  const dossierDeps = {
    enrich: (item) => enrichForAlert(item, legistar),
    listMembers: () => requireConvex(convex).query(api.councilMembers.listMembers, { client: 'milwaukee' }),
    getOutcomes: (matterId) => requireConvex(convex).query(api.outcomes.byMatter, { matterId }),
    getMatterHistory: deps.getMatterHistory,
    searchMoment: (item) =>
      findMatterMoment(item, {
        embedQuery: (text) => embedQuery(text, { apiKey: process.env.OPENAI_API_KEY }),
        search: (query) => requireConvex(convex).action(api.transcripts.search, query),
      }),
    generate: createClaudeGenerate({ schema: STORY_ANGLE_SCHEMA }),
  };

  const storyDeps = { ...homeDeps, ...dossierDeps, getDetectedItem: deps.getDetectedItem, getMatter: deps.getMatter };
  app.action('story_browse', makeStoryBrowse(storyDeps));
  app.action('story_modal_filter', makeStoryModalFilter(storyDeps));
  app.action('story_lead_overflow', makeStoryLeadOverflow(storyDeps));
  app.action('story_ask', makeStoryAsk(storyDeps));
  app.action('dossier_watch', makeDossierWatch(storyDeps));
  app.action('dossier_send', makeDossierSend(storyDeps));

  // MOO-142: meeting-video discovery. Browse + the committee dropdown share the cheap
  // pipeline (live Legistar look-back + one Convex ingested-id query). The ▶ Watch button
  // is a url link — Slack still dispatches an interaction, so ack it to avoid the spinner.
  const videoDeps = {
    listSubscriptions: homeDeps.listSubscriptions,
    listRecentMeetingsWithVideo: () => legistar.listRecentMeetingsWithVideo(),
    listIngestedEventIds: () => requireConvex(convex).query(api.transcripts.listIngestedEventIds, {}),
  };
  app.action('video_browse', makeVideoBrowse(videoDeps));
  app.action('video_filter', makeVideoFilter(videoDeps));
  app.action('video_watch', async ({ ack }) => ack());
}

function requireConvex(convex) {
  if (!convex) {
    throw new Error('CONVEX_URL is not configured');
  }
  return convex;
}
