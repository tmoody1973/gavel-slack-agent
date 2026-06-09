import { ConvexHttpClient } from 'convex/browser';

import { api } from '../../convex/_generated/api.js';
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

  const deps = {
    addWatch: ({ channelId, entity }) => requireConvex(convex).mutation(api.watches.addWatch, { channelId, entity }),
    getSubscription: (channelId) => requireConvex(convex).query(api.subscriptions.getSubscription, { channelId }),
    listWatches: (channelId) => requireConvex(convex).query(api.watches.listWatches, { channelId }),
  };

  app.command('/gavel', (args) => handleGavelCommand(args, deps));
}

function requireConvex(convex) {
  if (!convex) {
    throw new Error('CONVEX_URL is not configured');
  }
  return convex;
}
