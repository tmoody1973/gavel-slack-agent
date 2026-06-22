// MOO-153 (demo): backfill the real E-Notify mail sitting in the AgentMail inbox into
// `civicNotifications`, so the "From the city" digest has real data without waiting on a
// live webhook. Reuses the same record builder the webhook httpAction uses, so the stored
// rows are identical to live ingestion. Idempotent on messageId via insertNotification.
//
//   node scripts/civicmail-backfill.mjs
//
// Uses the AgentMail REST API directly (no SDK dependency in this checkout).
import { config } from 'dotenv';

config({ path: '.env.local' });
config({ path: '.env' });

import { ConvexHttpClient } from 'convex/browser';

import { buildNotificationRecord } from '../civicmail/notification.js';
import { api } from '../convex/_generated/api.js';

const KEY = process.env.AGENTMAIL_API_KEY;
const INBOX = process.env.AGENTMAIL_INBOX_ID || 'mke-alerts@agentmail.to';
const BASE = `https://api.agentmail.to/v0/inboxes/${INBOX}`;
const convex = new ConvexHttpClient(process.env.CONVEX_URL);

const am = async (path) => {
  const r = await fetch(BASE + path, { headers: { Authorization: `Bearer ${KEY}` } });
  if (!r.ok) throw new Error(`AgentMail ${path} -> ${r.status} ${(await r.text()).slice(0, 120)}`);
  return r.json();
};

/** Page through every message (AgentMail caps a page at 100 and returns a
 * `next_page_token`; the request param that advances is `page_token`). Without this
 * the backfill silently saw only the first 100 of the inbox. */
async function listAllMessages() {
  const all = [];
  let pageToken;
  do {
    const query = `/messages?limit=100${pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : ''}`;
    const page = await am(query);
    all.push(...(page.messages ?? []));
    pageToken = page.next_page_token;
  } while (pageToken);
  return all;
}

async function main() {
  if (!KEY) throw new Error('AGENTMAIL_API_KEY missing');
  console.log(`Backfilling civicNotifications from ${INBOX}…`);

  const messages = await listAllMessages();
  console.log(`  inbox has ${messages.length} messages`);

  let inserted = 0;
  let skipped = 0;
  const byCategory = {};
  for (const m of messages) {
    const id = m.message_id ?? m.messageId ?? m.id;
    const full = await am(`/messages/${encodeURIComponent(id)}`);
    const record = buildNotificationRecord({
      messageId: id,
      from: full.from ?? m.from,
      subject: full.subject ?? m.subject,
      extractedHtml: full.extracted_html,
      html: full.html,
      timestamp: full.timestamp ?? m.timestamp,
      attachments: full.attachments,
    });
    byCategory[record.category ?? 'uncategorized'] = (byCategory[record.category ?? 'uncategorized'] ?? 0) + 1;
    const res = await convex.mutation(api.civicNotifications.insertNotification, { record });
    if (res === null || res === false) skipped += 1;
    else inserted += 1;
  }

  const total = (await convex.query(api.civicNotifications.listPending, {})).length;
  console.log(`\n✓ processed ${messages.length}: inserted ${inserted}, skipped/dup ${skipped}`);
  console.log('  by category:', JSON.stringify(byCategory));
  console.log(`  civicNotifications now pending: ${total}`);
}

main().catch((err) => {
  console.error('civicmail-backfill FAILED:', err.message);
  process.exitCode = 1;
});
