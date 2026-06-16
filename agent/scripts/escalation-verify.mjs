#!/usr/bin/env node

// Live verification for MOO-52 (real Legistar; Slack dry-run; no Convex writes).
//   1. Finds a real matter that ALREADY shows a committee "RECOMMENDED FOR
//      ADOPTION/PASSAGE" in its history (proves the detector against reality).
//   2. Runs the sweep with that matter as the only tracked row + a fake
//      subscription matching its committee → shows a real ping card (dry).
//   3. Runs again with the matter in the escalated set → shows it is skipped.
//
// Usage: cd agent && node scripts/escalation-verify.mjs

import { config } from 'dotenv';

config({ path: '.env.local' });
config();

import { escalationCard } from '../blockkit/index.js';
import { detectEscalation, runEscalationSweep } from '../escalation/index.js';
import { createLegistarClient, matterDetailUrl } from '../poller/index.js';

const CLIENT = process.env.POLL_CLIENT || 'milwaukee';
const USER_AGENT =
  'GavelCivicAgent/0.1 (+https://github.com/tmoody1973/gavel-slack-agent; contact tarik@radiomilwaukee.org)';
const legistar = createLegistarClient({ fetch, client: CLIENT, userAgent: USER_AGENT });
const base = `https://webapi.legistar.com/v1/${CLIENT}`;

// Scan recently-modified matters for one genuinely AWAITING the Council vote
// (committee recommended, no Council disposition yet — detectEscalation != null).
async function findRecommendedMatter() {
  const q = new URLSearchParams({ $orderby: 'MatterLastModifiedUtc desc', $top: '40' });
  const matters = await (
    await fetch(`${base}/matters?${q}`, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } })
  ).json();
  for (const m of matters) {
    const esc = detectEscalation(await legistar.getMatterHistory(m.MatterId));
    if (esc) return { matterId: m.MatterId, file: m.MatterFile, committee: esc.committee, date: esc.date };
  }
  throw new Error('No matter currently awaiting a Council vote found in the recent set (timing-dependent).');
}

async function runOnce(tracked, escalatedIds) {
  const posted = [];
  const summary = await runEscalationSweep({
    client: CLIENT,
    detectedSince: 0,
    now: () => Date.now(),
    listTrackedMatters: async () => tracked,
    listEscalatedMatterIds: async () => escalatedIds,
    listSubscriptions: async () => [{ channelId: 'CESCVERIFY', committees: [tracked[0].eventBodyName], keywords: [] }],
    getMatterHistory: (id) => legistar.getMatterHistory(id),
    getMatterMeta: (id) => legistar.getMatter(id),
    matterUrl: (id, guid) => matterDetailUrl(id, guid),
    buildCard: (info, language) => escalationCard({ ...info, language }),
    postCard: async (channel, card) => posted.push({ channel, card }),
    recordEscalation: async () => {},
    languageFor: () => 'en',
  });
  return { posted, summary };
}

async function main() {
  const target = await findRecommendedMatter();
  console.log(
    `\n[1] Real matter ${target.matterId} (File #${target.file}) — committee "${target.committee}" recommended on ${target.date}.`,
  );

  const tracked = [
    { matterId: target.matterId, title: '(real)', eventBodyName: target.committee, detectedAt: Date.now() },
  ];

  const run1 = await runOnce(tracked, []);
  console.log(`\n[2] Sweep → detected=${run1.summary.detected}, pinged=${run1.summary.pinged}.`);
  if (run1.summary.pinged !== 1) throw new Error('Expected exactly one ping for the recommended matter.');
  console.log(`    Ping card:\n${JSON.stringify(run1.posted[0].card.blocks, null, 2)}`);

  const run2 = await runOnce(tracked, [target.matterId]);
  console.log(`\n[3] Re-run with matter already escalated → pinged=${run2.summary.pinged} (expected 0).`);
  if (run2.summary.pinged !== 0) throw new Error('Idempotency FAILED: re-ping for an escalated matter.');

  console.log('\n✅ Escalation detector + idempotency verified against real Legistar data.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('VERIFY FAILED:', err.message);
    process.exit(1);
  });
