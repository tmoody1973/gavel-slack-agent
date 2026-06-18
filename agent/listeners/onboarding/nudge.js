import { nudgeCard } from '../../blockkit/onboarding.js';

// The active onboarding trigger (MOO-118 FD-B, lean scope). A bare `/gavel` in a
// channel that hasn't completed setup answers with the "Set up Gavel" nudge
// instead of a bare command list — the on-demand path into the modal flow. (The
// App Home first-run state is the passive fallback; the member_joined_channel /
// bot-add trigger is deferred to FD-C.)

/** True once a channel has finished onboarding (configured === true). Pure. */
export function isConfigured(subscription) {
  return Boolean(subscription?.configured);
}

/**
 * Ephemeral nudge response: the Set up Gavel card, with the command list kept
 * below it as a fallback so power users who already know the commands aren't lost.
 *
 * @param {'en'|'es'} language
 * @param {string} [helpText] - the `/gavel` help block to append under the nudge
 * @returns {{ response_type: 'ephemeral', text: string, blocks: object[] }}
 */
export function nudgeResponse(language, helpText) {
  const blocks = [...nudgeCard(language).blocks];
  if (helpText) {
    blocks.push({ type: 'divider' }, { type: 'section', text: { type: 'mrkdwn', text: helpText } });
  }
  return { response_type: 'ephemeral', text: helpText ?? 'Set up Gavel', blocks };
}
