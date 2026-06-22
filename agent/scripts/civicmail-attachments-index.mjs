#!/usr/bin/env node

// Index PDF attachment text into civicNotifications.searchText (MOO-153), so
// `/gavel search` reaches inside agendas, meeting packets, and statements — not just
// the email subject/body. For each row carrying a PDF: pull the attachment via the
// AgentMail API (a JSON envelope with a presigned download_url), fetch the bytes,
// extract searchable text with Claude (the summarizer's document-block path, no
// pdf-parse dependency), then rebuild searchText via the shared pure composer.
//
//   node scripts/civicmail-attachments-index.mjs            # index all rows with PDFs
//   node scripts/civicmail-attachments-index.mjs --limit=3  # just the first N (smoke test)
//
// Idempotent: re-running re-extracts and overwrites. Images (flyers) are skipped.

import { ConvexHttpClient } from 'convex/browser';
import { config } from 'dotenv';

config({ path: '.env.local' });
config();

import { ATTACHMENT_TEXT_SCHEMA, composeSearchText, extractAttachmentText } from '../civicmail/attachment-index.js';
import { api } from '../convex/_generated/api.js';
import { MAX_DOCUMENTS } from '../summarizer/documents.js';
import { createClaudeGenerate } from '../summarizer/index.js';

const KEY = process.env.AGENTMAIL_API_KEY;
const INBOX = process.env.AGENTMAIL_INBOX_ID || 'mke-alerts@agentmail.to';
const BASE = `https://api.agentmail.to/v0/inboxes/${INBOX}`;

const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : undefined;
};
const LIMIT = arg('limit') ? Number(arg('limit')) : Number.POSITIVE_INFINITY;

const convex = new ConvexHttpClient(process.env.CONVEX_URL);
// Agendas/packets are long; give the extraction room so the JSON text field isn't
// truncated mid-string (the 1024-token default cuts a full agenda short).
const generate = createClaudeGenerate({ schema: ATTACHMENT_TEXT_SCHEMA, maxTokens: 8192 });

/** Resolve an attachment to base64 PDF bytes via its presigned download_url. */
async function fetchPdfBase64(messageId, attachment) {
  const envelopeUrl = `${BASE}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachment.attachmentId)}`;
  const envelope = await (await fetch(envelopeUrl, { headers: { Authorization: `Bearer ${KEY}` } })).json();
  if (!envelope.download_url) throw new Error(`no download_url for ${attachment.filename}`);
  const bytes = Buffer.from(await (await fetch(envelope.download_url)).arrayBuffer());
  return bytes.toString('base64');
}

async function indexRow(row) {
  const pdfs = (row.attachments ?? []).filter((a) => a.contentType === 'application/pdf').slice(0, MAX_DOCUMENTS);
  if (pdfs.length === 0) return { skipped: 'no-pdf' };

  const documents = [];
  for (const pdf of pdfs) {
    documents.push({ base64: await fetchPdfBase64(row.messageId, pdf), mediaType: 'application/pdf' });
  }
  const attachmentText = await extractAttachmentText({ documents, filenames: pdfs.map((p) => p.filename), generate });
  if (!attachmentText) return { skipped: 'no-text' };

  const searchText = composeSearchText({ subject: row.subject, bodyText: row.bodyText, attachmentText });
  await convex.mutation(api.civicNotifications.setAttachmentText, {
    messageId: row.messageId,
    attachmentText,
    searchText,
  });
  return { chars: attachmentText.length };
}

async function main() {
  if (!KEY) throw new Error('AGENTMAIL_API_KEY missing');
  const rows = (await convex.query(api.civicNotifications.listPending, {})).filter((r) =>
    (r.attachments ?? []).some((a) => a.contentType === 'application/pdf'),
  );
  const targets = rows.slice(0, LIMIT);
  console.log(`Indexing attachment text for ${targets.length}/${rows.length} rows with PDFs…`);

  let indexed = 0;
  for (const row of targets) {
    try {
      const result = await indexRow(row);
      if (result.chars) {
        indexed += 1;
        console.log(
          `  ✓ ${row.subject.slice(0, 50)} — ${result.chars} chars from ${row.attachments.length} attachment(s)`,
        );
      } else {
        console.log(`  · ${row.subject.slice(0, 50)} — ${result.skipped}`);
      }
    } catch (err) {
      console.log(`  ✗ ${row.subject.slice(0, 50)} — ${err.message}`);
    }
  }
  console.log(`\nDone: indexed ${indexed} rows.`);
}

main().catch((err) => {
  console.error('civicmail-attachments-index FAILED:', err.message);
  process.exitCode = 1;
});
