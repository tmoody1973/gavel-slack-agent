#!/usr/bin/env node

// Escalation sweep (MOO-52): for each matter we've already alerted on (and not
// yet escalated, within the recency window), check MatterHistory; when the
// controlling committee has recommended it for adoption/passage, ping the
// channels that got the original alert that it's headed to the full Council.
//
// ESCALATION_LOOKBACK_DAYS  how far back to consider tracked matters (default 90)
// ESCALATION_DRY_RUN=1      print pings instead of posting (and skip recording)

import { WebClient } from '@slack/web-api';
import { ConvexHttpClient } from 'convex/browser';
import { config } from 'dotenv';

config({ path: '.env.local' });
config();

import { escalationCard } from '../blockkit/index.js';
import { api } from '../convex/_generated/api.js';
import { runEscalationSweep } from '../escalation/index.js';
import { createLegistarClient, matterDetailUrl } from '../poller/index.js';

const CLIENT = process.env.POLL_CLIENT || 'milwaukee';
const LOOKBACK = Number(process.env.ESCALATION_LOOKBACK_DAYS || '90');
const DRY_RUN = process.env.ESCALATION_DRY_RUN === '1';
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

async function main() {
  const detectedSince = Date.now() - LOOKBACK * 24 * 60 * 60 * 1000;
  const subscriptions = await convex.query(api.subscriptions.listSubscriptions, { client: CLIENT });
  const langByChannel = new Map(subscriptions.map((s) => [s.channelId, s.language || 'en']));

  const summary = await runEscalationSweep({
    client: CLIENT,
    detectedSince,
    now: () => Date.now(),
    listTrackedMatters: (client) => convex.query(api.detectedItems.listSentWithMatter, { client }),
    listEscalatedMatterIds: (client) => convex.query(api.escalations.listEscalatedMatterIds, { client }),
    listSubscriptions: (client) => convex.query(api.subscriptions.listSubscriptions, { client }),
    getMatterHistory: (matterId) => legistar.getMatterHistory(matterId),
    getMatterMeta: (matterId) => legistar.getMatter(matterId),
    matterUrl: (matterId, guid) => matterDetailUrl(matterId, guid),
    buildCard: (info, language) => escalationCard({ ...info, language }),
    postCard: async (channel, card) => {
      if (DRY_RUN) {
        console.log(`--- ${channel} ---\n${JSON.stringify(card.blocks, null, 2)}`);
        return;
      }
      await slack.chat.postMessage({ channel, text: card.text, blocks: card.blocks });
    },
    recordEscalation: (rec) => (DRY_RUN ? Promise.resolve() : convex.mutation(api.escalations.recordEscalation, rec)),
    languageFor: (channel) => langByChannel.get(channel) || 'en',
  });

  console.log(
    `[${new Date().toISOString()}] ${CLIENT}: ${summary.trackedCount} tracked matters, ` +
      `${summary.detected} escalating, ${summary.pinged} ping(s)${DRY_RUN ? ' (dry-run)' : ''}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`[${new Date().toISOString()}] escalation sweep failed:`, err.message);
    process.exit(1);
  });
