#!/usr/bin/env node
// MOO-62 recording aid: fire the data-center alert INTO the demo channel on cue, so the Block Kit
// card lands on camera while you're recording. The whole thesis is that the alert arrives
// unprompted — filming a card that was already sitting there is the weakest version of that claim.
//
// Run it OFF-CAMERA (second terminal / second machine), then cut to Slack and film it drop in.
//
//   node scripts/demo-live-alert.mjs            # posts to #general
//   DEMO_CHANNEL_ID=C0XXXX node scripts/demo-live-alert.mjs
//
// It deletes the previous card first, so the channel doesn't end up with two.

import { WebClient } from '@slack/web-api';
import { ConvexHttpClient } from 'convex/browser';
import { config } from 'dotenv';

config({ path: '.env.local' });
config({ path: '.env' });

import { buildAlertCard, buildFooter } from '../alerts/index.js';
import { api } from '../convex/_generated/api.js';
import { NEWS_GATE_SCHEMA } from '../news/relevance.js';
import { createNewsService } from '../news/service.js';
import { createGoogleNewsSource } from '../news/source.js';
import { BILINGUAL_OUTPUT_SCHEMA, createClaudeGenerate, summarizeMatterBilingual } from '../summarizer/index.js';

const FILE = '260030';
const CHANNEL = process.env.DEMO_CHANNEL_ID || 'C0B8KS5VCCC';
const UA = 'GavelCivicAgent/0.1 (contact tarik@radiomilwaukee.org)';
const TITLE = 'Conditional use for a data center at the former Midtown Walmart, 5825 W Hope Ave';

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
const convex = new ConvexHttpClient(process.env.CONVEX_URL);

// Build everything BEFORE posting, so the card lands the instant you cut to Slack.
process.stdout.write('preparing (summary + news)… ');
const summary = await summarizeMatterBilingual(
  { fileNumber: FILE, title: TITLE, matterText: '', attachments: [] },
  { generate: createClaudeGenerate({ schema: BILINGUAL_OUTPUT_SCHEMA }) },
);
const news = createNewsService({
  source: createGoogleNewsSource({ fetch, userAgent: UA }),
  generate: createClaudeGenerate({ schema: NEWS_GATE_SCHEMA }),
  getCached: (key) => convex.query(api.newsCache.getCached, { key }),
  putCached: (key, articles) => convex.mutation(api.newsCache.upsertCache, { key, articles }),
});
const newsLinks = await news.enrichForAlert({ fileNumber: FILE, title: TITLE, addresses: ['5825 W Hope Ave'] });

const card = buildAlertCard({
  row: { title: TITLE, eventBodyName: 'CITY PLAN COMMISSION', walkOnFlag: false, consentFlag: false },
  matter: { fileNumber: FILE },
  event: { date: '2026-07-20', time: '1:30 PM', location: 'City Hall, Room 201-B' },
  summary,
  footer: buildFooter({ date: '2026-07-20', time: '1:30 PM', location: 'City Hall, Room 201-B' }, null),
  // 'es' renders the bilingual card (EN section · divider · ES section) — the demo thesis.
  // 'en' would drop the Spanish half entirely.
  language: 'es',
  newsLinks,
});

// Clear any earlier copy so the channel stays clean on camera.
const history = await slack.conversations.history({ channel: CHANNEL, limit: 30 });
for (const m of history.messages) {
  if ((m.blocks ?? []).some((b) => b.type === 'header')) {
    await slack.chat.delete({ channel: CHANNEL, ts: m.ts }).catch(() => {});
  }
}

console.log(`ready (${newsLinks.length} news links).`);
console.log('\n>>> SWITCH TO SLACK NOW. Posting in 5 seconds… <<<\n');
await new Promise((r) => setTimeout(r, 5000));

const res = await slack.chat.postMessage({ channel: CHANNEL, text: card.text, blocks: card.blocks });
console.log(`posted ts=${res.ts}`);
