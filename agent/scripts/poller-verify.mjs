#!/usr/bin/env node

// MOO-41 verification: poll REAL Milwaukee Legistar, diff against REAL Convex,
// and prove the acceptance criteria —
//   (1) cold run detects genuinely-new Final agenda items,
//   (2) an immediate re-run detects ZERO (idempotent diff),
//   (3) detection latency = detectedAt - EventAgendaLastPublishedUTC.
// Repeatable: it resets the rows it is about to test, then cleans them up.
//
// Prereq: `npx convex dev` (writes CONVEX_URL to .env.local). Then:
//   node scripts/poller-verify.mjs

import { ConvexHttpClient } from 'convex/browser';
import { config } from 'dotenv';

config({ path: '.env.local' });
config();

import { api } from '../convex/_generated/api.js';
import { createLegistarClient, runPoll, toDetectedItem } from '../poller/index.js';

const url = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL;
if (!url) {
  console.error('CONVEX_URL missing — run `npx convex dev` first.');
  process.exit(1);
}

const CLIENT = 'milwaukee';
const USER_AGENT =
  'GavelCivicAgent/0.1 (+https://github.com/tmoody1973/gavel-slack-agent; contact tarik@radiomilwaukee.org)';

const convex = new ConvexHttpClient(url);
const legistar = createLegistarClient({ fetch, client: CLIENT, userAgent: USER_AGENT });

const deps = {
  client: CLIENT,
  fetchUpcomingFinalEvents: () => legistar.fetchUpcomingFinalEvents(),
  fetchEventItems: (id) => legistar.fetchEventItems(id),
  readSeenEventItemIds: (client) => convex.query(api.detectedItems.listSeenKeys, { client }),
  enqueueDetected: (items) => convex.mutation(api.detectedItems.enqueueDetected, { items }),
};

async function currentLiveRows() {
  const events = await legistar.fetchUpcomingFinalEvents();
  const rows = [];
  for (const event of events) {
    const items = await legistar.fetchEventItems(event.eventId);
    for (const item of items) rows.push(toDetectedItem(CLIENT, event, item));
  }
  return rows;
}

async function main() {
  console.log(`\n=== MOO-41 poller verify — ${CLIENT} — ${new Date().toISOString()} ===`);

  const live = await currentLiveRows();
  console.log(`Live Final agenda items in the next 7 days: ${live.length}`);
  if (live.length === 0) {
    console.log('No Final agendas posted in the window right now — re-run when the city posts one.');
    return;
  }

  // Reset only the rows we are about to test, so detection is reproducible.
  for (const r of live) {
    await convex.mutation(api.detectedItems.removeDetected, { client: CLIENT, eventItemId: r.eventItemId });
  }

  // RUN 1 (cold) — must detect every live item.
  const run1 = await runPoll(deps);
  console.log(`\nRUN 1 (cold): fetched ${run1.fetchedCount}, detected ${run1.newItems.length} NEW`);
  const now = Date.now();
  for (const item of run1.newItems.slice(0, 10)) {
    const latency = item.agendaPublishedUTC
      ? `${Math.round((now - Date.parse(item.agendaPublishedUTC)) / 60000)} min since agenda published`
      : 'no agendaPublishedUTC';
    console.log(
      `  • [${item.eventBodyName}] item ${item.agendaNumber ?? '?'} (EventItemId ${item.eventItemId}) — ${item.title.slice(0, 80)}  [${latency}]`,
    );
  }

  // RUN 2 (immediate) — must detect ZERO (idempotent diff).
  const run2 = await runPoll(deps);
  console.log(`\nRUN 2 (immediate re-run): fetched ${run2.fetchedCount}, detected ${run2.newItems.length} NEW`);
  console.log(
    run2.newItems.length === 0 ? 'IDEMPOTENT ✓ — no duplicate detections' : 'NOT IDEMPOTENT ✗ — investigate',
  );

  // Latency headline: freshest agenda in the batch.
  const published = run1.newItems
    .map((i) => i.agendaPublishedUTC)
    .filter(Boolean)
    .map((t) => Date.parse(t));
  if (published.length) {
    const freshest = Math.max(...published);
    console.log(
      `\nLATENCY: most-recently-published agenda was ${Math.round((now - freshest) / 60000)} min before detection (target < 20 min on a live post).`,
    );
  }

  // CLEANUP — remove the rows this run inserted so it stays repeatable.
  for (const r of live) {
    await convex.mutation(api.detectedItems.removeDetected, { client: CLIENT, eventItemId: r.eventItemId });
  }
  console.log('\nCLEANUP: test rows removed. (Real cron leaves rows in place — they ARE the ledger.)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
