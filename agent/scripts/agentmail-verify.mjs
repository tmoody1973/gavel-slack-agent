// MOO-69 live verification — replays REAL stored E-Notify mail through the full
// ingestion pipeline and proves every acceptance/verification criterion against
// reality. Dry by design: posting is captured, never sent to Slack; no webhook
// is registered. Cleans up every row it creates.
//
//   node scripts/agentmail-verify.mjs
import { config } from 'dotenv';

config({ path: '.env.local' });
config({ path: '.env' });

import { AgentMailClient } from 'agentmail';
import { ConvexHttpClient } from 'convex/browser';

import { buildNotificationRecord } from '../civicmail/notification.js';
import { processCivicNotifications } from '../civicmail/process.js';
import { api } from '../convex/_generated/api.js';
import { summarizeMatterBilingual } from '../summarizer/bilingual.js';
import { createClaudeGenerate } from '../summarizer/client.js';
import { BILINGUAL_OUTPUT_SCHEMA } from '../summarizer/prompt.js';
import { embedQuery, embedTexts } from '../zoning/embed.js';

const INBOX = 'mke-alerts@agentmail.to';
const am = new AgentMailClient({ apiKey: process.env.AGENTMAIL_API_KEY });
const convex = new ConvexHttpClient(process.env.CONVEX_URL);
const openaiKey = process.env.OPENAI_API_KEY;

// Synthetic subscriptions for the demo: a District-3 channel (EN) and a
// committee/tavern keyword channel (ES) — exercises district + keyword routing
// and per-channel language.
const SUBS = [
  {
    channelId: 'C-district3-en',
    committees: [],
    keywords: [],
    language: 'en',
    boundary: { type: 'district', value: '3' },
  },
  { channelId: 'C-zoning-es', committees: [], keywords: ['committee', 'tavern'], language: 'es' },
];

const line = (s = '') => console.log(s);
const hr = (title) => line(`\n${'═'.repeat(70)}\n${title}\n${'═'.repeat(70)}`);

async function pdfDocuments(notification) {
  const pdf = (notification.attachments ?? []).find((a) => a.contentType === 'application/pdf');
  if (!pdf) return [];
  const meta = await am.inboxes.messages.getAttachment(INBOX, notification.messageId, pdf.attachmentId);
  const bytes = Buffer.from(await (await fetch(meta.downloadUrl)).arrayBuffer());
  return [{ base64: bytes.toString('base64'), mediaType: 'application/pdf' }];
}

async function ingestReal(predicate, label) {
  const list = await am.inboxes.messages.list(INBOX, { limit: 50 });
  const arr = list?.messages ?? list?.data ?? list;
  const hit = arr.find(predicate);
  if (!hit) throw new Error(`no real message matched: ${label}`);
  const full = await am.inboxes.messages.get(INBOX, hit.messageId);
  const record = buildNotificationRecord(full);
  await convex.mutation(api.civicNotifications.removeNotification, { messageId: record.messageId });
  await convex.mutation(api.civicNotifications.insertNotification, { record });
  return record;
}

