#!/usr/bin/env node
// MOO-44 verification: post ONE real bilingual alert card to a sandbox channel
// from a real pending row, with real Legistar enrichment. Prints the footer
// fields so they can be cross-checked against Legistar.
//
//   DEMO_CHANNEL_ID=C0XXXX node scripts/alert-verify.mjs

import { WebClient } from '@slack/web-api';
import { ConvexHttpClient } from 'convex/browser';
import { config } from 'dotenv';

config({ path: '.env.local' });
config();

import { buildAlertCard, buildFooter, enrichForAlert } from '../alerts/index.js';
import { api } from '../convex/_generated/api.js';
import { createLegistarClient } from '../poller/index.js';
import { BILINGUAL_OUTPUT_SCHEMA, createClaudeGenerate, summarizeMatterBilingual } from '../summarizer/index.js';

const CLIENT = 'milwaukee';
const channel = process.env.DEMO_CHANNEL_ID;
if (!channel) {
  console.error('Set DEMO_CHANNEL_ID (a channel the Gavel bot is in).');
  process.exit(1);
}

const convex = new ConvexHttpClient(process.env.CONVEX_URL);
const legistar = createLegistarClient({
  fetch,
  client: CLIENT,
  userAgent: 'GavelCivicAgent/0.1 (contact tarik@radiomilwaukee.org)',
});
const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
const generate = createClaudeGenerate({ schema: BILINGUAL_OUTPUT_SCHEMA });

const pending = await convex.query(api.detectedItems.listPending, { client: CLIENT });
if (pending.length === 0) {
  console.error('No pending rows — run scripts/poll-once.mjs first to seed the ledger.');
  process.exit(1);
}
const row = pending.find((p) => /immigration|rezoning|ordinance/i.test(p.title)) ?? pending[0];
console.log('Posting card for:', row.eventItemId, '—', row.title.slice(0, 70));

const ctx = await enrichForAlert(row, legistar);
const summary = await summarizeMatterBilingual(
  { fileNumber: ctx.matter.fileNumber, title: row.title, matterText: '', attachments: [] },
  { generate },
);
const footer = buildFooter(ctx.event, ctx.person);
const card = buildAlertCard({ row, matter: ctx.matter, event: ctx.event, summary, footer });

console.log(`\nFOOTER (cross-check against Legistar):\n${footer.text}`);
const res = await slack.chat.postMessage({ channel, text: card.text, blocks: card.blocks });
console.log(`\nPosted ts=${res.ts} to ${channel}. Open Slack (desktop + mobile) to screenshot.`);
