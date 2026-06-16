// MOO-55 retrieval eval (Task 10). For each question in eval-questions.json,
// embed it, run the real Convex family-filtered vector search, and check whether
// the expected code section is in the retrieved top-k. Reports recall.
// Run: node scripts/zoning-eval.mjs [path-to-eval-questions.json]
import { readFile } from 'node:fs/promises';
import { ConvexHttpClient } from 'convex/browser';
import { config } from 'dotenv';

import { api } from '../convex/_generated/api.js';
import { embedQuery } from '../zoning/embed.js';

config({ path: '.env.local' });

const EVAL_PATH = process.argv[2] ?? new URL('zoning-eval-questions.json', import.meta.url).pathname;
const LIMIT = 8;
const baseSection = (ref) => ref.match(/^295-\d+/)?.[0] ?? ref;

/** Derive the code family from a section number, mirroring the subchapter layout,
 * so each question is searched with the family that makes its section eligible
 * (in production this family comes from the parcel address). null = not Ch.295. */
function familyOf(ref) {
  const n = Number(ref.match(/^295-(\d+)/)?.[1]);
  if (!n) return null;
  if (n < 500) return 'general';
  if (n < 600) return 'residential';
  if (n < 700) return 'commercial';
  if (n < 800) return 'downtown';
  if (n < 900) return 'industrial';
  if (n < 1000) return 'special';
  return 'overlay';
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  const convex = new ConvexHttpClient(process.env.CONVEX_URL);
  const questions = JSON.parse(await readFile(EVAL_PATH, 'utf8'));

  let inScope = 0;
  let hits = 0;
  let requiredTotal = 0;
  let requiredHits = 0;
  let skipped = 0;
  for (const q of questions) {
    const expected = (q.expectedSectionRefs ?? []).map(baseSection);
    const family = expected.map(familyOf).find(Boolean);
    if (!family) {
      skipped++;
      console.log(`⏭️  [non-295, out of scope] ${q.question.slice(0, 60)} (expect ${expected.join(',')})`);
      continue;
    }
    inScope++;
    const embedding = await embedQuery(q.question, { apiKey });
    const results = await convex.action(api.zoning.search, { embedding, family, limit: LIMIT });
    const retrieved = results.map((r) => r.section);
    const hit = expected.some((b) => retrieved.includes(b));
    if (hit) hits++;
    if (q.required) {
      requiredTotal++;
      if (hit) requiredHits++;
    }
    console.log(`${hit ? '✅' : '❌'} ${q.required ? '[req] ' : '      '}${q.question.slice(0, 64)}`);
    console.log(`     expect ${expected.join(',')} (${family}) | top: ${retrieved.slice(0, 5).join(', ')}`);
  }
  console.log(
    `\nRecall: ${hits}/${inScope} in-scope Ch.295 · ${requiredHits}/${requiredTotal} required · ${skipped} skipped (non-295)`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
