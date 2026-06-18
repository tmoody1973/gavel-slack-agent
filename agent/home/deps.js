import { WebClient } from '@slack/web-api';
import { ConvexHttpClient } from 'convex/browser';

import { api } from '../convex/_generated/api.js';
import { createLegistarClient } from '../poller/legistar.js';

const BODIES_TTL_MS = 60 * 60 * 1000;
const NAME_TTL_MS = 10 * 60 * 1000;

/**
 * Boundaries for the App Home: Convex reads/writes, Legistar bodies (cached —
 * the committee typeahead's source), Slack channel names (cached). Constructed
 * once per listener registry; handlers receive it injected for testability.
 * @param {{conversations: {info: Function}}} slackClient - a WebClient-shaped object
 */
export function createHomeDeps(slackClient) {
  const convexUrl = process.env.CONVEX_URL;
  const convex = convexUrl ? new ConvexHttpClient(convexUrl) : null;
  const legistar = createLegistarClient({
    fetch: globalThis.fetch,
    client: 'milwaukee',
    userAgent: 'gavel-slack-agent (tarik@radiomilwaukee.org)',
  });
  const bodiesCache = { at: 0, names: [] };
  const nameCache = new Map();
  // The bot token lacks channels:read until the next manifest sync; the user
  // token (standing RTS dependency) has it — prefer it for name lookups.
  const nameClient = process.env.SLACK_USER_TOKEN ? new WebClient(process.env.SLACK_USER_TOKEN) : slackClient;

  return {
    listSubscriptions: () => requireConvex(convex).query(api.subscriptions.listSubscriptions, {}),
    listAllWatches: () => requireConvex(convex).query(api.watches.listAllWatches, {}),
    listUpcoming: () =>
      requireConvex(convex).query(api.detectedItems.listUpcoming, {
        fromDate: new Date().toISOString().slice(0, 10),
      }),
    getSubscription: (channelId) => requireConvex(convex).query(api.subscriptions.getSubscription, { channelId }),
    addWatch: (input) => requireConvex(convex).mutation(api.watches.addWatch, input),
    removeWatch: (input) => requireConvex(convex).mutation(api.watches.removeWatch, input),
    upsertSubscription: (input) => requireConvex(convex).mutation(api.subscriptions.upsertSubscription, input),
    markWelcomePosted: (channelId) =>
      requireConvex(convex).mutation(api.subscriptions.markWelcomePosted, { channelId }),

    /** Active Legistar body names, cached an hour — the typeahead's source. */
    async listCommitteeNames() {
      if (Date.now() - bodiesCache.at > BODIES_TTL_MS) {
        bodiesCache.names = await legistar.fetchActiveBodyNames();
        bodiesCache.at = Date.now();
      }
      return bodiesCache.names;
    },

    /** Channel display name via conversations.info, cached 10 minutes. */
    async getChannelName(channelId) {
      const cached = nameCache.get(channelId);
      if (cached && Date.now() - cached.at < NAME_TTL_MS) return cached.name;
      const info = await nameClient.conversations.info({ channel: channelId });
      const name = info.channel?.name ?? channelId;
      nameCache.set(channelId, { at: Date.now(), name });
      return name;
    },
  };
}

function requireConvex(convex) {
  if (!convex) throw new Error('CONVEX_URL is not configured');
  return convex;
}
