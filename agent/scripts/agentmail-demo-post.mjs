// MOO-69 demo: post ONE real bilingual E-Notify card to a Slack channel, end to
// end from a real inbox message — including reading its PDF agenda natively.
// The live demo beat for the MOO-62 video.
//
//   DEMO_CHANNEL_ID=C0XXXX node scripts/agentmail-demo-post.mjs           # ZND meeting (PDF)
//   DEMO_CHANNEL_ID=C0XXXX node scripts/agentmail-demo-post.mjs license   # tavern license
import { config } from 'dotenv';

config({ path: '.env.local' });
config({ path: '.env' });

import { WebClient } from '@slack/web-api';

import { AgentMailClient } from 'agentmail';
import { buildNotificationCard } from '../civicmail/card.js';
import { buildNotificationRecord } from '../civicmail/notification.js';
import { createClaudeGenerate } from '../summarizer/client.js';
import { summarizeMatterBilingual } from '../summarizer/bilingual.js';
import { BILINGUAL_OUTPUT_SCHEMA } from '../summarizer/prompt.js';

const INBOX = 'mke-alerts@agentmail.to';
const channel = process.env.DEMO_CHANNEL_ID;
if (!channel) {
  console.error('Set DEMO_CHANNEL_ID (a channel the Gavel bot is in).');
  process.exit(1);
}

const which = process.argv[2] === 'license' ? /RENEWAL Class B Tavern/ : /Zoning, Neighborhoods/;
const language = process.argv.includes('--en') ? 'en' : 'es'; // ES shows the bilingual card

const am = new AgentMailClient({ apiKey: process.env.AGENTMAIL_API_KEY });
const slack = new WebClient(process.env.SLACK_BOT_TOKEN || process.env.SLACK_USER_TOKEN);
const generate = createClaudeGenerate({ schema: BILINGUAL_OUTPUT_SCHEMA });

async function pdfDocuments(messageId, attachments) {
  const pdf = (attachments ?? []).find((a) => a.contentType === 'application/pdf');
  if (!pdf) return [];
  const meta = await am.inboxes.messages.getAttachment(INBOX, messageId, pdf.attachmentId);
  const bytes = Buffer.from(await (await fetch(meta.downloadUrl)).arrayBuffer());
  return [{ base64: bytes.toString('base64'), mediaType: 'application/pdf' }];
}

const list = await am.inboxes.messages.list(INBOX, { limit: 50 });
const arr = list?.messages ?? list?.data ?? list;
const hit = arr.find((m) => which.test(m.subject));
if (!hit) {
  console.error('No matching real message found in the inbox.');
  process.exit(1);
}
const full = await am.inboxes.messages.get(INBOX, hit.messageId);
const notification = buildNotificationRecord(full);
console.log(`Source: ${notification.category} — ${notification.subject}`);

const documents = await pdfDocuments(notification.messageId, notification.attachments);
console.log(`PDF: ${documents[0] ? `${Math.round((documents[0].base64.length * 0.75) / 1024)}KB (read natively)` : 'none'}`);

const matter = { fileNumber: '', title: notification.subject, matterText: notification.bodyText, attachments: [] };
const summary = await summarizeMatterBilingual(matter, { generate, documents });
const card = buildNotificationCard({ notification, summary, language });

const res = await slack.chat.postMessage({ channel, text: card.text, blocks: card.blocks });
console.log(`\nPosted ts=${res.ts} to ${channel}. Open Slack (desktop + mobile) to screenshot for the demo.`);
