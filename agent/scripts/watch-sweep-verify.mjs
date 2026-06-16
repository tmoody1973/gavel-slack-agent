#!/usr/bin/env node

// Live verification for MOO-53 (real Legistar + Convex; Slack is dry-run; the
// permit path is exercised separately in the cron script's dry-run). Proves the
// acceptance checklist against reality:
//   1. Pulls real recent matters, picks one, derives a watch term from its title.
//   2. Seeds a watch in a throwaway channel, runs the sweep → shows the hit and
//      records it.
//   3. Runs the sweep again → the dedup ledger suppresses a second hit (idempotency).
//   4. Cleans up the ledger row.
//
// Usage: cd agent && node scripts/watch-sweep-verify.mjs

import { ConvexHttpClient } from 'convex/browser';
import { config } from 'dotenv';

config({ path: '.env.local' });
config();

import { watchCard } from '../blockkit/index.js';
import { api } from '../convex/_generated/api.js';
import { createLegistarClient } from '../poller/index.js';
import { runWatchSweep } from '../watch/index.js';

const CLIENT = process.env.POLL_CLIENT || 'milwaukee';
const USER_AGENT =
  'GavelCivicAgent/0.1 (+https://github.com/tmoody1973/gavel-slack-agent; contact tarik@radiomilwaukee.org)';
const CHANNEL = 'CWATCHVERIFY';

const convex = new ConvexHttpClient(process.env.CONVEX_URL);
const legistar = createLegistarClient({ fetch, client: CLIENT, userAgent: USER_AGENT });

/** Pick a distinctive multi-word token from a real matter title to watch. */
function watchTermFrom(title) {
  const stop = new Set(['the', 'and', 'for', 'from', 'with', 'an', 'of', 'to', 'in', 'on', 'at', 'a']);
  const words = title.split(/\s+/).filter((w) => /^[A-Za-z]{4,}$/.test(w) && !stop.has(w.toLowerCase()));
  return words.slice(0, 2).join(' ') || title.slice(0, 12);
}

async function runOnce(watches, recordingOn) {
  const recorded = [];
  const posted = [];
  await runWatchSweep({
    watches,
    lookbackDays: 30,
    sinceDate: '2000-01-01',
    now: () => Date.now(),
    fetchRecentMatters: (d) => legistar.fetchRecentMatters(d),
    resolvePermitHits: async () => [], // matters-only for the deterministic proof
    listAlertedKeys: () => convex.query(api.watchAlerts.listAlertedKeys, {}),
    buildCard: (hits, language) => watchCard({ hits, language }),
    postCard: async (channelId, card) => posted.push({ channelId, card }),
    recordAlerts: (alerts) => {
      recorded.push(...alerts);
      return recordingOn ? convex.mutation(api.watchAlerts.recordAlerts, { alerts }) : Promise.resolve(0);
    },
    languageFor: () => 'en',
  });
  return { recorded, posted };
}

async function main() {
  const matters = await legistar.fetchRecentMatters(30);
  if (!matters.length) throw new Error('No recent matters in the last 30 days to verify against.');
  const target = matters.find((m) => m.title && m.title.length > 12) || matters[0];
  const term = watchTermFrom(target.title);
  console.log(`\n[1] Real matter #${target.matterId} (File #${target.file}): "${target.title}"`);
  console.log(`    → derived watch term: "${term}"`);

  const watches = [{ channelId: CHANNEL, entity: term, client: CLIENT }];

  // Clean any stale ledger row from a prior verify, then run #1 (records hits).
  await convex.mutation(api.watchAlerts.removeAlert, {
    channelId: CHANNEL,
    entity: term,
    kind: 'matter',
    refId: String(target.matterId),
  });
  const run1 = await runOnce(watches, true);
  console.log(`\n[2] Sweep run #1 → ${run1.recorded.length} hit(s), ${run1.posted.length} card(s) posted (dry).`);
  if (!run1.recorded.some((r) => r.refId === String(target.matterId))) {
    throw new Error('Expected the seeded watch to match its source matter on run #1.');
  }
  console.log(`    Card preview:\n${JSON.stringify(run1.posted[0]?.card.blocks, null, 2)}`);

  // Run #2: the ledger now contains run #1's hits → no fresh hit (idempotency).
  const run2 = await runOnce(watches, false);
  console.log(`\n[3] Sweep run #2 → ${run2.recorded.length} fresh hit(s) (expected 0 — dedup ledger).`);
  if (run2.recorded.length !== 0) throw new Error('Idempotency FAILED: run #2 produced fresh hits.');

  // Cleanup.
  await convex.mutation(api.watchAlerts.removeAlert, {
    channelId: CHANNEL,
    entity: term,
    kind: 'matter',
    refId: String(target.matterId),
  });
  console.log('\n[4] Cleaned up ledger row. ✅ Matters path verified against real Legistar data.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('VERIFY FAILED:', err.message);
    process.exit(1);
  });
