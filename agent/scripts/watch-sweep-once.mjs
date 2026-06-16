#!/usr/bin/env node

// Daily watchlist sweep (MOO-53): diff new matters + permits against every
// channel's watched entities, post one bilingual card per channel with its fresh
// hits, and record them so tomorrow's sweep won't repeat. Sibling cron to the
// Sunday digest.
//
// WATCH_LOOKBACK_DAYS  how far back to scan new matters/permits (default 7)
// WATCH_DRY_RUN=1      print cards instead of posting (and skip recording)

import { WebClient } from '@slack/web-api';
import { ConvexHttpClient } from 'convex/browser';
import { config } from 'dotenv';

config({ path: '.env.local' });
config();

import { createParcelClient } from '../../mcp-server/src/parcel.js';
import { watchCard } from '../blockkit/index.js';
import { api } from '../convex/_generated/api.js';
import { createLegistarClient } from '../poller/index.js';
import { classifyEntity, runWatchSweep } from '../watch/index.js';

const CLIENT = process.env.POLL_CLIENT || 'milwaukee';
const LOOKBACK = Number(process.env.WATCH_LOOKBACK_DAYS || '7');
const DRY_RUN = process.env.WATCH_DRY_RUN === '1';
const USER_AGENT =
  'GavelCivicAgent/0.1 (+https://github.com/tmoody1973/gavel-slack-agent; contact tarik@radiomilwaukee.org)';
const PORTFOLIO_LIMIT = 25;

const url = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL;
if (!url) {
  console.error('CONVEX_URL missing.');
  process.exit(1);
}

const convex = new ConvexHttpClient(url);
const legistar = createLegistarClient({ fetch, client: CLIENT, userAgent: USER_AGENT });
const parcel = createParcelClient({ fetch, userAgent: USER_AGENT });
const slack = new WebClient(process.env.SLACK_BOT_TOKEN || process.env.SLACK_USER_TOKEN);

function sinceDate(lookbackDays) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - lookbackDays);
  return d.toISOString().slice(0, 10);
}

/**
 * Permit hits for one watch. Address watches hit permits directly; name/LLC
 * watches resolve owner → MPROP parcels → each parcel's new permits (the
 * ownership join). Failures degrade to "no permit hits" — matters still fire.
 */
async function resolvePermitHits(watch, since) {
  try {
    if (classifyEntity(watch.entity) === 'address') {
      const { permits } = await parcel.getPermits(watch.entity, { since });
      return permits;
    }
    const portfolio = await parcel.getOwnershipPortfolio(watch.entity, { match: 'contains', limit: PORTFOLIO_LIMIT });
    const out = [];
    for (const p of portfolio.parcels) {
      const { permits } = await parcel.getPermits(p.address, { since });
      out.push(...permits);
    }
    return out;
  } catch (err) {
    console.error(`[watch-sweep] permit resolution failed for "${watch.entity}": ${err.message}`);
    return [];
  }
}

async function main() {
  const since = sinceDate(LOOKBACK);
  const [watches, subscriptions] = await Promise.all([
    convex.query(api.watches.listAllWatches, {}),
    convex.query(api.subscriptions.listSubscriptions, { client: CLIENT }),
  ]);
  const langByChannel = new Map(subscriptions.map((s) => [s.channelId, s.language || 'en']));

  const summary = await runWatchSweep({
    watches,
    lookbackDays: LOOKBACK,
    sinceDate: since,
    now: () => Date.now(),
    fetchRecentMatters: (days) => legistar.fetchRecentMatters(days),
    resolvePermitHits: (watch) => resolvePermitHits(watch, since),
    listAlertedKeys: () => convex.query(api.watchAlerts.listAlertedKeys, {}),
    buildCard: (hits, language) => watchCard({ hits, language }),
    postCard: async (channelId, card) => {
      if (DRY_RUN) {
        console.log(`--- ${channelId} ---\n${JSON.stringify(card.blocks, null, 2)}`);
        return;
      }
      await slack.chat.postMessage({ channel: channelId, text: card.text, blocks: card.blocks });
    },
    recordAlerts: (alerts) =>
      DRY_RUN ? Promise.resolve(0) : convex.mutation(api.watchAlerts.recordAlerts, { alerts }),
    languageFor: (channelId) => langByChannel.get(channelId) || 'en',
  });

  console.log(
    `[${new Date().toISOString()}] ${CLIENT}: ${summary.watchCount} watches, ${summary.matterCount} recent matters, ` +
      `${summary.freshHits} fresh hit(s) across ${summary.channels} channel(s)${DRY_RUN ? ' (dry-run)' : ''}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`[${new Date().toISOString()}] watch sweep failed:`, err.message);
    process.exit(1);
  });
