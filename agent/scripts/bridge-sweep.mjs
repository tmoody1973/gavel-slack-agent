#!/usr/bin/env node

// Community-memory bridge sweep (MOO-125). For each subscribed channel's salient upcoming
// agenda items, translate the item to a plain-language query, live-search THAT channel's own
// history via RTS, ask Claude whether the chatter is genuinely about the item, and — on a
// confident match — post a bilingual "you've been discussing this, it's up for a vote" card and
// record the (channel,item) so it's never re-surfaced.
//
// COMPLIANCE: Slack message content is queried live and NEVER persisted. Only official ids +
// timestamps are written (bridgeProposals). {client}-aware via POLL_CLIENT.
//
//   node scripts/bridge-sweep.mjs            # real sweep (posts + records)
//   node scripts/bridge-sweep.mjs --dry      # log matches, post/record NOTHING
//   node scripts/bridge-sweep.mjs --channel C0B8KS5VCCC   # scope to one channel

import { WebClient } from '@slack/web-api';
import { ConvexHttpClient } from 'convex/browser';
import { config } from 'dotenv';

config({ path: '.env.local' });
config();

import {
  BRIDGE_JUDGE_SCHEMA,
  BRIDGE_QUERY_SCHEMA,
  findBridgeMatches,
  generateBridgeQuery,
  judgeBridgeMatch,
} from '../agent/community-memory/bridge.js';
import { searchChannel } from '../agent/community-memory/search-channel.js';
import { buildBridgeCard } from '../blockkit/bridge-card.js';
import { api } from '../convex/_generated/api.js';
import { createClaudeGenerate } from '../summarizer/index.js';

const CLIENT = process.env.POLL_CLIENT || 'milwaukee';
const DRY = process.argv.includes('--dry');
const channelArgIndex = process.argv.indexOf('--channel');
const ONLY_CHANNEL = channelArgIndex !== -1 ? process.argv[channelArgIndex + 1] : null;

const url = process.env.CONVEX_URL;
const userToken = process.env.SLACK_USER_TOKEN;
if (!url) throw new Error('CONVEX_URL missing.');
if (!userToken) throw new Error('SLACK_USER_TOKEN missing — RTS needs the user token.');

const convex = new ConvexHttpClient(url);
const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
const generateQueryFn = createClaudeGenerate({ schema: BRIDGE_QUERY_SCHEMA });
const judgeFn = createClaudeGenerate({ schema: BRIDGE_JUDGE_SCHEMA });

async function main() {
  const fromDate = new Date().toISOString().slice(0, 10);
  const [allSubs, upcoming, proposed] = await Promise.all([
    convex.query(api.subscriptions.listSubscriptions, { client: CLIENT }),
    convex.query(api.detectedItems.listUpcoming, { client: CLIENT, fromDate }),
    convex.query(api.bridge.listProposed, {}),
  ]);
  const subscriptions = ONLY_CHANNEL ? allSubs.filter((s) => s.channelId === ONLY_CHANNEL) : allSubs;

  const matches = await findBridgeMatches(
    { upcoming, subscriptions, proposed },
    {
      generateQuery: (item) => generateBridgeQuery(item, { generate: generateQueryFn }),
      searchChannel: ({ queryEn, queryEs, channelId }) => searchChannel({ queryEn, queryEs, channelId }, { userToken }),
      judge: ({ item, snippets }) => judgeBridgeMatch({ item, snippets }, { generate: judgeFn }),
    },
  );

  let posted = 0;
  for (const match of matches) {
    console.log(
      `  → ${DRY ? '[dry] ' : ''}#${match.channelId}: "${match.entity}" → item ${match.item.eventItemId} (${match.confidence.toFixed(2)}, ${match.messageCount} msg, ${match.language})`,
    );
    if (DRY) continue;
    const card = buildBridgeCard(match);
    await slack.chat.postMessage({ channel: match.channelId, text: card.text, blocks: card.blocks });
    await convex.mutation(api.bridge.recordProposal, {
      channelId: match.channelId,
      client: match.client,
      eventItemId: match.item.eventItemId,
      proposedAt: Date.now(),
    });
    posted += 1;
  }

  console.log(
    `[${new Date().toISOString()}] bridge${DRY ? ' (dry)' : ''}: ${subscriptions.length} channel(s), ${upcoming.length} upcoming, ${matches.length} match(es), ${posted} posted`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`[${new Date().toISOString()}] bridge sweep failed:`, err.message);
    process.exit(1);
  });
