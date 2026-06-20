import { ConvexHttpClient } from 'convex/browser';

import { api } from '../../convex/_generated/api.js';
import { createHomeDeps } from '../../home/deps.js';
import { createLegistarClient } from '../../poller/legistar.js';
import { makeAlertAsk, makeAlertHistory, makeAlertWatch } from './alert-buttons.js';
import { handleFeedbackButton } from './feedback-buttons.js';
import {
  makeCommitteeOptions,
  makeDiscoverWatch,
  makeHomeAddWatch,
  makeHomeEditChannel,
  makeHomeWatchRemove,
} from './home-buttons.js';
import { makeParcelWatch } from './parcel-buttons.js';

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
  app.action('story_watch', makeDiscoverWatch(homeDeps));
  app.action('home_edit_channel', makeHomeEditChannel(homeDeps));
  app.action('home_watch_remove', makeHomeWatchRemove(homeDeps));
  app.options('home_committees', makeCommitteeOptions(homeDeps));
}

function requireConvex(convex) {
  if (!convex) {
    throw new Error('CONVEX_URL is not configured');
  }
  return convex;
}
