const SUGGESTED_PROMPTS = [
  { title: "This week's meetings", message: 'What meetings are coming up at Milwaukee city government this week?' },
  {
    title: 'Look up a file',
    message: "What's happening with a Milwaukee legislative file? I'll give you the file number.",
  },
  {
    title: 'Who represents me?',
    message: 'Who sponsored a matter before the Common Council, and how do I contact them?',
  },
  { title: 'En español', message: '¿Qué decisiones está por tomar el gobierno de Milwaukee esta semana?' },
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
