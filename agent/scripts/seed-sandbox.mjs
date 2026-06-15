#!/usr/bin/env node

// MOO-54: seed the demo sandbox — 2-3 neighborhood channels with per-channel
// subscriptions and a small set of content-dated, disclosed-as-staged messages,
// including the bilingual Punta Cana LLC / 2000 S 13th St thread the demo's
// community-memory search surfaces.
//
// It tries to create any missing public channel + invite the bot, but channel
// creation needs channels:manage (not on the current org-wide install), so when
// that fails it warns and you create the channel + /invite @Gavel manually; it
// then upserts each subscription and seeds the messages.
//
//   SLACK_TEAM_ID=T... node scripts/seed-sandbox.mjs   seed for real (Grid: team id required)
//   SEED_DRY_RUN=1 node scripts/seed-sandbox.mjs       print the plan, no writes
//   SEED_FORCE=1   node scripts/seed-sandbox.mjs       re-seed even if already seeded
//
// Idempotency: upsertSubscription is idempotent; message seeding is skipped for
// any channel whose history already contains the disclosure message (unless FORCE).

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
// Enterprise Grid requires a workspace team id on conversations.list/create.
const TEAM_ID = process.env.SLACK_TEAM_ID || undefined;

const url = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL;
if (!url) {
  console.error('CONVEX_URL missing.');
  process.exit(1);
}

const convex = new ConvexHttpClient(url);
// Bot token posts + reads history (must be a channel member). User token lists
// channels by name (the App Home already relies on it for the same reason).
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
      ...(TEAM_ID ? { team_id: TEAM_ID } : {}),
    });
    for (const channel of res.channels ?? []) {
      byName.set(channel.name, channel.id);
    }
    cursor = res.response_metadata?.next_cursor || undefined;
  } while (cursor);
  return byName;
}

/** The bot's own user id — needed to invite it into freshly created channels. */
async function botUser() {
  try {
    return (await poster.auth.test()).user_id;
  } catch (err) {
    console.warn(`⚠️  auth.test failed (${err.data?.error || err.message}); cannot auto-invite the bot`);
    return null;
  }
}

/**
 * Return the channel id, creating the public channel by name if it is missing.
 * Creation needs channels:manage (not granted on the current org-wide install),
 * so a failure is not fatal — we warn and let the operator create it manually.
 * Returns null when the channel neither exists nor could be created.
 */
async function ensureChannel(name, byName) {
  const existing = byName.get(name);
  if (existing) return existing;
  try {
    const res = await lister.conversations.create({
      name,
      is_private: false,
      ...(TEAM_ID ? { team_id: TEAM_ID } : {}),
    });
    byName.set(name, res.channel.id);
    console.log(`  + created #${name}`);
    return res.channel.id;
  } catch (err) {
    console.warn(
      `  ⚠️  could not create #${name} (${err.data?.error || err.message}); create it manually and /invite @Gavel`,
    );
    return null;
  }
}

/** Invite the bot so it can post; tolerate it already being a member. */
async function ensureBotMember(channelId, botUserId) {
  if (!botUserId) return;
  try {
    await lister.conversations.invite({ channel: channelId, users: botUserId });
  } catch (err) {
    const code = err.data?.error;
    if (code !== 'already_in_channel') {
      console.warn(`  ⚠️  could not invite the bot (${code || err.message}); invite @Gavel manually if posting fails`);
    }
  }
}

// Skip message seeding when the channel already carries the disclosure message,
// so a re-run does not double-post. Uses conversations.history (the bot has
// channels:history); if unavailable we proceed but warn (or honor SEED_FORCE).
async function alreadySeeded(channelId) {
  try {
    const res = await poster.conversations.history({ channel: channelId, limit: 200 });
    return (res.messages ?? []).some((message) => message.text?.includes(DISCLOSURE_MARKER));
  } catch (err) {
    console.warn(`  ⚠️  could not read history (${err.data?.error || err.message}); cannot verify idempotency`);
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
  const botUserId = await botUser();
  let seededChannels = 0;
  let seededMessages = 0;

  for (const plan of plans) {
    try {
      const channelId = await ensureChannel(plan.channelName, byName);
      if (!channelId) continue;
      await ensureBotMember(channelId, botUserId);
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
    } catch (err) {
      console.warn(`✗ #${plan.channelName}: ${err.data?.error || err.message}`);
    }
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
