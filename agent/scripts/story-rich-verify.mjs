#!/usr/bin/env node

// Live verification for MOO-130 Story-leads rich view. Renders the THREE new surfaces
// over this week's real agenda (live Convex listUpcoming → selectStoryLeads):
//   • the lean App Home section (storyLeadsSection)
//   • the filterable browse modal (storyModal) — all + a committee + a district filter
//   • the /gavel stories carousel (storyCarousel)
// Validates Slack block budgets, prints the rendered text, and (with --post) posts the
// REAL carousel to your DM so it can be screenshotted on the deployed app.
//
//   node scripts/story-rich-verify.mjs [--post]
//
// Read-only against Convex/Legistar; --post writes one DM to you (the bot token owner's
// teammate, resolved from SLACK_USER_TOKEN).

import { ConvexHttpClient } from 'convex/browser';
import { config } from 'dotenv';

config({ path: '.env.local' });
config();

import { WebClient } from '@slack/web-api';
import { storyCarousel, storyLeadsSection, storyModal } from '../blockkit/index.js';
import { decodeFilter } from '../blockkit/story-modal.js';
import { api } from '../convex/_generated/api.js';
import { selectStoryLeads } from '../stories/leads.js';

const convex = new ConvexHttpClient(process.env.CONVEX_URL);
const fromDate = new Date().toISOString().slice(0, 10);
const upcoming = await convex.query(api.detectedItems.listUpcoming, { fromDate });
const subscriptions = await convex.query(api.subscriptions.listSubscriptions, {});
const boundaries = subscriptions.map((s) => s.boundary?.value).filter(Boolean);
const language = subscriptions.length > 0 && subscriptions.every((s) => s.language === 'es') ? 'es' : 'en';
// Production caps: the Home shows the default top-6 (home/state.js); the modal is the
// "show me everything" view, so it pulls a deeper slice (story-buttons.js cap 40).
const homeLeads = selectStoryLeads(upcoming, { boundaries });
const leads = selectStoryLeads(upcoming, { boundaries, cap: 40 });

console.log(
  `\n📅 ${upcoming.length} upcoming items · home=${homeLeads.length} · modal=${leads.length} leads · language=${language}\n`,
);

// ---- Surface A: lean App Home section ----
const home = storyLeadsSection(homeLeads, language);
console.log(`=== 🏠 App Home section (${home.length} blocks; cap≈20) ===`);
for (const b of home) {
  if (b.type === 'section') console.log('  ', b.text.text.replace(/\n/g, ' '));
  if (b.type === 'context') console.log('   ·', b.elements[0].text.replace(/\n/g, ' '));
  if (b.type === 'actions') console.log('   [button]', b.elements.map((e) => e.text.text).join(' / '));
}
assert(home.length <= 20, `Home section ${home.length} blocks > 20`);

// ---- Surface A: the modal, all + a committee + a district filter ----
function dumpModal(label, filter) {
  const view = storyModal(leads, { language, filter });
  console.log(`\n=== 🪟 Modal [${label}] (${view.blocks.length} blocks; cap 100) ===`);
  const select = view.blocks.flatMap((b) => b.elements ?? []).find((e) => e.action_id === 'story_modal_filter');
  if (select) {
    for (const g of select.option_groups)
      console.log(`   filter «${g.label.text}»: ${g.options.map((o) => o.value).join(', ')}`);
    if (select.initial_option) console.log(`   active = ${select.initial_option.value}`);
  }
  for (const b of view.blocks) {
    if (b.type === 'section') console.log('  ', b.text.text.replace(/\n/g, ' '), b.accessory ? '   ⋮[Watch/Ask]' : '');
    if (b.type === 'context') console.log('   ·', b.elements[0].text.replace(/\n/g, ' '));
  }
  assert(view.blocks.length <= 100, `modal ${view.blocks.length} blocks > 100`);
  return view;
}
dumpModal('all', { t: 'all' });
const firstCommittee = [...new Set(leads.map((l) => l.item?.eventBodyName).filter(Boolean))][0];
if (firstCommittee) dumpModal(`committee=${firstCommittee}`, decodeFilter(`c::${firstCommittee}`));
const firstDistrict = leads
  .map((l) => /\((\d+)(?:st|nd|rd|th)\s+Aldermanic District\)/i.exec(l.item?.title ?? '')?.[1])
  .find(Boolean);
if (firstDistrict) dumpModal(`district=${firstDistrict}`, decodeFilter(`d::${firstDistrict}`));

// ---- Surface B: the carousel (synthetic angle bodies — real angles verified by story-radar-verify) ----
const composed = leads.map((l) => ({
  ...l,
  angle: {
    hook: `Worth a look: ${l.item?.title?.slice(0, 80)}`,
    whyStory: 'Grounded angle comes from composeLeadAngles on the live /gavel path.',
  },
}));
const carouselBlocks = storyCarousel(composed, { label: 'this week', language });
const carousel = carouselBlocks.find((b) => b.type === 'carousel');
console.log(`\n=== 🎠 Carousel (${carousel?.elements.length ?? 0} cards; cap 10) ===`);
for (const card of carousel?.elements ?? []) {
  console.log(`   • ${card.title.text.slice(0, 70)}  [${card.actions.map((a) => a.text.text).join(' / ')}]`);
}
assert((carousel?.elements.length ?? 0) <= 10, 'carousel > 10 cards');

console.log('\n✅ All surfaces render within Slack block budgets.');

if (process.argv.includes('--post')) {
  const user = new WebClient(process.env.SLACK_USER_TOKEN);
  const bot = new WebClient(process.env.SLACK_BOT_TOKEN);
  const me = await user.auth.test();
  const dm = await bot.conversations.open({ users: me.user_id });
  const res = await bot.chat.postMessage({
    channel: dm.channel.id,
    text: '📰 MOO-130 live carousel verification',
    blocks: carouselBlocks,
  });
  console.log(
    `\n📤 Posted the real carousel to your DM (${dm.channel.id}) — ok:${res.ok}. Screenshot it for the issue.`,
  );
}

function assert(cond, msg) {
  if (!cond) {
    console.error(`❌ ${msg}`);
    process.exit(1);
  }
}
