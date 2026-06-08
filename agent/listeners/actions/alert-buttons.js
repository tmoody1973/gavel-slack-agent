/**
 * Alert card button handlers. For MOO-44 each one acks, logs, and posts a
 * minimal ephemeral acknowledgement — deep behavior (watchlists, history
 * fetch, RTS-backed Q&A) is wired in Phases 2–3.
 */
function makeHandler(label, message) {
  return async function handle({ ack, body, context, client, logger }) {
    await ack();
    try {
      const userId = /** @type {string} */ (context.userId);
      const channelId = /** @type {string} */ (body.channel?.id);
      const eventItemId = body.actions?.[0]?.value;
      // No thread_ts: the alert card is a top-level channel message, so the
      // ephemeral ack should appear in the channel where the user clicked, not
      // buried in a thread.
      await client.chat.postEphemeral({ channel: channelId, user: userId, text: message });
      logger.info(`alert ${label}: eventItemId=${eventItemId} user=${userId}`);
    } catch (e) {
      logger.error(`alert ${label} failed: ${e}`);
    }
  };
}

export const handleAlertWatch = makeHandler(
  'watch',
  "👁 You'll be notified as this item moves through committee. (Watchlists arrive soon.)",
);
export const handleAlertHistory = makeHandler(
  'history',
  '🕓 Full history is on the matter page (link in the card footer). Detailed timeline coming soon.',
);
export const handleAlertAsk = makeHandler(
  'ask',
  '💬 Ask me about this in a thread — reply here and I’ll dig into the record.',
);
