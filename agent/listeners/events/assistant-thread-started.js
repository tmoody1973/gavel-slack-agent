/**
 * The four prompts Slack renders as one-click chips the moment a thread opens.
 *
 * These are the product's proof, not a menu: each one lands on a different memory — the community's
 * (RTS), the property record (MCP), the spoken record (transcripts), and bilingual generation. A
 * first-time user (or a judge with five minutes) clicks one and immediately sees what Gavel is for.
 * Generic prompts like "what's happening this week?" return a shrug; these return the real thing.
 */
export const SUGGESTED_PROMPTS = [
  { title: 'Did we push back already?', message: "Didn't we already push back on the Midtown Walmart data center?" },
  { title: 'Who owns this parcel?', message: 'Who owns 5825 W Hope Ave?' },
  { title: 'What did they SAY?', message: 'What did the Plan Commission actually call it on June 29?' },
  { title: 'En español', message: '¿Qué significa el proyecto del antiguo Walmart para nuestro barrio?' },
];

/**
 * Handle assistant_thread_started events by setting suggested prompts.
 * @param {import('@slack/bolt').AllMiddlewareArgs & import('@slack/bolt').SlackEventMiddlewareArgs<'assistant_thread_started'>} args
 * @returns {Promise<void>}
 */
export async function handleAssistantThreadStarted({ client, event, logger }) {
  const { channel_id: channelId, thread_ts: threadTs } = event.assistant_thread;

  try {
    await client.assistant.threads.setSuggestedPrompts({
      channel_id: channelId,
      thread_ts: threadTs,
      title: 'Ask Gavel about Milwaukee city government',
      prompts: SUGGESTED_PROMPTS,
    });
  } catch (e) {
    logger.error(`Failed to handle assistant thread started: ${e}`);
  }
}
