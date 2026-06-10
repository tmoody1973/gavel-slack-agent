#!/usr/bin/env node

// MOO-74 live verification: assemble the real HomeState through the exact
// deps prod uses (real Convex, real Slack names, real Legistar bodies), print
// it, and reconcile the strip counts against the raw rows. The deployed
// app_home_opened path is then verified by a human opening the Home tab.
//
// Run: node scripts/moo-74-verify.mjs   (from agent/)

import { WebClient } from '@slack/web-api';
import { config } from 'dotenv';

config({ path: '.env.local' });
config();

import { matchSubscriptions } from '../alerts/match.js';
import { homeView } from '../blockkit/index.js';
import { createHomeDeps } from '../home/deps.js';
import { buildHomeState } from '../home/state.js';

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
const deps = createHomeDeps(slack);

const state = await buildHomeState(deps);
console.log('HomeState:');
console.log(JSON.stringify(state, null, 2));

// Reconcile the strip against raw rows, independently of state.js
const [subs, upcoming, watches] = await Promise.all([
  deps.listSubscriptions(),
  deps.listUpcoming(),
  deps.listAllWatches(),
]);
const relevant = upcoming.filter((row) => matchSubscriptions(row, subs).length > 0);
const expected = {
  meetings: new Set(relevant.map((r) => r.eventId)).size,
  lateAdds: relevant.filter((r) => r.walkOnFlag).length,
  watchHits: upcoming.filter((r) => watches.some((w) => r.title.toLowerCase().includes(w.entity.toLowerCase()))).length,
};
console.log(`\nReconciliation (raw rows: ${upcoming.length} upcoming, ${subs.length} subscriptions, ${watches.length} watches):`);
console.log(`  expected strip: ${JSON.stringify(expected)}`);
console.log(`  state strip:    ${JSON.stringify(state.strip)}`);
console.log(`  match: ${JSON.stringify(expected) === JSON.stringify(state.strip) ? '✅' : '❌ MISMATCH'}`);

// The committee typeahead's source, live
const names = await deps.listCommitteeNames();
console.log(`\nCommittee typeahead source: ${names.length} active bodies (e.g. ${names.filter((n) => n.includes('ZONING')).join(' · ')})`);

// Render the view to prove block validity end-to-end (Slack validates on publish)
const view = homeView(state);
console.log(`\nhomeView renders ${view.blocks.length} blocks — publishing happens on app_home_opened (human check).`);
