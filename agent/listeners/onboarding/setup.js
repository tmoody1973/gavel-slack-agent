import { growAreasBlocks } from '../../blockkit/grow.js';
import { confirmModal, roleModal } from '../../blockkit/onboarding.js';
import { publishHome } from '../../home/publish.js';
import { copyFor } from '../../onboarding/copy.js';
import { defaultsForRole } from '../../onboarding/defaults.js';
import { committeesAndKeywordsForTopics } from '../../onboarding/topics.js';

// The 2-taps-to-live setup flow (MOO-118 FD-B). Three thin I/O handlers over the
// pure builders + the role→defaults engine: open the role modal, push the
// pre-filled confirm modal, then on "Go live" write the channel config to Convex,
// republish the Home, and post the live confirmation. Convex boundaries are
// injected (deps) so these test against mocks, never the real database.

/** The channel the nudge fired in, when the button came from a channel message. */
function channelFromButton(body) {
  return body?.channel?.id ?? null;
}

/**
 * Button "Set up Gavel" → open View 1 (role question), carrying channel context.
 * The role modal is rendered in English: language is a per-role default that isn't
 * known until the user picks a role on this very screen, so the confirm modal (the
 * first language-bearing surface) switches to the role's language. The earlier
 * `/gavel` nudge already honors an existing channel's language.
 */
export function makeOpenRoleModal(_deps) {
  return async ({ ack, body, client, logger }) => {
    await ack();
    try {
      const view = roleModal('en');
      view.private_metadata = JSON.stringify({ channelId: channelFromButton(body) });
      await client.views.open({ trigger_id: body.trigger_id, view });
    } catch (error) {
      logger.error(`onboarding open role modal failed: ${error}`);
    }
  };
}

/** Role button → push View 2 (confirm), pre-filled from defaultsForRole(role). */
export function makeOpenConfirmModal(_deps) {
  return async ({ ack, body, action, client, logger }) => {
    await ack();
    try {
      const role = action.value;
      const defaults = defaultsForRole(role);
      const channelId = readChannelId(body.view?.private_metadata);
      const view = confirmModal(role, defaults, defaults.language, channelId);
      await client.views.push({ trigger_id: body.trigger_id, view });
    } catch (error) {
      logger.error(`onboarding open confirm modal failed: ${error}`);
    }
  };
}

/** "Go live" submit → upsert the channel config, republish Home, post confirmation. */
export function makeGoLiveSubmit(deps) {
  return async ({ ack, body, view, client, logger }) => {
    // Parse defensively: a missing/truncated private_metadata must still ack (a
    // bare throw here would leave Slack hanging with no response_action).
    let role;
    let defaults;
    let metaChannelId;
    try {
      ({ role, defaults, channelId: metaChannelId } = JSON.parse(view.private_metadata));
    } catch {
      await ack({
        response_action: 'errors',
        errors: { onboarding_channel: 'Setup session expired — please start again from /gavel.' },
      });
      return;
    }
    const channelId =
      view.state?.values?.onboarding_channel?.onboarding_channel_select?.selected_conversation ?? metaChannelId ?? null;

    if (!channelId) {
      await ack({
        response_action: 'errors',
        errors: { onboarding_channel: 'Pick the channel where Gavel should post alerts.' },
      });
      return;
    }
    await ack();

    // MOO-121: the citizen picks plain-language topic chips; Go-live writes the union
    // of their committees + keywords. Fall back to the role defaults only when the
    // chips block is absent (an older modal), so the write is always meaningful.
    const { committees, keywords } = subscriptionFromTopics(view, defaults);

    try {
      await deps.upsertSubscription({
        channelId,
        committees,
        keywords,
        language: defaults.language,
        role,
        configured: true,
        onboardedAt: Date.now(),
      });
      await publishHome({ client, userId: body.user.id }, deps, logger);
      await postLiveConfirmation({ client, channelId, userId: body.user.id, language: defaults.language, logger });
      // FD-D: organizers cover multiple neighborhoods — propose per-area channels.
      if (role === 'organizer') {
        await client.chat.postMessage({
          channel: channelId,
          text: 'Covering more than one neighborhood?',
          blocks: growAreasBlocks(defaults.language),
        });
      }
    } catch (error) {
      logger.error(`onboarding go-live submit failed: ${error}`);
    }
  };
}

/** Post the "you're live" line in the channel; DM the installer if posting is blocked. */
async function postLiveConfirmation({ client, channelId, userId, language, logger }) {
  const t = copyFor(language);
  try {
    await client.chat.postMessage({ channel: channelId, text: t.liveConfirmation });
  } catch (postError) {
    logger.error(`live confirmation post failed (missing scope?): ${postError}`);
    await client.chat.postMessage({
      channel: userId,
      text: `${t.liveConfirmation}\n(Add me with \`/invite @Gavel\` in that channel so I can post there.)`,
    });
  }
}

/**
 * The committees/keywords to write on Go-live. The topic chips are the source of
 * truth when present (map the selected keys → their union); the role defaults are
 * the fallback when the chips block didn't render (an older confirm modal).
 *
 * @param {{ state?: { values?: object } }} view
 * @param {{ committees: string[], keywords: string[] }} defaults
 * @returns {{ committees: string[], keywords: string[] }}
 */
function subscriptionFromTopics(view, defaults) {
  const selected = view.state?.values?.onboarding_topics_block?.onboarding_topics?.selected_options;
  if (!Array.isArray(selected)) {
    return { committees: defaults.committees, keywords: defaults.keywords };
  }
  return committeesAndKeywordsForTopics(selected.map((option) => option.value));
}

function readChannelId(metadata) {
  if (!metadata) return null;
  try {
    return JSON.parse(metadata).channelId ?? null;
  } catch {
    return null;
  }
}
