#!/usr/bin/env node

// MOO-45 verification: exercise the subscription CRUD against a real Convex
// deployment and show a real row driving an alert's target + language. Also
// proves the minimal-PII guardrail — junk fields never persist.
//
// Prereq: `npx convex dev` (logs in, creates the deployment, codegens
// convex/_generated, writes CONVEX_URL to .env.local). Then:
//   node scripts/subscriptions-verify.mjs

import { ConvexHttpClient } from 'convex/browser';
import { config } from 'dotenv';

// Convex writes CONVEX_URL to .env.local; .env holds the Anthropic key. Load
// .env.local first — dotenv does not override already-set vars.
config({ path: '.env.local' });
config();

import { api } from '../convex/_generated/api.js';

const url = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL;
if (!url) {
  console.error('CONVEX_URL missing — run `npx convex dev` first to create the deployment.');
  process.exit(1);
}

const client = new ConvexHttpClient(url);
const CHANNEL = 'C_GAVEL_VERIFY';

const ALLOWED_FIELDS = ['channelId', 'client', 'committees', 'keywords', 'language', 'boundary'];

async function main() {
  // CREATE — with deliberate junk fields that must be stripped.
  await client
    .mutation(api.subscriptions.upsertSubscription, {
      channelId: CHANNEL,
      committees: ['ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE'],
      keywords: ['rezoning', 'demolition'],
      // @ts-expect-error — junk the validator/normalizer must reject (PII guard)
      userId: 'U_SHOULD_NOT_PERSIST',
      messageText: 'a private slack message that must never be stored',
    })
    .catch((e) => {
      // The arg validator rejects unknown fields — that is itself the PII guard.
      console.log('upsert rejected unknown fields at the validator boundary:', e.message.split('\n')[0]);
      return client.mutation(api.subscriptions.upsertSubscription, {
        channelId: CHANNEL,
        committees: ['ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE'],
        keywords: ['rezoning', 'demolition'],
      });
    });

  // READ — show what an alert would target + the language it'd be written in.
  const created = await client.query(api.subscriptions.getSubscription, { channelId: CHANNEL });
  console.log('\nCREATED ROW:', JSON.stringify(created, null, 2));
  const storedKeys = Object.keys(created).filter((k) => !k.startsWith('_') && k !== 'createdAt' && k !== 'updatedAt');
  const leaked = storedKeys.filter((k) => !ALLOWED_FIELDS.includes(k));
  console.log(
    `\nPII GUARD: stored fields = [${storedKeys.join(', ')}] → leaked: ${leaked.length ? leaked.join(', ') : 'NONE ✓'}`,
  );
  console.log(
    `DRIVES ALERT → post to channel ${created.channelId} in language "${created.language}" for committees ${JSON.stringify(created.committees)}`,
  );

  // UPDATE — flip to Spanish and show the alert target changes language.
  await client.mutation(api.subscriptions.setLanguage, { channelId: CHANNEL, language: 'es' });
  const updated = await client.query(api.subscriptions.getSubscription, { channelId: CHANNEL });
  console.log(`\nAFTER setLanguage('es') → post to ${updated.channelId} in language "${updated.language}"`);

  // Cleanup so the verify row doesn't linger.
  await client.mutation(api.subscriptions.removeSubscription, { channelId: CHANNEL });
  const gone = await client.query(api.subscriptions.getSubscription, { channelId: CHANNEL });
  console.log(`\nCLEANUP: row after remove = ${gone === null ? 'null ✓' : 'STILL PRESENT'}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
