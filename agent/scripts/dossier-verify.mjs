#!/usr/bin/env node

// Live verification for MOO-129 reporter dossier. Assembles a real dossier for a top story lead
// (real Legistar enrich + history + outcome + Claude angle + transcript-moment vector search) and
// renders the modal; then proves the 🎥 receipt path against an already-ingested meeting.
//
//   node scripts/dossier-verify.mjs

import { ConvexHttpClient } from 'convex/browser';
import { config } from 'dotenv';

config({ path: '.env.local' });
config();

import { enrichForAlert } from '../alerts/enrich.js';
import { dossierModal } from '../blockkit/dossier-modal.js';
import { api } from '../convex/_generated/api.js';
import { createLegistarClient } from '../poller/legistar.js';
import { STORY_ANGLE_SCHEMA } from '../stories/angle.js';
import { assembleDossier, findMatterMoment } from '../stories/dossier.js';
import { selectStoryLeads } from '../stories/leads.js';
import { createClaudeGenerate } from '../summarizer/index.js';
import { embedQuery } from '../zoning/embed.js';

const convex = new ConvexHttpClient(process.env.CONVEX_URL);
const legistar = createLegistarClient({
  fetch,
  client: 'milwaukee',
  userAgent: 'gavel-dossier-verify (tarik@radiomilwaukee.org)',
});

const deps = {
  enrich: (item) => enrichForAlert(item, legistar),
  listMembers: () => convex.query(api.councilMembers.listMembers, { client: 'milwaukee' }),
  getMatterHistory: (matterId) => legistar.getMatterHistory(matterId),
  getOutcomes: (matterId) => convex.query(api.outcomes.byMatter, { matterId }),
  searchMoment: (item) =>
    findMatterMoment(item, {
      embedQuery: (text) => embedQuery(text, { apiKey: process.env.OPENAI_API_KEY }),
      search: (query) => convex.action(api.transcripts.search, query),
    }),
  generate: createClaudeGenerate({ schema: STORY_ANGLE_SCHEMA }),
  language: 'en',
};

const has = (v) => (v ? '✅' : '— ');

async function main() {
  const fromDate = new Date().toISOString().slice(0, 10);
  const upcoming = await convex.query(api.detectedItems.listUpcoming, { client: 'milwaukee', fromDate });
  const leads = selectStoryLeads(upcoming, { cap: 5 });
  console.log(`\n📰 ${upcoming.length} upcoming · ${leads.length} story leads\n`);

  // ---- Part 1: assemble a real dossier for the top lead ----
  const lead = leads[0];
  if (!lead) {
    console.log('No story leads right now — skipping the assembled-dossier render.');
  } else {
    const item = { ...lead.item, tags: lead.tags };
    console.log(`=== Dossier for eventItemId ${item.eventItemId}: ${(item.title || '').slice(0, 80)} ===`);
    const dossier = await assembleDossier(item, deps);
    console.log(`  ${has(dossier.angle)} angle      ${dossier.angle ? `→ ${dossier.angle.hook}` : ''}`);
    console.log(
      `  ${has(dossier.member)} sponsor    ${dossier.member ? `→ ${dossier.member.name}` : dossier.sponsorName ? `→ ${dossier.sponsorName} (no contact)` : ''}`,
    );
    console.log(`  ${has(dossier.history?.length)} history    → ${dossier.history?.length ?? 0} actions`);
    console.log(
      `  ${has(dossier.moment)} video      ${dossier.moment ? `→ clip ${dossier.moment.eventMedia} @ ${dossier.moment.startTime}s` : '→ not discussed on the webcast yet'}`,
    );
    console.log(
      `  ${has(dossier.outcome)} outcome    ${dossier.outcome ? `→ ${dossier.outcome.actionName}` : '→ no vote yet (upcoming)'}`,
    );
    const view = dossierModal(dossier, { language: 'en' });
    console.log(`  🪟 modal: ${view.blocks.length} blocks (≤100), callback_id=${view.callback_id}`);
  }

  // ---- Part 2: prove the 🎥 receipt against an ingested meeting (13441 ZONING / Hopkins St sale) ----
  console.log('\n=== 🎥 receipt path — a matter discussed in an ingested meeting ===');
  const moment = await findMatterMoment(
    {
      title:
        'A substitute resolution authorizing the sale of the City-owned property at 2409-11 West Hopkins Street to the former owners',
    },
    {
      embedQuery: (text) => embedQuery(text, { apiKey: process.env.OPENAI_API_KEY }),
      search: (query) => convex.action(api.transcripts.search, query),
    },
  );
  if (moment) {
    console.log(`  ✅ found: clip ${moment.eventMedia} @ ${moment.startTime}s (score ${moment.score?.toFixed(3)})`);
    console.log(`     «${(moment.text || '').trim().slice(0, 140)}…»`);
    console.log(
      `     ▶ https://milwaukee.granicus.com/MediaPlayer.php?clip_id=${moment.eventMedia}&starttime=${Math.floor(moment.startTime)}`,
    );
  } else {
    console.log('  — no moment above the relevance gate (the matter is not in an ingested meeting, or scored too low)');
  }
  console.log('');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('dossier-verify FAILED:', err.message);
    process.exit(1);
  });
