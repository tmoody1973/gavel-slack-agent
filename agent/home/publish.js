import { homeView } from '../blockkit/index.js';
import { buildHomeState } from './state.js';

/**
 * Build + publish the Hybrid App Home for one user. Every failure degrades:
 * state assembly fails → static fallback view; publish fails → log only.
 * Re-used by app_home_opened and by every mutation handler (re-publish).
 */
export async function publishHome({ client, userId }, deps, logger) {
  let view;
  try {
    view = homeView(await buildHomeState(deps));
  } catch (e) {
    logger.error(`App Home state failed, falling back to static view: ${e}`);
    view = staticFallbackView();
  }
  try {
    await client.views.publish({ user_id: userId, view });
  } catch (e) {
    logger.error(`Failed to publish App Home: ${e}`);
  }
}

/** The pre-MOO-74 static Home — kept as the degraded mode, never blank. */
function staticFallbackView() {
  return {
    type: 'home',
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: 'Gavel — Milwaukee civic transparency 🏛️', emoji: true } },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            "I watch Milwaukee city government so your neighborhood doesn't have to. " +
            'I translate agendas, permits, and legislation into plain English and Spanish — *before* the vote.',
        },
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: 'Live data is briefly unavailable — DM me or try again in a minute.' }],
      },
    ],
  };
}
