#!/usr/bin/env node
// MOO-42 verification: run the summarizer on real Milwaukee Legistar matters
// with the real Claude client. Proves output quality (the part unit tests
// can't): plain-English ≤80-word summaries, correct address extraction, and
// sane handling of sparse matters without hallucination.
//
// Usage: node scripts/summarize-verify.mjs
// Requires ANTHROPIC_API_KEY in agent/.env.

import 'dotenv/config';

import { createClaudeGenerate, MAX_SUMMARY_WORDS, summarizeMatter } from '../summarizer/index.js';

const LEGISTAR = 'https://webapi.legistar.com/v1/milwaukee';
const UA = 'GavelCivicAgent/0.1 (Milwaukee neighborhood transparency; contact tarik@radiomilwaukee.org)';

// Curated for coverage: address-bearing land-use, address-bearing code appeal,
// a no-address communication, and a sparse procedural item (hallucination bait).
const MATTER_IDS = [73730, 74136, 74148, 74143];

async function legistar(path) {
  const res = await fetch(`${LEGISTAR}${path}`, { headers: { 'User-Agent': UA } });
  if (!res.ok) {
    throw new Error(`Legistar ${path} → ${res.status}`);
  }
  return res.json();
}

/** Fetch one matter and map it into the summarizer's input shape. */
async function fetchMatter(id) {
  const matter = await legistar(`/matters/${id}`);
  const texts = await legistar(`/matters/${id}/texts`).catch(() => []);
  const matterText = (Array.isArray(texts) && texts[0]?.MatterTextPlain) || '';
  return {
    fileNumber: matter.MatterFile ?? String(id),
    title: matter.MatterTitle ?? matter.MatterName ?? '',
    matterText,
    attachments: [],
  };
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY missing — add it to agent/.env');
    process.exit(1);
  }
  const generate = createClaudeGenerate();

  for (const id of MATTER_IDS) {
    const matter = await fetchMatter(id);
    const result = await summarizeMatter(matter, { generate });

    console.log('═'.repeat(80));
    console.log(`FILE ${matter.fileNumber}  (MatterId ${id})   sourcesUsed=${result.sourcesUsed.join('+')}`);
    console.log('─ INPUT (title) ─────────────────────────────────────────────────');
    console.log(matter.title);
    if (matter.matterText) {
      console.log('─ INPUT (matterText, first 400) ─');
      console.log(matter.matterText.replace(/\s+/g, ' ').slice(0, 400));
    }
    console.log('─ OUTPUT ────────────────────────────────────────────────────────');
    const overBudget = result.wordCount > MAX_SUMMARY_WORDS ? '  ⚠️ OVER BUDGET' : '';
    console.log(`summary (${result.wordCount}w/${MAX_SUMMARY_WORDS}${overBudget}): ${result.summary}`);
    console.log(`whyItMatters: ${result.whyItMatters}`);
    console.log(`addresses: ${JSON.stringify(result.addresses)}`);
    console.log();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
