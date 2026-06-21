// Story-leads rich-view handlers (MOO-130). The App Home 📋 Browse button opens a
// filterable modal; its dropdown re-renders via views.update; each row's overflow either
// stacks the add-watch modal (views.push) or opens a primed Ask-Gavel DM. The carousel's
// 💬 button shares that DM path. Boundaries (Convex/Legistar) are injected for testability.
//
// The DM prime reuses the proven alert-card pattern (primeStore + a context preamble):
// the bot DMs the user, primes that thread, and message.js engages on the user's reply.

import { addWatchModal, storyModal } from '../../blockkit/index.js';
import { decodeFilter } from '../../blockkit/story-modal.js';
import { selectStoryLeads } from '../../stories/leads.js';
import { primeStore } from '../../thread-context/index.js';
import { openDossier } from './dossier-buttons.js';

// The modal is the "show me everything" view, so it pulls a deeper slice than the lean
// Home (≤6). Still tiny in practice (newsworthy items only), well under the block cap.
const MODAL_LEAD_CAP = 40;

/** Fetch the cheap, pure pipeline → ranked leads + the Home's English-default language. */
async function fetchLeads(deps) {
  const [subscriptions, upcoming] = await Promise.all([deps.listSubscriptions(), deps.listUpcoming()]);
  const boundaries = subscriptions.map((s) => s.boundary?.value).filter(Boolean);
  const language = subscriptions.length > 0 && subscriptions.every((s) => s.language === 'es') ? 'es' : 'en';
  const leads = selectStoryLeads(upcoming, { boundaries, cap: MODAL_LEAD_CAP });
  return { leads, language };
}

/** Subscribed channels as {channelId, channelName} for the add-watch picker. */
async function channelList(deps) {
  const subscriptions = await deps.listSubscriptions();
  return Promise.all(
    subscriptions.map(async (s) => ({ channelId: s.channelId, channelName: await safeName(deps, s.channelId) })),
  );
}

async function safeName(deps, channelId) {
  try {
    return await deps.getChannelName(channelId);
  } catch {
    return channelId;
  }
}

const safeParse = (json) => {
  try {
    return JSON.parse(json ?? '{}');
  } catch {
    return {};
  }
};

/** 📋 Browse story leads → open the filterable modal. */
export function makeStoryBrowse(deps) {
  return async ({ ack, body, client, logger }) => {
    await ack();
    try {
      const { leads, language } = await fetchLeads(deps);
      await client.views.open({
        trigger_id: body.trigger_id,
        view: storyModal(leads, { language, filter: { t: 'all' } }),
      });
    } catch (e) {
      logger.error(`story browse open failed: ${e}`);
    }
  };
}

/** Filter dropdown changed → re-slice the leads and re-render via views.update. */
export function makeStoryModalFilter(deps) {
  return async ({ ack, body, client, logger }) => {
    await ack();
    try {
      const filter = decodeFilter(body.actions?.[0]?.selected_option?.value);
      const language = safeParse(body.view?.private_metadata).language ?? 'en';
      const { leads } = await fetchLeads(deps);
      await client.views.update({ view_id: body.view.id, view: storyModal(leads, { language, filter }) });
    } catch (e) {
      logger.error(`story filter update failed: ${e}`);
    }
  };
}

/** Per-row overflow: "w::<id>" → push add-watch modal; "a::<id>" → primed Ask-Gavel DM. */
export function makeStoryLeadOverflow(deps) {
  return async ({ ack, body, context, client, logger }) => {
    await ack();
    try {
      const value = body.actions?.[0]?.selected_option?.value ?? '';
      const [kind, id] = value.split('::');
      const eventItemId = Number(id);
      if (kind === 'b') {
        await openDossier({ body, client, eventItemId, deps, logger });
      } else if (kind === 'w') {
        const row = await deps.getDetectedItem(eventItemId);
        const channels = await channelList(deps);
        await client.views.push({ trigger_id: body.trigger_id, view: addWatchModal(channels, row?.title ?? '') });
      } else if (kind === 'a') {
        const userId = context.userId;
        const { fileBit } = await askGavelDM({ client, userId, eventItemId }, deps);
        await nudgeToDm({ client, channelId: body.channel?.id, userId, fileBit, logger });
      }
    } catch (e) {
      logger.error(`story overflow failed: ${e}`);
    }
  };
}

/** 💬 Ask Gavel button on a carousel card → primed DM keyed on the eventItemId. */
export function makeStoryAsk(deps) {
  return async ({ ack, body, context, client, logger }) => {
    await ack();
    try {
      const userId = body.user?.id ?? context.userId;
      const eventItemId = Number(body.actions?.[0]?.value);
      const { fileBit } = await askGavelDM({ client, userId, eventItemId }, deps);
      await nudgeToDm({ client, channelId: body.channel?.id, userId, fileBit, logger });
    } catch (e) {
      logger.error(`story ask failed: ${e}`);
    }
  };
}

/**
 * Open a DM, post an item-scoped invite, and prime that thread so the reporter's reply
 * is answered with the civic-record tools in context. Mirrors makeAlertAsk, but in a DM
 * (the Home/modal/carousel have no card thread to prime).
 */
async function askGavelDM({ client, userId, eventItemId }, deps) {
  const row = await deps.getDetectedItem(eventItemId);
  if (!row) throw new Error(`no detected row for eventItemId=${eventItemId}`);

  let fileNumber;
  if (row.matterId) fileNumber = (await deps.getMatter(row.matterId))?.fileNumber;
  const fileBit = fileNumber ? `File #${fileNumber}` : 'this agenda item';
  const preamble = [
    'CONTEXT (from the Story leads card the user clicked):',
    fileNumber && `Legislative file: File #${fileNumber}`,
    `Title: ${row.title}`,
    `Committee: ${row.eventBodyName}`,
    row.matterId && `Legistar MatterId: ${row.matterId}`,
    'Answer questions about this item using your civic-record tools.',
  ]
    .filter(Boolean)
    .join('\n');

  const dm = await client.conversations.open({ users: userId });
  const dmChannel = dm.channel?.id;
  const posted = await client.chat.postMessage({
    channel: dmChannel,
    text: `💬 Ask me anything about ${fileBit} — *reply in this thread* and I’ll dig into the public record.`,
  });
  primeStore.setSession(dmChannel, posted.ts, preamble);
  return { dmChannel, fileBit };
}

/**
 * Tell the user — at the click site — that the conversation moved to a DM. Ask Gavel
 * acts on a different surface (the bot's DM), so without this the click looks dead in
 * the channel/carousel. Best-effort: a failed nudge must never sink the (working) DM.
 */
async function nudgeToDm({ client, channelId, userId, fileBit, logger }) {
  if (!channelId) return; // modal context has no channel to post an ephemeral into
  try {
    await client.chat.postEphemeral({
      channel: channelId,
      user: userId,
      text: `💬 I opened a DM about ${fileBit} — check your messages with *Gavel* and reply there and I’ll dig into the record.`,
    });
  } catch (e) {
    logger.error(`story ask nudge failed: ${e}`);
  }
}
