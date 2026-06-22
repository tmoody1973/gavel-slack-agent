// Civic-record modal handlers (MOO-153). A "Read" button on a digest highlight or a
// /gavel search result opens the in-Slack record modal: the email body, the extracted
// PDF text, and flyers rendered inline. The modal must open within ~3s of the click,
// so the work is a Convex fetch + (parallel) fresh attachment-URL fetches — no Claude.
// Boundaries injected for testability; the modal builder is pure.

import { buildCivicRecordModal } from '../../civicmail/record-modal.js';

/**
 * "Read" → open the civic-record modal for the clicked notification.
 *
 * @param {{
 *   getNotification: (messageId: string) => Promise<object|null>,
 *   getSubscription: (channelId: string) => Promise<object|null>,
 *   resolveAttachmentUrls: (record: object) => Promise<Array<{filename: string, contentType: string, url: string|null}>>,
 * }} deps
 */
export function makeOpenCivicRecord(deps) {
  return async ({ ack, body, client, logger }) => {
    await ack();
    try {
      const messageId = body.actions?.[0]?.value;
      const record = await deps.getNotification(messageId);
      if (!record) {
        logger?.error?.(`civic record not found for ${messageId}`);
        return;
      }
      const subscription = await deps.getSubscription(body.channel?.id ?? body.container?.channel_id);
      const language = subscription?.language === 'es' ? 'es' : 'en';
      // Resolve fresh presigned URLs for the attachments (they expire). Degrades to a
      // filename when resolution fails, so the modal still opens.
      const resolvedAttachments = await deps.resolveAttachmentUrls(record).catch(() => []);
      await client.views.open({
        trigger_id: body.trigger_id,
        view: buildCivicRecordModal({ record, resolvedAttachments, language }),
      });
    } catch (err) {
      logger?.error?.(`open civic record failed: ${err.message}`);
    }
  };
}

/** The modal's "👁 Watch this" button → add a watch on the record's entity. */
export function makeRecordWatch(deps) {
  return async ({ ack, body, logger }) => {
    await ack();
    try {
      const entity = body.actions?.[0]?.value;
      const channelId = body.channel?.id ?? body.container?.channel_id;
      if (entity && channelId) await deps.addWatch({ channelId, entity });
    } catch (err) {
      logger?.error?.(`record watch failed: ${err.message}`);
    }
  };
}
