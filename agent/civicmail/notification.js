import { extractCivicFields, htmlToText } from './extract.js';

/**
 * Shape a raw AgentMail message into the `civicNotifications` insert record.
 * Single entry point for both the webhook httpAction and the verify script:
 * strips HTML, runs the deterministic field extractor, and assembles the row
 * (minus `detectedAt`/`alertStatus`/`summary`/`embedding`, which the mutation
 * and processor add). Null optionals are dropped so Convex sees absent, not null.
 *
 * @param {{
 *   messageId: string, from?: string, subject?: string,
 *   html?: string, extractedHtml?: string, bodyText?: string,
 *   timestamp?: string, receivedAt?: string,
 *   attachments?: Array<{ filename?: string, contentType?: string, content_type?: string,
 *                         attachmentId?: string, attachment_id?: string, size?: number }>,
 * }} message
 * @returns {object} a record ready for the insertNotification mutation
 */
export function buildNotificationRecord(message) {
  const subject = message.subject ?? '';
  const bodyText = htmlToText(message.extractedHtml ?? message.html ?? message.bodyText ?? '');
  const extracted = extractCivicFields({ subject, bodyText });

  const record = {
    messageId: message.messageId,
    receivedAt: toIsoString(message.timestamp ?? message.receivedAt),
    from: message.from ?? '',
    subject,
    bodyText,
    searchText: `${subject} ${bodyText}`.trim(),
    ...extracted,
    taxkey: extracted.taxkeys[0],
    attachments: normalizeAttachments(message.attachments),
  };

  return dropNullish(record);
}

function normalizeAttachments(attachments) {
  return (attachments ?? []).map((a) => ({
    filename: a.filename ?? '',
    contentType: a.contentType ?? a.content_type ?? 'application/octet-stream',
    attachmentId: a.attachmentId ?? a.attachment_id ?? '',
    ...(a.size != null ? { size: a.size } : {}),
  }));
}

/** Coerce a Date or string timestamp to an ISO string (Convex has no Date type). */
function toIsoString(value) {
  if (!value) return '';
  return value instanceof Date ? value.toISOString() : String(value);
}

/** Drop null/undefined values so Convex optional fields read as absent. Arrays kept. */
function dropNullish(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value != null));
}
