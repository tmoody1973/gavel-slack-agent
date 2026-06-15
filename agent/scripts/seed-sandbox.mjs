#!/usr/bin/env node

// MOO-54: seed the demo sandbox — 2-3 neighborhood channels with per-channel
// subscriptions and a small set of content-dated, disclosed-as-staged messages,
// including the bilingual Punta Cana LLC / 2000 S 13th St thread the demo's
// community-memory search surfaces.
//
// You create the public channels and /invite the bot first; this script resolves
// each by name, upserts its subscription, and seeds the messages.
//
//   node scripts/seed-sandbox.mjs            seed for real
//   SEED_DRY_RUN=1 node scripts/seed-sandbox.mjs   print the plan, no writes
//   SEED_FORCE=1   node scripts/seed-sandbox.mjs   re-seed even if already seeded
//
// Idempotency: upsertSubscription is idempotent; message seeding is guarded by
// the pinned disclosure (a channel that already has it is skipped unless FORCE).

import { WebClient } from '@slack/web-api';
import { ConvexHttpClient } from 'convex/browser';
import { config } from 'dotenv';

config({ path: '.env.local' });
config();

import { api } from '../convex/_generated/api.js';
import { assertCorpusInvariants, buildSeedPlan, DISCLOSURE_MARKER, SANDBOX_CHANNELS } from '../sandbox/index.js';

const CLIENT = process.env.POLL_CLIENT || 'milwaukee';
const DRY_RUN = process.env.SEED_DRY_RUN === '1';
const FORCE = process.env.SEED_FORCE === '1';

const url = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL;
if (!url) {
  console.error('CONVEX_URL missing.');
  process.exit(1);
}

const convex = new ConvexHttpClient(url);
// Bot token posts + pins (must be a channel member). User token lists channels
// by name (the App Home already relies on it for the same reason).
const poster = new WebClient(process.env.SLACK_BOT_TOKEN);
const lister = new WebClient(process.env.SLACK_USER_TOKEN || process.env.SLACK_BOT_TOKEN);

async function resolveChannelIds() {
  const byName = new Map();
  let cursor;
  do {
    const res = await lister.conversations.list({
      types: 'public_channel',
      exclude_archived: true,
      limit: 1000,
      cursor,
    });
    for (const channel of res.channels ?? []) {
      byName.set(channel.name, channel.id);
    }
    cursor = res.response_metadata?.next_cursor || undefined;
  } while (cursor);
  return byName;
}

// Skip message seeding when the channel already carries the pinned disclosure,
// so a re-run does not double-post. If pins:read is unavailable we cannot verify
// — proceed but warn (or honor SEED_FORCE).
async function alreadySeeded(channelId) {
  try {
    const res = await poster.pins.list({ channel: channelId });
    return (res.items ?? []).some((item) => item.message?.text?.includes(DISCLOSURE_MARKER));
  } catch (err) {
    console.warn(`  ⚠️  could not read pins (${err.data?.error || err.message}); cannot verify idempotency`);
    return false;
  }
}

async function seedMessages(channelId, plan) {
  const disclosure = await poster.chat.postMessage({ channel: channelId, text: plan.disclosure });
  try {
    await poster.pins.add({ channel: channelId, timestamp: disclosure.ts });
  } catch (err) {
    console.warn(`  ⚠️  could not pin disclosure (${err.data?.error || err.message})`);
  }

  const threadTs = new Map();
  let posted = 0;
  for (const post of plan.posts) {
    const args = { channel: channelId, text: post.text };
    if (post.thread && threadTs.has(post.thread)) {
      args.thread_ts = threadTs.get(post.thread);
    }
    const res = await poster.chat.postMessage(args);
    if (post.thread && !threadTs.has(post.thread)) {
      threadTs.set(post.thread, res.ts);
    }
    posted += 1;
  }
  return posted;
}

async function main() {
  assertCorpusInvariants(SANDBOX_CHANNELS);
  const plans = buildSeedPlan(SANDBOX_CHANNELS);

  if (DRY_RUN) {
    for (const plan of plans) {
      console.log(`\n--- #${plan.channelName} (${plan.language}) ---`);
      console.log('subscription:', JSON.stringify({ client: CLIENT, ...plan.subscription }));
      console.log('disclosure:', plan.disclosure);
      for (const post of plan.posts) {
        console.log(`  ${post.thread ? '↳' : '•'} ${post.text}`);
      }
    }
    console.log(`\n[dry-run] ${plans.length} channels planned; no writes.`);
    return;
  }

  const byName = await resolveChannelIds();
  let seededChannels = 0;
  let seededMessages = 0;

  for (const plan of plans) {
    const channelId = byName.get(plan.channelName);
    if (!channelId) {
      console.warn(`✗ #${plan.channelName}: not found — create it and /invite the bot, then re-run.`);
      continue;
    }

    await convex.mutation(api.subscriptions.upsertSubscription, { channelId, ...plan.subscription });

    if (!FORCE && (await alreadySeeded(channelId))) {
      console.log(`= #${plan.channelName}: subscription upserted; already seeded (skip messages).`);
      seededChannels += 1;
      continue;
    }

    const posted = await seedMessages(channelId, plan);
    seededChannels += 1;
    seededMessages += posted;
    console.log(`✓ #${plan.channelName} (${plan.language}): subscription + ${posted} messages seeded.`);
  }

  console.log(
    `[${new Date().toISOString()}] ${CLIENT}: ${seededChannels}/${plans.length} channels, ${seededMessages} messages seeded.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`[${new Date().toISOString()}] seed failed:`, err.message);
    process.exit(1);
  });
