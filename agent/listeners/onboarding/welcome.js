import { memberWelcomeCard } from '../../blockkit/onboarding.js';
import { copyFor } from '../../onboarding/copy.js';

// Member welcome (MOO-119 FD-C). When a human first joins a configured civic
// channel, post the welcome card once — the dedup is owned by the transactional
// markWelcomePosted mutation (it returns posted:true exactly once per channel), so
// these handlers stay thin. The Ask Gavel / What can you do? buttons reply in the
// card's thread, in the channel's language (carried on the button value).

/** member_joined_channel → post the welcome card once for a configured channel. */
export function makeMemberJoined(deps) {
  return async ({ event, context, client, logger }) => {
    try {
      // Skip Gavel's own join — the welcome is for residents, not the bot.
      if (event.user && context?.botUserId && event.user === context.botUserId) return;
      const result = await deps.markWelcomePosted(event.channel);
      if (!result?.posted) return;
      const card = memberWelcomeCard(result.language ?? 'en');
      await client.chat.postMessage({ channel: event.channel, text: 'Welcome — I’m Gavel', blocks: card.blocks });
    } catch (error) {
      logger.error(`member welcome failed: ${error}`);
    }
  };
}

/** "Ask Gavel" → open a thread under the welcome with a concrete starter prompt. */
export function makeAskGavel() {
  return async ({ ack, body, action, client, logger }) => {
    await ack();
    try {
      const t = copyFor(action.value);
      await client.chat.postMessage({
        channel: body.channel.id,
        thread_ts: body.message.ts,
        text: `${t.memberWelcome}\n\n_${t.transcriptExample}_`,
      });
    } catch (error) {
      logger.error(`ask-gavel reply failed: ${error}`);
    }
  };
}

/** "What can you do?" → threaded reply that surfaces a transcript example. */
export function makeWhatCanYouDo() {
  return async ({ ack, body, action, client, logger }) => {
    await ack();
    try {
      const t = copyFor(action.value);
      await client.chat.postMessage({
        channel: body.channel.id,
        thread_ts: body.message.ts,
        text: `${t.whatCanYouDoBody}\n\n_${t.transcriptExample}_`,
      });
    } catch (error) {
      logger.error(`what-can-you-do reply failed: ${error}`);
    }
  };
}
