import { runAgent } from '../../agent/index.js';
import { primeStore, sessionStore } from '../../thread-context/index.js';
import { buildFeedbackBlocks } from '../views/feedback-builder.js';
import { THINKING_STATUS } from './status.js';

/**
 * @param {import('@slack/types').MessageEvent} event
 * @returns {event is import('@slack/types').GenericMessageEvent}
 */
function isGenericMessageEvent(event) {
  return !('subtype' in event && event.subtype !== undefined);
}

/**
 * Handle messages sent to the agent via DM or in threads the bot is part of.
 * @param {import('@slack/bolt').AllMiddlewareArgs & import('@slack/bolt').SlackEventMiddlewareArgs<'message'>} args
 * @returns {Promise<void>}
 */
export async function handleMessage({ client, context, event, logger, say, sayStream, setStatus }) {
  // Skip message subtypes (edits, deletes, etc.)
  if (!isGenericMessageEvent(event)) return;

  // Skip bot messages
  if (event.bot_id) return;

  const isDm = event.channel_type === 'im';
  const isThreadReply = !!event.thread_ts;

  if (isDm) {
    // DMs are always handled
  } else if (isThreadReply) {
    // Channel thread replies are handled if the bot is already engaged OR the
    // thread was primed by the Ask Gavel button (MOO-73).
    const replyThreadTs = /** @type {string} */ (event.thread_ts);
    const session = sessionStore.getSession(event.channel, replyThreadTs);
    const prime = primeStore.getSession(event.channel, replyThreadTs);
    if (session === null && prime === null) return;
  } else {
    // Top-level channel messages are handled by app_mentioned
    return;
  }

  try {
    const channelId = event.channel;
    const text = event.text || '';
    const threadTs = event.thread_ts || event.ts;
    const userId = /** @type {string} */ (context.userId);

    // Get session ID for conversation context; a prime (Ask Gavel matter
    // context) is prepended on the first turn only — later turns resume the
    // SDK session, which already carries it.
    const existingSessionId = sessionStore.getSession(channelId, threadTs);
    const prime = existingSessionId ? null : primeStore.getSession(channelId, threadTs);
    const prompt = prime ? `${prime}\n\nUser question: ${text}` : text;

    await setStatus(THINKING_STATUS);

    // Run the agent with deps for tool access
    const deps = { client, userId, channelId, threadTs, messageTs: event.ts, userToken: context.userToken };
    const {
      responseText,
      sessionId: newSessionId,
      receiptBlocks,
    } = await runAgent(prompt, existingSessionId ?? undefined, deps);

    // Stream response in thread; receipts (MOO-75) attach ahead of feedback buttons
    const streamer = sayStream();
    await streamer.append({ markdown_text: responseText });
    const feedbackBlocks = buildFeedbackBlocks();
    await streamer.stop({ blocks: [...(receiptBlocks ?? []), ...feedbackBlocks] });

    // Store session ID for future context
    if (newSessionId) {
      sessionStore.setSession(channelId, threadTs, newSessionId);
    }
  } catch (e) {
    logger.error(`Failed to handle message: ${e}`);
    await say({
      text: `:warning: Something went wrong! (${e})`,
      thread_ts: event.thread_ts || event.ts,
    });
  }
}
