#!/usr/bin/env node

// One real poll cycle for the Fly cron: fetch live Legistar, diff against
// Convex, enqueue new items, exit. {client}-aware via POLL_CLIENT (default
// milwaukee). Unlike poller-verify.mjs, this does NOT clean up — the rows it
// writes ARE the ledger.

import { WebClient } from '@slack/web-api';
import { ConvexHttpClient } from 'convex/browser';
import { config } from 'dotenv';

config({ path: '.env.local' });
config();

import { buildFooter, enrichForAlert, processPendingAlerts } from '../alerts/index.js';
import { api } from '../convex/_generated/api.js';
import { createLegistarClient, runPoll } from '../poller/index.js';
import { BILINGUAL_OUTPUT_SCHEMA, createClaudeGenerate, summarizeMatterBilingual } from '../summarizer/index.js';

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
const slack = new WebClient(process.env.SLACK_BOT_TOKEN || process.env.SLACK_USER_TOKEN);
const generate = createClaudeGenerate({ schema: BILINGUAL_OUTPUT_SCHEMA });

async function main() {
  const poll = await runPoll({
    client: CLIENT,
    fetchUpcomingFinalEvents: () => legistar.fetchUpcomingFinalEvents(),
    fetchEventItems: (id) => legistar.fetchEventItems(id),
    readSeenEventItemIds: (client) => convex.query(api.detectedItems.listSeenKeys, { client }),
    enqueueDetected: (items) => convex.mutation(api.detectedItems.enqueueDetected, { items }),
  });

  const alerts = await processPendingAlerts({
    client: CLIENT,
    listPending: (client) => convex.query(api.detectedItems.listPending, { client }),
    listSubscriptions: (client) => convex.query(api.subscriptions.listSubscriptions, { client }),
    enrich: (row) => enrichForAlert(row, legistar),
    generateBilingual: (matter) => summarizeMatterBilingual(matter, { generate }),
    buildFooterText: (event, person) => buildFooter(event, person),
    postCard: (channel, card) => slack.chat.postMessage({ channel, text: card.text, blocks: card.blocks }),
    markSent: (client, eventItemId) => convex.mutation(api.detectedItems.markSent, { client, eventItemId }),
    logger: console,
  });

  const postedCount = alerts.reduce((n, a) => n + a.posted, 0);
  console.log(
    `[${new Date().toISOString()}] ${CLIENT}: fetched ${poll.fetchedCount}, detected ${poll.newItems.length} new; alerts processed ${alerts.length}, posted ${postedCount}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`[${new Date().toISOString()}] poll/alert failed:`, err.message);
    process.exit(1);
  });
