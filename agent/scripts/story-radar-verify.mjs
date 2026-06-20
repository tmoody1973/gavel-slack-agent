#!/usr/bin/env node

// Live verification for MOO-127 Story Radar. Runs the REAL pipeline against this
// week's actual agenda: live Convex (listUpcoming) → newsworthiness ranking →
// real Legistar enrichment → real Claude angles. Prints ranked leads + the matter
// text each angle was grounded in, so the angles can be spot-checked for fabrication.
//
//   node scripts/story-radar-verify.mjs [committee|topic]
//
// Read-only: no writes to Convex, Slack, or Legistar.

import { ConvexHttpClient } from 'convex/browser';
import { config } from 'dotenv';

config({ path: '.env.local' });
config();

import { enrichForAlert } from '../alerts/enrich.js';
import { api } from '../convex/_generated/api.js';
import { createLegistarClient } from '../poller/legistar.js';
import { STORY_ANGLE_SCHEMA } from '../stories/angle.js';
import { composeLeadAngles, filterByCommitteeOrTopic, selectStoryLeads } from '../stories/leads.js';
import { scoreNewsworthiness } from '../stories/newsworthiness.js';
import { createClaudeGenerate } from '../summarizer/index.js';

const arg = process.argv.slice(2).join(' ').trim();
const TOP_N = 5;

const convex = new ConvexHttpClient(process.env.CONVEX_URL);
const legistar = createLegistarClient({
  fetch: globalThis.fetch,
  client: 'milwaukee',
  userAgent: 'gavel-slack-agent (tarik@radiomilwaukee.org)',
});
const generate = createClaudeGenerate({ schema: STORY_ANGLE_SCHEMA });

const tags = (lead) => lead.tags.map((t) => (t.detail ? `${t.kind}:${t.detail}` : t.kind)).join(', ');

async function main() {
  const fromDate = new Date().toISOString().slice(0, 10);
  const upcoming = await convex.query(api.detectedItems.listUpcoming, { fromDate });
  console.log(`\n📅 Upcoming agenda from ${fromDate}: ${upcoming.length} detected items`);

  const { items, label } = filterByCommitteeOrTopic(upcoming, arg);
  console.log(`🔎 Filter: "${arg || '(whole agenda)'}" → ${items.length} items · label="${label}"`);

  // How many of the full agenda earn any tag (the journalist-lens funnel).
  const tagged = upcoming.filter((i) => scoreNewsworthiness(i).score > 0);
  const anomalies = upcoming.filter((i) => i.walkOnFlag || i.consentFlag);
  console.log(
    `🏷  ${tagged.length}/${upcoming.length} items earn ≥1 newsworthiness tag · ${anomalies.length} process anomalies (walk-on/consent)`,
  );

  const leads = selectStoryLeads(items, { cap: TOP_N });
  console.log('\n=== 📰 Ranked story leads (tags-only, App Home view) ===');
  for (const [i, lead] of leads.entries()) {
    console.log(`\n${i + 1}. [score ${lead.score}] ${lead.item.title}`);
    console.log(`   🏛 ${lead.item.eventBodyName} · ${lead.item.eventDate} · eventItemId=${lead.item.eventItemId}`);
    console.log(`   🏷 ${tags(lead)}`);
  }

  if (leads.length === 0) {
    console.log('\n(no leads — quiet week for this filter)');
    return;
  }

  console.log(
    `\n=== 💡 Grounded angles for the top ${Math.min(TOP_N, leads.length)} (real Legistar + real Claude) ===`,
  );
  const composed = await composeLeadAngles(leads, {
    enrich: (item) => enrichForAlert(item, legistar),
    generate,
    members: await convex.query(api.councilMembers.listMembers, {}),
    countTranscript: (eventId) => convex.query(api.transcripts.countByEvent, { eventId }),
  });

  for (const [i, lead] of composed.entries()) {
    console.log(`\n${i + 1}. ${lead.item.title}`);
    console.log(
      `   🏷 ${tags(lead)}${lead.fileNumber ? ` · File #${lead.fileNumber}` : ''}${lead.member ? ` · sponsor ${lead.member.name}` : ''}${lead.hasTranscript ? ' · 🎙 transcript available' : ''}`,
    );
    if (lead.angle) {
      console.log(`   💡 HOOK: ${lead.angle.hook}`);
      console.log(`   ❓ WHY:  ${lead.angle.whyStory}`);
    } else {
      console.log('   ⚠️ angle generation failed (degraded — title+tags still render)');
    }
    const body = (lead.matter?.matterText ?? '').trim().slice(0, 280);
    console.log(`   📄 RECORD (for grounding spot-check): ${body || '(title only — thin record)'}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('❌', e);
    process.exit(1);
  });
