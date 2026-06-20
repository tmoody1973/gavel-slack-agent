import { pickSampleItem } from '../../alerts/sample.js';
import { growAreasBlocks } from '../../blockkit/grow.js';
import { confirmModal, roleModal } from '../../blockkit/onboarding.js';
import { sampleAlertCard } from '../../blockkit/sample-alert.js';
import { districtForNeighborhood, neighborhoodChoices } from '../../geo/neighborhoods.js';
import { publishHome } from '../../home/publish.js';
import { copyFor } from '../../onboarding/copy.js';
import { defaultsForRole } from '../../onboarding/defaults.js';
import { committeesAndKeywordsForTopics } from '../../onboarding/topics.js';

// Slack returns at most 100 options per external_select query; the picker is over
// the 190-neighborhood list (MOO-131), so cap defensively.
const MAX_NEIGHBORHOOD_OPTIONS = 100;

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
    // MOO-131: the optional neighborhood picker resolves to the district boundary.
    const boundary = boundaryFromNeighborhood(view);
    // MOO-122: the sample alert teaches a brand-new channel by example — gate on
    // first-configure (no prior subscription) so a re-run doesn't repost it.
    const firstConfigure = await isFirstConfigure(deps, channelId);

    try {
      await deps.upsertSubscription({
        channelId,
        committees,
        keywords,
        language: defaults.language,
        role,
        configured: true,
        onboardedAt: Date.now(),
        ...(boundary ? { boundary } : {}),
      });
      await publishHome({ client, userId: body.user.id }, deps, logger);
      await postLiveConfirmation({ client, channelId, userId: body.user.id, language: defaults.language, logger });
      // MOO-122: "show, don't tell" — right after the confirmation, post one real
      // matching upcoming item (or a graceful one-liner) so the citizen sees what an
      // alert looks like and learns the 👁 Watch affordance.
      if (firstConfigure) {
        await postSampleAlert({ client, channelId, committees, keywords, language: defaults.language, deps, logger });
      }
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

/**
 * True only when this Go-live is the channel's first configure (no prior
 * subscription row). The gate keeps the sample alert from reposting when a user
 * re-runs setup to change topics. Defensive: a missing dep or read error → false
 * (skip the sample) so it can never block or duplicate the live confirmation.
 */
async function isFirstConfigure(deps, channelId) {
  if (typeof deps.getSubscription !== 'function') return false;
  try {
    return !(await deps.getSubscription(channelId));
  } catch {
    return false;
  }
}

/**
 * Post the "show, don't tell" sample: the soonest real upcoming item that matches
 * the new config, as a card with a working 👁 Watch button — or a graceful one-liner
 * when nothing matches. Wrapped so a failure never breaks Go-live (the confirmation
 * is already sent).
 */
async function postSampleAlert({ client, channelId, committees, keywords, language, deps, logger }) {
  try {
    const upcoming = typeof deps.listUpcoming === 'function' ? await deps.listUpcoming() : [];
    const item = pickSampleItem(upcoming, { channelId, committees, keywords });
    if (item) {
      const card = sampleAlertCard(item, language);
      await client.chat.postMessage({ channel: channelId, text: card.text, blocks: card.blocks });
    } else {
      await client.chat.postMessage({ channel: channelId, text: copyFor(language).sampleNone });
    }
  } catch (error) {
    logger.error(`onboarding sample alert failed: ${error}`);
  }
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

/**
 * Resolve the optional neighborhood pick to a district boundary, or null when the
 * citizen skipped it (or the name doesn't resolve — defensive, the picker only
 * offers canonical names). Single district per channel (MOO-131).
 * @param {{ state?: { values?: object } }} view
 * @returns {{ type: 'district', value: string } | null}
 */
function boundaryFromNeighborhood(view) {
  const name = view.state?.values?.onboarding_neighborhood_block?.onboarding_neighborhood?.selected_option?.value;
  const district = districtForNeighborhood(name);
  return district != null ? { type: 'district', value: String(district) } : null;
}

/**
 * Typeahead for the onboarding neighborhood external_select (MOO-131). Filters the
 * 190-neighborhood list by the query and labels each with its district so the citizen
 * sees the mapping ("Riverwest · District 3"). The option value is the neighborhood
 * name, which Go-live resolves to the boundary. Never throws — acks an empty list.
 */
export function makeNeighborhoodOptions() {
  return async ({ ack, options, logger }) => {
    try {
      const query = (options?.value ?? '').toLowerCase();
      const matches = neighborhoodChoices()
        .filter((choice) => choice.name.toLowerCase().includes(query))
        .slice(0, MAX_NEIGHBORHOOD_OPTIONS);
      await ack({
        options: matches.map((choice) => ({
          text: { type: 'plain_text', text: `${choice.name} · District ${choice.district}`.slice(0, 75) },
          value: choice.name.slice(0, 75),
        })),
      });
    } catch (error) {
      logger.error(`onboarding neighborhood options failed: ${error}`);
      await ack({ options: [] });
    }
  };
}
