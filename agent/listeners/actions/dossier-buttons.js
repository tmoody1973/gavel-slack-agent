// Reporter-dossier handlers (MOO-129). The Story-leads overflow "📋 Brief me" opens the dossier
// modal (stacked); from it, 👁 Watch pushes the channel-picker and 📨 Send-it-to-me DMs the brief.
// Assembly + rendering live in stories/dossier.js + blockkit/dossier-modal.js; these are thin glue.
// Boundaries are injected (the actions/index.js pattern) for testability.

import { addWatchModal, dossierModal } from '../../blockkit/index.js';
import { assembleDossier } from '../../stories/dossier.js';

/** All-Spanish channels → es, else en (the App Home / story-modal default). */
async function resolveLanguage(deps) {
  const subscriptions = await deps.listSubscriptions();
  return subscriptions.length > 0 && subscriptions.every((s) => s.language === 'es') ? 'es' : 'en';
}

/** Subscribed channels as {channelId, channelName} for the add-watch picker. */
async function channelList(deps) {
  const subscriptions = await deps.listSubscriptions();
  return Promise.all(
    subscriptions.map(async (s) => ({
      channelId: s.channelId,
      channelName: await deps.getChannelName(s.channelId).catch(() => s.channelId),
    })),
  );
}

/** Resolve eventItemId → an assembled dossier (or null when the row is gone). */
async function dossierFor(eventItemId, deps) {
  const row = await deps.getDetectedItem(eventItemId);
  if (!row) return null;
  const language = await resolveLanguage(deps);
  return assembleDossier(row, { ...deps, language });
}

/** Open the dossier modal, stacked on the story-leads modal (from the 'b::<id>' overflow). */
export async function openDossier({ body, client, eventItemId, deps, logger }) {
  try {
    const dossier = await dossierFor(eventItemId, deps);
    if (!dossier) return;
    await client.views.push({
      trigger_id: body.trigger_id,
      view: dossierModal(dossier, { language: dossier.language }),
    });
  } catch (e) {
    logger?.error?.(`dossier open failed: ${e}`);
  }
}

/** 👁 Watch from the dossier → push the channel-picker, prefilled with the file number/title. */
export function makeDossierWatch(deps) {
  return async ({ ack, body, client, logger }) => {
    await ack();
    try {
      const eventItemId = Number(body.actions?.[0]?.value);
      const row = await deps.getDetectedItem(eventItemId);
      let entity = row?.title ?? '';
      if (row?.matterId) {
        const matter = await deps.getMatter(row.matterId).catch(() => null);
        if (matter?.fileNumber) entity = `File #${matter.fileNumber}`;
      }
      const channels = await channelList(deps);
      await client.views.push({ trigger_id: body.trigger_id, view: addWatchModal(channels, entity) });
    } catch (e) {
      logger.error(`dossier watch failed: ${e}`);
    }
  };
}

/** 📨 Send it to me → DM the brief (the modal blocks, minus the action row). */
export function makeDossierSend(deps) {
  return async ({ ack, body, context, client, logger }) => {
    await ack();
    try {
      const eventItemId = Number(body.actions?.[0]?.value);
      const userId = body.user?.id ?? context.userId;
      const dossier = await dossierFor(eventItemId, deps);
      if (!dossier) return;
      const view = dossierModal(dossier, { language: dossier.language });
      const dm = await client.conversations.open({ users: userId });
      await client.chat.postMessage({
        channel: dm.channel?.id,
        text: `📋 Story brief — ${(dossier.item?.title ?? '').slice(0, 120)}`,
        blocks: view.blocks.filter((b) => b.type !== 'actions'),
      });
      if (body.channel?.id) {
        await client.chat
          .postEphemeral({ channel: body.channel.id, user: userId, text: '📨 I sent the brief to your DMs.' })
          .catch(() => {});
      }
    } catch (e) {
      logger.error(`dossier send failed: ${e}`);
    }
  };
}
