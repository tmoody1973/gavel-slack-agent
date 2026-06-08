#!/usr/bin/env node

// One real poll cycle for the Fly cron: fetch live Legistar, diff against
// Convex, enqueue new items, exit. {client}-aware via POLL_CLIENT (default
// milwaukee). Unlike poller-verify.mjs, this does NOT clean up — the rows it
// writes ARE the ledger.

import { ConvexHttpClient } from 'convex/browser';
import { config } from 'dotenv';

config({ path: '.env.local' });
config();

import { api } from '../convex/_generated/api.js';
import { createLegistarClient, runPoll } from '../poller/index.js';

const CLIENT = process.env.POLL_CLIENT || 'milwaukee';
const USER_AGENT =
  'GavelCivicAgent/0.1 (+https://github.com/tmoody1973/gavel-slack-agent; contact tarik@radiomilwaukee.org)';

const url = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL;
if (!url) {
  console.error('CONVEX_URL missing.');
  process.exit(1);
}

const convex = new ConvexHttpClient(url);
const legistar = createLegistarClient({ fetch, client: CLIENT, userAgent: USER_AGENT });

runPoll({
  client: CLIENT,
  fetchUpcomingFinalEvents: () => legistar.fetchUpcomingFinalEvents(),
  fetchEventItems: (id) => legistar.fetchEventItems(id),
  readSeenEventItemIds: (client) => convex.query(api.detectedItems.listSeenKeys, { client }),
  enqueueDetected: (items) => convex.mutation(api.detectedItems.enqueueDetected, { items }),
})
  .then((r) => {
    console.log(
      `[${new Date().toISOString()}] ${CLIENT}: fetched ${r.fetchedCount}, detected ${r.newItems.length} new`,
    );
    process.exit(0);
  })
  .catch((err) => {
    console.error(`[${new Date().toISOString()}] poll failed:`, err.message);
    process.exit(1);
  });
