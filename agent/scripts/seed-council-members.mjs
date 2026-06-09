#!/usr/bin/env node
// MOO-72: seed the Convex council-member directory from the repo-committed
// JSON (public city.milwaukee.gov data). Idempotent — re-running upserts by
// client+district, so the count stays at the directory size.
//
//   node scripts/seed-council-members.mjs
import { readFileSync } from 'node:fs';

import { config } from 'dotenv';

config({ path: ['.env.local', '.env'] });

import { ConvexHttpClient } from 'convex/browser';

import { lastNameKey } from '../alerts/council.js';
import { api } from '../convex/_generated/api.js';

const url = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL;
if (!url) {
  console.error('CONVEX_URL missing — run `npx convex dev` first.');
  process.exit(1);
}

const members = JSON.parse(readFileSync(new URL('../data/milwaukee-council-members.json', import.meta.url), 'utf8'));
const convex = new ConvexHttpClient(url);

for (const member of members) {
  await convex.mutation(api.councilMembers.upsertMember, {
    district: member.district,
    name: member.name,
    nameKey: lastNameKey(member.name),
    title: member.title,
    imageUrl: member.image_url,
    email: member.email,
    phone: member.phone_number,
    webpage: member.webpage,
  });
}

const stored = await convex.query(api.councilMembers.listMembers, {});
console.log(`Seeded ${members.length} members; directory now holds ${stored.length} rows.`);
if (stored.length !== members.length) {
  console.error('Row count does not match the source file — investigate duplicates.');
  process.exit(1);
}
