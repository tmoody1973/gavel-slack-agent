#!/usr/bin/env node

// "📬 From the city" civic-mail digest (MOO-153 core). Reads the real E-Notify rows
// in `civicNotifications`, aggregates them into one clustered briefing per channel
// (routine folded into counts, actionable items surfaced, recurring entities flagged,
// Legistar overlaps deduped), runs ONE bilingual Claude call, and renders the
// "From the city" Block Kit card. Mirrors scripts/digest-once.mjs.
//
//   node scripts/civicmail-digest-once.mjs --channel=C0BAPMK6HE2          # dry-run, prints the card
//   node scripts/civicmail-digest-once.mjs --channel=C0BAPMK6HE2 --post   # posts to the channel
//
// Flags / env:
//   --channel=ID  (or DIGEST_CHANNEL)  required — the target channel.
//   --post                              actually post (default: dry-run prints blocks).
//   --district=N  (or DIGEST_DISTRICT)  geo gate; default = the channel subscription's
//                                       boundary district, else citywide (all rows).
//   --lang=en|es  (or DIGEST_LANG)      card language; default = the subscription's language.
//
// The 2026-06-10 backfill is a SAMPLE WEEK (the live AgentMail webhook is dormant) — the
// card discloses this. Marking rows digested is deferred with the Tue/Fri cron, so this
// run is repeatable for the demo (it does not drain listPending).

import { WebClient } from '@slack/web-api';
import { ConvexHttpClient } from 'convex/browser';
import { config } from 'dotenv';

config({ path: '.env.local' });
config();

import { aggregateCivicMail } from '../civicmail/aggregate.js';
import { buildFromTheCityCard } from '../civicmail/digest-card.js';
import { DIGEST_BRIEFING_SCHEMA, generateDigestBriefing } from '../civicmail/digest-prompt.js';
import { api } from '../convex/_generated/api.js';
import { createClaudeGenerate } from '../summarizer/index.js';

const CLIENT = process.env.POLL_CLIENT || 'milwaukee';
const SNAPSHOT_NOTE = process.env.DIGEST_SNAPSHOT || 'sample week of 2026-06-10';

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : undefined;
}
const POST = process.argv.includes('--post');
const channelId = arg('channel') || process.env.DIGEST_CHANNEL;

const url = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL;
if (!url) {
  console.error('CONVEX_URL missing.');
  process.exit(1);
}
if (!channelId) {
  console.error('Channel required: --channel=<ID> (or DIGEST_CHANNEL).');
  process.exit(1);
}

const convex = new ConvexHttpClient(url);
const slack = new WebClient(process.env.SLACK_BOT_TOKEN || process.env.SLACK_USER_TOKEN);
const generate = createClaudeGenerate({ schema: DIGEST_BRIEFING_SCHEMA });

async function main() {
  const now = new Date().toISOString().slice(0, 10);
  const [notifications, subscriptions, upcoming] = await Promise.all([
    convex.query(api.civicNotifications.listPending, {}),
    convex.query(api.subscriptions.listSubscriptions, { client: CLIENT }),
    convex.query(api.detectedItems.listUpcoming, { client: CLIENT, fromDate: now }),
  ]);

  const sub = subscriptions.find((s) => s.channelId === channelId);
  const district = arg('district') ?? process.env.DIGEST_DISTRICT ?? sub?.boundary?.value ?? null;
  const language = arg('lang') ?? process.env.DIGEST_LANG ?? sub?.language ?? 'en';

  // Poller-detected events power the meeting-vs-Legistar dedup (civicmail/dedup.js).
  const legistarItems = upcoming.map((row) => ({ eventId: row.eventId }));

  const aggregate = aggregateCivicMail(notifications, { legistarItems, district });
  const briefing = await generateDigestBriefing(aggregate, { generate });
  const card = buildFromTheCityCard({ aggregate, briefing, language, snapshotNote: SNAPSHOT_NOTE });

  console.log(
    `[${new Date().toISOString()}] ${CLIENT} digest for ${channelId} (${language}${district ? `, district ${district}` : ', citywide'}): ` +
      `${aggregate.total} notifications, ${aggregate.suppressed} deduped, ` +
      `${aggregate.recurringEntities.length} recurring entities.`,
  );

  if (!POST) {
    console.log(`\n--- EN briefing ---\n${briefing.en.briefing}\n👀 ${briefing.en.pattern}`);
    console.log(`\n--- ES briefing ---\n${briefing.es.briefing}\n👀 ${briefing.es.pattern}`);
    console.log('\n--- card blocks (dry-run; pass --post to publish) ---');
    console.log(JSON.stringify(card.blocks, null, 2));
    return;
  }

  await slack.chat.postMessage({ channel: channelId, text: card.text, blocks: card.blocks });
  console.log(`✓ posted "From the city" digest to ${channelId}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`[${new Date().toISOString()}] civicmail digest failed:`, err.message);
    process.exit(1);
  });