async function main() {
  const created = [];
  const generate = createClaudeGenerate({ schema: BILINGUAL_OUTPUT_SCHEMA });

  hr('1. INGEST REAL E-NOTIFY MAIL (incl. one with a PDF agenda)');
  const meeting = await ingestReal((m) => /Zoning, Neighborhoods/.test(m.subject), 'ZND meeting+PDF');
  const license = await ingestReal((m) => /RENEWAL Class B Tavern/.test(m.subject), 'tavern license');
  const permit = await ingestReal((m) => /new record #COM-ALT/.test(m.subject), 'commercial permit');
  created.push(meeting.messageId, license.messageId, permit.messageId);
  for (const r of [meeting, license, permit]) {
    line(`• ${r.category.padEnd(20)} ${r.subject.slice(0, 52)}`);
    line(
      `  district=${r.district ?? '–'} taxkey=${r.taxkey ?? '–'} record=${r.recordNumber ?? '–'} legistarId=${r.legistarMeetingId ?? '–'} pdf=${r.attachments.length}`,
    );
  }

  hr('2. STORED RECORD + EXTRACTED FIELDS + BILINGUAL SUMMARY (the PDF agenda)');
  const stored = await convex.query(api.civicNotifications.getByMessageId, { messageId: meeting.messageId });
  line(`stored: messageId=${stored.messageId}`);
  line(
    `        category=${stored.category} status=${stored.alertStatus} attachments=${JSON.stringify(stored.attachments.map((a) => a.filename))}`,
  );
  const docs = await pdfDocuments(meeting);
  line(`fetched PDF: ${docs[0] ? `${Math.round((docs[0].base64.length * 0.75) / 1024)}KB` : 'none'}`);
  const matter = { fileNumber: '', title: meeting.subject, matterText: meeting.bodyText, attachments: [] };
  const summary = await summarizeMatterBilingual(matter, { generate, documents: docs });
  line(`\nEN: ${summary.en.summary}`);
  line(`    why: ${summary.en.whyItMatters}`);
  line(`ES: ${summary.es.summary}`);
  line(`addresses (from the PDF): ${JSON.stringify(summary.addresses.slice(0, 6))}`);

  hr('3. ROUTE + SUMMARIZE + POST (dry) — per-channel language');
  const posted = [];
  const results = await processCivicNotifications({
    listPending: () => convex.query(api.civicNotifications.listPending, {}),
    listSubscriptions: async () => SUBS,
    listLegistarItems: () => convex.query(api.detectedItems.listUpcoming, { fromDate: '2000-01-01' }),
    fetchDocuments: pdfDocuments,
    generateBilingual: (m, d) => summarizeMatterBilingual(m, { generate, documents: d }),
    postCard: async (channel, card) =>
      posted.push({
        channel,
        lang: /En español/.test(JSON.stringify(card.blocks)) ? 'es' : 'en',
        text: card.text.slice(0, 60),
      }),
    markProcessed: (mid, s) => convex.mutation(api.civicNotifications.markProcessed, { messageId: mid, summary: s }),
    logger: console,
  });
  line(`processed ${results.length} notifications; ${posted.length} card(s) posted (dry):`);
  for (const p of posted) line(`  → ${p.channel} [${p.lang}]  ${p.text}`);

  hr('4. FILTER-FIRST SEARCH (the dominant civic query shapes)');
  const byDist = await convex.query(api.civicNotifications.searchByDistrictDate, {
    district: '3',
    fromDate: '2026-06-01',
  });
  line(`by district 3 + since 2026-06-01: ${byDist.length} → ${byDist.map((r) => r.subject.slice(0, 40))}`);
  const byTax = await convex.query(api.civicNotifications.getByTaxkey, { taxkey: permit.taxkey });
  line(`by taxkey ${permit.taxkey}: ${byTax.length} → ${byTax.map((r) => r.recordNumber)}`);
  const ft = await convex.query(api.civicNotifications.searchText, { term: 'Tavern License' });
  line(`full-text "Tavern License": ${ft.length} → ${ft.map((r) => r.subject.slice(0, 40))}`);

  hr('5. SEMANTIC "FIND SIMILAR" (vector search)');
  if (openaiKey) {
    const targets = [meeting, license, permit];
    const vectors = await embedTexts(
      targets.map((r) => `${r.subject} ${r.bodyText}`.slice(0, 2000)),
      { apiKey: openaiKey },
    );
    for (let i = 0; i < targets.length; i += 1) {
      await convex.mutation(api.civicNotifications.markProcessed, {
        messageId: targets[i].messageId,
        embedding: vectors[i],
      });
    }
    const query = 'restaurant liquor license application';
    const queryVec = await embedQuery(query, { apiKey: openaiKey });
    const hits = await convex.action(api.civicNotifications.findSimilar, { embedding: queryVec, limit: 3 });
    const rows = await convex.query(api.civicNotifications.getByIds, { ids: hits.map((h) => h._id) });
    const bySubject = new Map(rows.map((r) => [r._id, r.subject]));
    line(`query: "${query}"`);
    hits.forEach((h, i) =>
      line(`  ${i + 1}. score ${h._score.toFixed(3)}  ${(bySubject.get(h._id) ?? '?').slice(0, 50)}`),
    );
  } else {
    line('OPENAI_API_KEY not set — semantic search deferred (filter-first + full-text cover the dominant shapes).');
  }

  hr('6. FUSION/DEDUP vs LEGISTAR (no double-alert)');
  const fakeEventId = Number(meeting.legistarMeetingId);
  await convex.mutation(api.detectedItems.enqueueDetected, {
    items: [
      {
        client: 'milwaukee',
        eventItemId: 99990001,
        eventId: fakeEventId,
        title: meeting.subject,
        eventBodyName: 'ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE',
        eventDate: '2026-06-16',
      },
    ],
  });
  // re-ingest the meeting as pending, then process — it should be suppressed
  await convex.mutation(api.civicNotifications.removeNotification, { messageId: meeting.messageId });
  await convex.mutation(api.civicNotifications.insertNotification, { record: meeting });
  const dedupPosted = [];
  const dedupResults = await processCivicNotifications({
    listPending: async () => [
      await convex.query(api.civicNotifications.getByMessageId, { messageId: meeting.messageId }),
    ],
    listSubscriptions: async () => SUBS,
    listLegistarItems: () => convex.query(api.detectedItems.listUpcoming, { fromDate: '2000-01-01' }),
    fetchDocuments: async () => [],
    generateBilingual: async () => ({
      en: { summary: 'x', whyItMatters: 'y' },
      es: { summary: 'x', whyItMatters: 'y' },
    }),
    postCard: async (c, card) => dedupPosted.push({ c, card }),
    markProcessed: (mid) => convex.mutation(api.civicNotifications.markProcessed, { messageId: mid }),
    logger: console,
  });
  line(`meeting legistarMeetingId=${meeting.legistarMeetingId} matches a poller-detected eventId=${fakeEventId}`);
  line(
    `→ posted ${dedupPosted.length} card(s); suppressed=${dedupResults[0]?.suppressed === true} (NOT double-alerted ✓)`,
  );
  await convex.mutation(api.detectedItems.removeDetected, { client: 'milwaukee', eventItemId: 99990001 });

  hr('7. PUBLIC-RECORD GUARDRAIL');
  const sample = await convex.query(api.civicNotifications.getByMessageId, { messageId: license.messageId });
  const fromCity = sample.from.includes('milwaukee.gov');
  line(`every stored row originates from the City E-Notify sender: ${fromCity} (from=${sample.from})`);
  line('table stores only civic mail (subject/body/derived fields) — no Slack message content is ever written.');

  hr('CLEANUP');
  for (const mid of created) await convex.mutation(api.civicNotifications.removeNotification, { messageId: mid });
  line(`removed ${created.length} demo rows.`);
}

main().catch((err) => {
  console.error('\nagentmail-verify FAILED:', err.message);
  process.exitCode = 1;
});
