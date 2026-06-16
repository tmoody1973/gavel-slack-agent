// MOO-55 end-to-end verify: real address → check_zoning → family → live OpenAI
// embed → Convex vector search → cited sections, via the same runZoningAnswer
// the ask_zoning_code tool uses. Proves the full chain against reality.
import { ConvexHttpClient } from 'convex/browser';
import { config } from 'dotenv';

import { createParcelClient } from '../../mcp-server/src/parcel.js';
import { runZoningAnswer } from '../agent/zoning/search.js';
import { api } from '../convex/_generated/api.js';
import { embedQuery } from '../zoning/embed.js';
import { zoningClassToFamily } from '../zoning/family.js';

config({ path: '.env.local' });

const apiKey = process.env.OPENAI_API_KEY;
const convex = new ConvexHttpClient(process.env.CONVEX_URL);
const parcel = createParcelClient({
  fetch: globalThis.fetch,
  userAgent: 'gavel-slack-agent (tarik@radiomilwaukee.org)',
});

const deps = {
  resolveZoning: (address) => parcel.checkZoning(address),
  classToFamily: zoningClassToFamily,
  embedQuery: (text) => embedQuery(text, { apiKey }),
  search: ({ embedding, family }) => convex.action(api.zoning.search, { embedding, family }),
};

const cases = [
  { address: '2000 S 13th St', question: 'Can I build a two-family dwelling (duplex) on this lot?' },
  // ES: the agent translates to EN for retrieval; here we pass an EN retrieval
  // query (what the agent would send) to confirm the chain, then note the answer
  // would be composed in Spanish by Claude.
  { address: '2000 S 13th St', question: 'parking requirements for a multifamily building' },
];

for (const c of cases) {
  console.log(`\n===== ${c.address} — "${c.question}" =====`);
  const text = await runZoningAnswer(c, deps);
  const sections = [...text.matchAll(/§(295-\d+)/g)].map((m) => m[1]);
  console.log(text.slice(0, 700));
  console.log(`... [cited sections in payload: ${[...new Set(sections)].join(', ') || 'none'}]`);
}
