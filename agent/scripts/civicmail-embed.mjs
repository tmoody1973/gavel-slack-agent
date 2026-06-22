#!/usr/bin/env node

// Embed civicNotifications for semantic search (MOO-153). Computes a 1536-dim OpenAI
// embedding of each row's searchText (subject + body + extracted attachment/OCR text)
// and stores it, populating the dormant `by_embedding` vector index so `/gavel search`
// can match by meaning, not just keywords. Idempotent: re-running re-embeds.
//
//   node scripts/civicmail-embed.mjs

import { ConvexHttpClient } from 'convex/browser';
import { config } from 'dotenv';

config({ path: '.env.local' });
config();

import { api } from '../convex/_generated/api.js';
import { embedTexts } from '../zoning/embed.js';

const BATCH = 50;
const convex = new ConvexHttpClient(process.env.CONVEX_URL);

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY missing');

  const rows = await convex.query(api.civicNotifications.listPending, {});
  console.log(`Embedding ${rows.length} notifications (text-embedding-3-small, 1536-dim)…`);

  let embedded = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const vectors = await embedTexts(
      batch.map((row) => row.searchText || row.subject || ''),
      { apiKey },
    );
    for (let j = 0; j < batch.length; j++) {
      await convex.mutation(api.civicNotifications.setEmbedding, {
        messageId: batch[j].messageId,
        embedding: vectors[j],
      });
      embedded += 1;
    }
    console.log(`  …${embedded}/${rows.length}`);
  }
  console.log(`\nDone: embedded ${embedded} rows.`);
}

main().catch((err) => {
  console.error('civicmail-embed FAILED:', err.message);
  process.exitCode = 1;
});
