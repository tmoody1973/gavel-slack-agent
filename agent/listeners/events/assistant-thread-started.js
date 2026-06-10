/** Persona-cut suggested prompts (MOO-75): Denise · Marcos (ES) · Rachel · watch-flavored. */
export const SUGGESTED_PROMPTS = [
  { title: 'My neighborhood this week', message: "What's happening near my neighborhood this week?" },
  { title: 'En español', message: '¿Qué decisiones está por tomar la ciudad esta semana?' },
  { title: 'Vote record', message: 'Show me the vote record on a file' },
  { title: "This channel's watches", message: "What's new on the things this channel watches?" },
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
