#!/usr/bin/env node

// Weekly Sunday Digest (MOO-76): one "📬 Your civic week" card per subscribed
// channel — N matching items this week, top-3 with file links, bilingual per
// the channel's language. Reuses the App Home's Convex reads + alerts/match.js.
//
// DIGEST_DRY_RUN=1   print the cards instead of posting
// DIGEST_POST_EMPTY=1 also post to channels with nothing this week (default: skip)
// Unlike a manual preview, the cron path posts and exits.

import { WebClient } from '@slack/web-api';
import { ConvexHttpClient } from 'convex/browser';
import { config } from 'dotenv';

config({ path: '.env.local' });
config();

import { api } from '../convex/_generated/api.js';
import { buildChannelDigests } from '../digest/index.js';
import { createLegistarClient } from '../poller/index.js';

const CLIENT = process.env.POLL_CLIENT || 'milwaukee';
const DRY_RUN = process.env.DIGEST_DRY_RUN === '1';
const POST_EMPTY = process.env.DIGEST_POST_EMPTY === '1';
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

// Enrich only the rendered top-3 (buildChannelDigests guarantees this). Meeting
// pages are cached by eventId; every fetch degrades to title-only / no-link.
const eventCache = new Map();
async function enrich(row) {
  const out = {};
  if (row.matterId) {
    try {
      out.fileNumber = (await legistar.getMatter(row.matterId))?.fileNumber;
    } catch {
      /* title-only */
    }
  }
  if (row.eventId) {
    try {
      if (!eventCache.has(row.eventId)) eventCache.set(row.eventId, await legistar.getEvent(row.eventId));
      out.legistarUrl = eventCache.get(row.eventId)?.inSiteUrl;
    } catch {
      /* no link */
    }
  }
  return out;
}

async function main() {
  const now = new Date().toISOString().slice(0, 10);
  const [subscriptions, upcoming] = await Promise.all([
    convex.query(api.subscriptions.listSubscriptions, { client: CLIENT }),
    convex.query(api.detectedItems.listUpcoming, { client: CLIENT, fromDate: now }),
  ]);

  const digests = await buildChannelDigests({ subscriptions, upcoming, enrich, now });

  let posted = 0;
  for (const d of digests) {
    if (d.total === 0 && !POST_EMPTY) continue;
    if (DRY_RUN) {
      console.log(`--- ${d.channelId} (${d.language}) total=${d.total} ---`);
      console.log(JSON.stringify(d.card.blocks, null, 2));
      continue;
    }
    await slack.chat.postMessage({ channel: d.channelId, text: d.card.text, blocks: d.card.blocks });
    posted += 1;
  }

  console.log(
    `[${new Date().toISOString()}] ${CLIENT}: ${subscriptions.length} subscriptions, ${digests.length} digests, posted ${posted}${DRY_RUN ? ' (dry-run)' : ''}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`[${new Date().toISOString()}] digest failed:`, err.message);
    process.exit(1);
  });
