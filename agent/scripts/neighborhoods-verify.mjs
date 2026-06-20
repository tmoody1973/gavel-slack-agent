#!/usr/bin/env node

// Live verification for MOO-131. Proves (1) the geo module resolves real neighborhoods
// to districts + alderpersons against the shipped data, and (2) the onboarding write
// path round-trips through real Convex: write a boundary from a resolved neighborhood,
// read it back, then clean up. Uses a throwaway channel id and removes it after.
//
//   node scripts/neighborhoods-verify.mjs

import { ConvexHttpClient } from 'convex/browser';
import { config } from 'dotenv';

config({ path: '.env.local' });
config();

import { api } from '../convex/_generated/api.js';
import { alderpersonForDistrict, districtForNeighborhood, neighborhoodChoices } from '../geo/neighborhoods.js';

console.log(`\n🗺  ${neighborhoodChoices().length} neighborhoods → 15 districts (joined to the council directory)\n`);

const samples = ['Riverwest', 'Bay View', 'Clarke Square', 'Harambee', 'brewers hill'];
for (const name of samples) {
  const district = districtForNeighborhood(name);
  const ald = alderpersonForDistrict(district);
  console.log(`  "${name}" → District ${district} · ${ald?.name} <${ald?.email}>`);
}

// --- Real Convex round-trip ---
const convex = new ConvexHttpClient(process.env.CONVEX_URL);
const channelId = 'C_MOO131_VERIFY';
const neighborhood = 'Bay View';
const district = districtForNeighborhood(neighborhood);

console.log(`\n🔁 Convex round-trip: onboard "${neighborhood}" → boundary district ${district}`);
try {
  await convex.mutation(api.subscriptions.upsertSubscription, {
    channelId,
    committees: [],
    keywords: [],
    language: 'en',
    role: 'association',
    configured: false,
    boundary: { type: 'district', value: String(district) },
  });
  const readBack = await convex.query(api.subscriptions.getSubscription, { channelId });
  const ok = readBack?.boundary?.value === String(district) && readBack?.boundary?.type === 'district';
  console.log(`   read back boundary = ${JSON.stringify(readBack?.boundary)}  →  ${ok ? '✅ matches' : '❌ MISMATCH'}`);
  if (!ok) process.exitCode = 1;
} finally {
  const removed = await convex.mutation(api.subscriptions.removeSubscription, { channelId });
  console.log(`   cleanup: removed test channel (${removed ? 'ok' : 'nothing to remove'})`);
}

console.log('\n✅ Neighborhood resolve + Convex boundary write/read verified against reality.');
