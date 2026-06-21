// Help-modal handlers (MOO-152). The role switcher re-renders the static modal via
// views.update; the App Home "❓ How Gavel works" button opens it, defaulting to the
// user's most capability-rich role across their channels. Mirrors video-buttons.js:
// pure builder (help-modal.js), boundaries injected for testability.

import { helpModal } from '../../blockkit/help-modal.js';
import { primaryRole } from '../../help/guide.js';

const safeParse = (json) => {
  try {
    return JSON.parse(json ?? '{}');
  } catch {
    return {};
  }
};

/**
 * A persona switch button (`help_role:<role>`) → re-render the modal for that role,
 * preserving the chosen language. Pure update, no network beyond Slack.
 */
export function makeHelpRoleSwitch() {
  return async ({ ack, body, client, logger }) => {
    await ack();
    try {
      const role = body.actions?.[0]?.value ?? 'association';
      const language = safeParse(body.view?.private_metadata).language ?? 'en';
      await client.views.update({ view_id: body.view.id, view: helpModal({ role, language }) });
    } catch (e) {
      logger?.error?.(`help role switch failed: ${e}`);
    }
  };
}

/**
 * App Home "❓ How Gavel works" → open the help modal. The Home is cross-channel, so
 * default to the user's primary role (reporter > organizer > association) and to Spanish
 * only when every subscribed channel is Spanish — matching the Home's own language rule.
 * @param {{ listSubscriptions: () => Promise<Array<{role?:string, language?:string}>> }} deps
 */
export function makeHomeHelp(deps) {
  return async ({ ack, body, client, logger }) => {
    await ack();
    try {
      const subscriptions = await deps.listSubscriptions();
      const role = primaryRole(subscriptions.map((s) => s.role).filter(Boolean));
      const language = subscriptions.length > 0 && subscriptions.every((s) => s.language === 'es') ? 'es' : 'en';
      await client.views.open({ trigger_id: body.trigger_id, view: helpModal({ role, language }) });
    } catch (e) {
      logger?.error?.(`home help open failed: ${e}`);
    }
  };
}
