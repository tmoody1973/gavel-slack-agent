// "✍️ Make my voice heard" — open the comment modal, and file it on submit (MOO-171).
// The open path stays fast (template draft, no Claude before views.open, so the trigger_id
// can't expire); if a Claude draft boundary is injected, it polishes the draft via views.update.
// The submit path runs every guardrail (resolved recipient, daily cap, real name) before sending.

import { buildCommentModal } from '../../blockkit/comment-modal.js';
import { exceedsDailyCap } from '../../civicmail/comment-cap.js';
import { resolveCommentRecipient } from '../../civicmail/comment-recipient.js';
import { submitComment } from '../../civicmail/comment-submit.js';

const channelOf = (body) => body.channel?.id ?? body.container?.channel_id ?? null;
const languageOf = (subscription) => (subscription?.language === 'es' ? 'es' : 'en');

// A fast, grounded starter so the modal opens instantly (no Claude on the trigger_id path).
const templateDraft = (fileNumber, language) =>
  language === 'es'
    ? `Escribo sobre el File #${fileNumber}. [Escribe aquí tu comentario.]`
    : `I am writing about File #${fileNumber}. [Write your comment here.]`;

/**
 * "✍️ Make my voice heard" → open the comment modal for the clicked item.
 * @param {{
 *   getSubscription: (channelId: string) => Promise<object|null>,
 *   getItem: (fileNumber: string) => Promise<{title: string, bodyName?: string, contactEmail?: string}|null>,
 *   draftComment?: (input: object) => Promise<string>,
 *   testInbox?: string,
 * }} deps
 */
export function makeOpenCivicComment(deps) {
  return async ({ ack, body, client, logger }) => {
    await ack();
    try {
      const fileNumber = body.actions?.[0]?.value;
      const subscription = await deps.getSubscription(channelOf(body)).catch(() => null);
      const language = languageOf(subscription);
      const item = (await deps.getItem?.(fileNumber).catch(() => null)) ?? {};
      const title = item.title ?? `File #${fileNumber}`;
      const demoMode = Boolean(deps.testInbox);
      const willDraft = Boolean(deps.draftComment);
      const editable = (draftText) =>
        buildCommentModal({ fileNumber, title, draftText, language, demoMode, testInbox: deps.testInbox });

      // With a Claude boundary, open a read-only "drafting…" modal first — no submittable comment
      // exists until the real draft swaps in, so a fast submit can't file a bare template. Without
      // a boundary, open the editable template directly (nothing will ever swap in).
      const opened = await client.views.open({
        trigger_id: body.trigger_id,
        view: willDraft
          ? buildCommentModal({ fileNumber, title, language, demoMode, testInbox: deps.testInbox, drafting: true })
          : editable(templateDraft(fileNumber, language)),
      });

      if (willDraft && opened?.view?.id) {
        const draftText = await deps
          .draftComment({ fileNumber, title, position: 'neutral', language })
          .catch(() => null);
        // Either the polished draft or the template fallback — always an editable comment, so the
        // user is never stranded in the drafting placeholder if Claude is slow or unavailable.
        await client.views.update({
          view_id: opened.view.id,
          view: editable(draftText || templateDraft(fileNumber, language)),
        });
      }
    } catch (err) {
      logger?.error?.(`open civic comment failed: ${err.message}`);
    }
  };
}

const readField = (view, blockId, actionId) => view.state?.values?.[blockId]?.[actionId];

/**
 * Submit the comment: resolve recipient → cap → guardrails → send → confirm. Called only on
 * the modal's explicit submit (no auto-send path).
 * @param {{
 *   getItem: (fileNumber: string) => Promise<{title: string, bodyName?: string, contactEmail?: string}|null>,
 *   recentByUserFile: (input: {userId: string, fileNumber: string}) => Promise<number[]>,
 *   logComment: (row: object) => Promise<unknown>,
 *   send: (msg: {to: string, subject: string, text: string}) => Promise<unknown>,
 *   confirm: (input: {userId: string, channelId: string|null, text: string}) => Promise<unknown>,
 *   testInbox?: string,
 *   bodyDirectory?: Record<string, string>,
 *   now?: () => number,
 * }} deps
 */
export function makeCivicCommentSubmit(deps) {
  return async ({ ack, body, view, logger }) => {
    await ack();
    try {
      const meta = JSON.parse(view.private_metadata || '{}');
      const fileNumber = meta.fileNumber;
      const userId = body.user?.id;
      const position = readField(view, 'civic_comment_position', 'position')?.selected_option?.value ?? 'neutral';
      const commentBody = readField(view, 'civic_comment_body', 'body')?.value ?? '';
      const name = readField(view, 'civic_comment_name', 'name')?.value ?? '';
      const address = readField(view, 'civic_comment_address', 'address')?.value ?? '';

      const item = (await deps.getItem?.(fileNumber).catch(() => null)) ?? {};
      const recipientResult = resolveCommentRecipient({
        testInbox: deps.testInbox,
        contactEmail: item.contactEmail,
        bodyName: item.bodyName,
        bodyDirectory: deps.bodyDirectory ?? {},
      });

      const nowMs = (deps.now ?? Date.now)();
      const prior = await deps.recentByUserFile({ userId, fileNumber }).catch(() => []);
      if (exceedsDailyCap(prior, nowMs)) {
        await deps.confirm({
          userId,
          channelId: channelOf(body),
          text: `You already submitted on File #${fileNumber}.`,
        });
        return;
      }

      const result = await submitComment(
        {
          fileNumber,
          title: item.title ?? `File #${fileNumber}`,
          position,
          body: commentBody,
          name,
          address,
          recipient: recipientResult.recipient,
          demoMode: recipientResult.demoMode,
        },
        { send: deps.send },
      );

      if (!result.sent) {
        await deps.confirm({ userId, channelId: channelOf(body), text: `Couldn't file your comment: ${result.error}` });
        return;
      }

      await deps.logComment({
        fileNumber,
        userId,
        recipient: result.recipient,
        demoMode: result.demoMode,
        createdAt: nowMs,
      });
      const disclosure = result.demoMode ? ' (demo mode: sent to a test inbox, not the city)' : '';
      await deps.confirm({
        userId,
        channelId: channelOf(body),
        text: `✅ Your comment on File #${fileNumber} was filed${disclosure}.`,
      });
    } catch (err) {
      logger?.error?.(`civic comment submit failed: ${err.message}`);
    }
  };
}
