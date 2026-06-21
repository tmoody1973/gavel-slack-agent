#!/usr/bin/env node

// Live verification for MOO-142 video discovery. Runs the real pipeline:
//   live Legistar listRecentMeetingsWithVideo() → real past meetings with a Granicus
//   webcast, joined against live Convex listIngestedEventIds() to tag 🔍 Searchable vs
//   🎥 Video only, then renders the two surfaces (videoModal + the App Home section) and
//   checks Slack's block budgets. Anchors on EventId 13441 (the MOO-113-ingested ZONING
//   meeting, clip 5210) — it MUST come back 🔍 Searchable.
//
//   node scripts/video-discovery-verify.mjs
//
// Read-only against Convex + Legistar.

import { ConvexHttpClient } from 'convex/browser';
import { config } from 'dotenv';

config({ path: '.env.local' });
config();

import { meetingVideoSection, tagSearchable, videoModal } from '../blockkit/index.js';
import { api } from '../convex/_generated/api.js';
import { createLegistarClient } from '../poller/legistar.js';

const ANCHOR_EVENT_ID = 13441; // MOO-113 ingested this ZONING meeting (clip 5210)

const convex = new ConvexHttpClient(process.env.CONVEX_URL);
const legistar = createLegistarClient({
  fetch: globalThis.fetch,
  client: 'milwaukee',
  userAgent: 'gavel-slack-agent (tarik@radiomilwaukee.org)',
});

const [rawMeetings, ingested] = await Promise.all([
  legistar.listRecentMeetingsWithVideo(),
  convex.query(api.transcripts.listIngestedEventIds, {}),
]);
const meetings = tagSearchable(rawMeetings, ingested);

const committees = [...new Set(meetings.map((m) => m.eventBodyName))].sort();
console.log(`\n🎥 ${meetings.length} recent meetings with video · ${committees.length} committees · ingested=${JSON.stringify(ingested)}\n`);

console.log('=== meetings (committee · date · tag · clip) ===');
for (const m of meetings) {
  const tag = m.searchable ? '🔍 Searchable' : '🎥 Video only';
  console.log(`  ${m.eventDate.slice(0, 10)}  ${tag}  clip ${m.eventMedia}  ${m.eventBodyName}`);
}

// ---- Surface: the filterable browse modal (all committees) ----
const modal = videoModal(meetings, { language: 'en', committee: null });
const select = modal.blocks.flatMap((b) => b.elements ?? []).find((e) => e?.action_id === 'video_filter');
console.log(`\n=== 🪟 videoModal (${modal.blocks.length} blocks; cap≤100) ===`);
console.log(`  committee dropdown options: ${select?.options.length} (All + ${committees.length} with video)`);

// ---- Surface: a single-committee filter (mirrors a dropdown change) ----
if (committees.length > 0) {
  const one = committees.find((c) => /ZONING/.test(c)) ?? committees[0];
  const filtered = videoModal(meetings, { language: 'en', committee: one });
  const rows = filtered.blocks.filter((b) => b.accessory?.action_id === 'video_watch').length;
  console.log(`  filtered to "${one}": ${rows} meeting row(s)`);
}

// ---- Surface: the reporter App Home preview ----
const section = meetingVideoSection(meetings, 'en');
console.log(`\n=== 🏠 App Home section (${section.length} blocks) ===`);
console.log(`  Browse button present: ${JSON.stringify(section).includes('video_browse')}`);

// ---- Anchor assertions (against reality) ----
const anchor = meetings.find((m) => m.eventId === ANCHOR_EVENT_ID);
const nonIngested = meetings.find((m) => !m.searchable);
const checks = [
  [`anchor EventId ${ANCHOR_EVENT_ID} present with video`, !!anchor],
  [`anchor is 🔍 Searchable`, anchor?.searchable === true],
  [`anchor watch link is the clip-5210 player`, `https://milwaukee.granicus.com/MediaPlayer.php?clip_id=5210` === `https://milwaukee.granicus.com/MediaPlayer.php?clip_id=${anchor?.eventMedia}`],
  [`a non-ingested meeting shows 🎥 Video only`, !!nonIngested],
  [`modal under the 100-block cap`, modal.blocks.length <= 100],
  [`dropdown built only from committees-with-video`, (select?.options.length ?? 0) === committees.length + 1],
];

console.log('\n=== ✅ verification ===');
let ok = true;
for (const [label, pass] of checks) {
  console.log(`  ${pass ? '✅' : '❌'} ${label}`);
  ok = ok && pass;
}
if (anchor) console.log(`\n▶ anchor watch link: https://milwaukee.granicus.com/MediaPlayer.php?clip_id=${anchor.eventMedia}`);
console.log(ok ? '\n🎉 all checks passed\n' : '\n💥 some checks failed\n');
process.exit(ok ? 0 : 1);
