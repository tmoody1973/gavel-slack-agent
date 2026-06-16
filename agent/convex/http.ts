import { httpRouter } from 'convex/server';

import { buildNotificationRecord } from '../civicmail/notification.js';
import { verifyWebhookSignature } from '../civicmail/webhook-verify.js';
import { api } from './_generated/api';
import { httpAction } from './_generated/server';

/**
 * AgentMail webhook sink (MOO-69). Durable, public URL co-located with the store
 * (https://<deployment>.convex.site/agentmail). Runs in Convex's V8 runtime —
 * the signature verifier uses Web Crypto, not node:crypto. Verify → parse →
 * insert (idempotent on messageId) → 200 fast; AgentMail retries on non-200, and
 * the messageId guard absorbs the duplicate deliveries.
 */
const handleAgentMail = httpAction(async (ctx, request) => {
  const payload = await request.text();
  const headers = Object.fromEntries(request.headers);
  const secret = process.env.AGENTMAIL_WEBHOOK_SECRET;

  const verified = await verifyWebhookSignature({
    payload,
    headers,
    secret: secret ?? '',
    nowSeconds: Math.floor(Date.now() / 1000),
  });
  if (!verified) return new Response('invalid signature', { status: 401 });

  let event: { event_type?: string; message?: Record<string, unknown> };
  try {
    event = JSON.parse(payload);
  } catch {
    return new Response('bad json', { status: 400 });
  }

  // Only ingest inbound mail; ack everything else so AgentMail stops retrying.
  if (event.event_type !== 'message.received' || !event.message) {
    return new Response('ignored', { status: 200 });
  }

  const m = event.message;
  const record = buildNotificationRecord({
    messageId: (m.message_id ?? m.messageId) as string,
    from: (m.from ?? '') as string,
    subject: (m.subject ?? '') as string,
    html: (m.html ?? '') as string,
    extractedHtml: (m.extracted_html ?? m.extractedHtml) as string | undefined,
    bodyText: (m.text ?? m.extracted_text ?? m.extractedText) as string | undefined,
    timestamp: (m.created_at ?? m.timestamp ?? m.createdAt) as string,
    attachments: (m.attachments ?? []) as never[],
  });

  await ctx.runMutation(api.civicNotifications.insertNotification, { record });
  return new Response('ok', { status: 200 });
});

const http = httpRouter();
http.route({ path: '/agentmail', method: 'POST', handler: handleAgentMail });

export default http;
