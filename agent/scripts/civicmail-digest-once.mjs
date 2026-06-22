#!/usr/bin/env node

// "📬 From the city" civic-mail digest (MOO-153 core). Reads the real E-Notify rows
// in `civicNotifications`, aggregates them into one clustered briefing per channel
// (routine folded into counts, actionable items surfaced, recurring entities flagged,
// Legistar overlaps deduped), runs ONE bilingual Claude call, and renders the
// "From the city" Block Kit card. Mirrors scripts/digest-once.mjs.
//
//   node scripts/civicmail-digest-once.mjs --channel=C0BAPMK6HE2          # dry-run one channel
//   node scripts/civicmail-digest-once.mjs --channel=C0BAPMK6HE2 --post   # post to one channel
//   node scripts/civicmail-digest-once.mjs --all --post --mark            # the Tue/Fri cron path
//
// Flags / env:
//   --channel=ID  (or DIGEST_CHANNEL)  the target channel (required unless --all).
//   --all                               post to every subscribed channel (the cron path).
//   --post                              actually post (default: dry-run prints the briefing).
//   --mark                              stamp this week's mail digested so the next run skips
//                                       it (idempotency). Off by default → demo stays repeatable.
//   --district=N  (or DIGEST_DISTRICT)  geo gate; default = the channel's boundary district.
//   --lang=en|es  (or DIGEST_LANG)      card language; default = the subscription's language.
//   --days=N      (or DIGEST_DAYS)      window length (default 7), anchored to the freshest mail.
//
// Reads the digest queue (listUndigested) — orthogonal to the alert/interrupt queue
// (listPending). The 2026-06-10 backfill is a SAMPLE WEEK (live webhook dormant); the
// card discloses this. Without --mark the run does not drain the queue (repeatable).

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

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : undefined;
}

/** Advance a YYYY-MM-DD string by N days (UTC). */
function addDaysIso(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const POST = process.argv.includes('--post');
// --mark stamps this week's mail digested so the next run skips it (the idempotent
// cron path). Off by default so manual demo runs stay repeatable.
const MARK = process.argv.includes('--mark');
// --all posts to every subscribed channel (the cron path); else a single --channel.
const ALL = process.argv.includes('--all');
const channelId = arg('channel') || process.env.DIGEST_CHANNEL;

const url = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL;
if (!url) {
  console.error('CONVEX_URL missing.');
  process.exit(1);
}
if (!channelId && !ALL) {
  console.error('Target required: --channel=<ID> (or DIGEST_CHANNEL), or --all for every subscription.');
  process.exit(1);
}

const convex = new ConvexHttpClient(url);
const slack = new WebClient(process.env.SLACK_BOT_TOKEN || process.env.SLACK_USER_TOKEN);
const generate = createClaudeGenerate({ schema: DIGEST_BRIEFING_SCHEMA });

/** Render + (post|print) one channel's digest. Returns the count posted (0 or 1). */
async function deliverChannel({ target, notifications, legistarItems, since, until, snapshotNote }) {
  const district = arg('district') ?? process.env.DIGEST_DISTRICT ?? target.boundary?.value ?? null;
  const language = arg('lang') ?? process.env.DIGEST_LANG ?? target.language ?? 'en';

  const aggregate = aggregateCivicMail(notifications, { legistarItems, district, since, until });
  if (aggregate.total === 0) {
    console.log(`  ${target.channelId}: nothing in window — skipped`);
    return 0;
  }

  const briefing = await generateDigestBriefing(aggregate, { generate });
  const card = buildFromTheCityCard({ aggregate, briefing, language, snapshotNote });
  console.log(
    `  ${target.channelId} (${language}${district ? `, d${district}` : ', citywide'}): ` +
      `${aggregate.total} notifications, ${aggregate.suppressed} deduped, ${aggregate.recurringEntities.length} recurring`,
  );

  if (!POST) {
    console.log(`    EN: ${briefing.en.briefing}\n    ES: ${briefing.es.briefing}`);
    return 0;
  }
  await slack.chat.postMessage({ channel: target.channelId, text: card.text, blocks: card.blocks });
  return 1;
}

async function main() {
  const now = new Date().toISOString().slice(0, 10);
  const [notifications, subscriptions, upcoming] = await Promise.all([
    convex.query(api.civicNotifications.listUndigested, {}),
    convex.query(api.subscriptions.listSubscriptions, { client: CLIENT }),
    convex.query(api.detectedItems.listUpcoming, { client: CLIENT, fromDate: now }),
  ]);

  // "This week" = the trailing `--days` (default 7) anchored to the freshest mail in
  // the store. Anchoring to the data (not `now`) means a dormant snapshot still yields
  // its own week, and live mail yields a true rolling week — same code both ways.
  const windowDays = Number(arg('days') ?? process.env.DIGEST_DAYS ?? 7);
  const dates = notifications
    .map((n) => (n.receivedAt ?? '').slice(0, 10))
    .filter(Boolean)
    .sort();
  const until = dates[dates.length - 1] ?? now;
  const since = addDaysIso(until, -(windowDays - 1));
  const snapshotNote = process.env.DIGEST_SNAPSHOT ?? `sample week ${since} → ${until}`;

  // Poller-detected events power the meeting-vs-Legistar dedup (civicmail/dedup.js).
  const legistarItems = upcoming.map((row) => ({ eventId: row.eventId }));

  const targets = ALL ? subscriptions : [subscriptions.find((s) => s.channelId === channelId) ?? { channelId }];

  let posted = 0;
  for (const target of targets) {
    posted += await deliverChannel({ target, notifications, legistarItems, since, until, snapshotNote });
  }

  // Idempotency: stamp this week's mail digested so the next cron skips it. Marks the
  // whole window once (not per-channel) — "this week's mail has been delivered".
  let marked = 0;
  if (POST && MARK) {
    const windowIds = notifications
      .filter((n) => {
        const day = (n.receivedAt ?? '').slice(0, 10);
        return day >= since && day <= until;
      })
      .map((n) => n.messageId);
    marked = await convex.mutation(api.civicNotifications.markDigested, { messageIds: windowIds });
  }

  console.log(
    `[${new Date().toISOString()}] ${CLIENT}: ${targets.length} channel(s), posted ${posted}${MARK ? `, marked ${marked} digested` : ''}.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`[${new Date().toISOString()}] civicmail digest failed:`, err.message);
    process.exit(1);
  });
