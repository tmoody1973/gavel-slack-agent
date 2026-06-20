import { addWatchModal, channelConfigModal } from '../../blockkit/index.js';
import { publishHome } from '../../home/publish.js';

const MAX_OPTIONS = 100;

/** ＋ Watch → modal over the subscribed channels. */
export function makeHomeAddWatch(deps) {
  return async ({ ack, body, client, logger }) => {
    await ack();
    try {
      const subscriptions = await deps.listSubscriptions();
      const channels = await Promise.all(
        subscriptions.map(async (s) => ({ channelId: s.channelId, channelName: await safeName(deps, s.channelId) })),
      );
      await client.views.open({ trigger_id: body.trigger_id, view: addWatchModal(channels) });
    } catch (e) {
      logger.error(`home add-watch open failed: ${e}`);
    }
  };
}

/** 👁 Watch on a Discover item (MOO-123) → the add-watch modal, pre-filled with the item. */
export function makeDiscoverWatch(deps) {
  return async ({ ack, body, client, logger }) => {
    await ack();
    try {
      const prefill = body.actions?.[0]?.value ?? '';
      const subscriptions = await deps.listSubscriptions();
      const channels = await Promise.all(
        subscriptions.map(async (s) => ({ channelId: s.channelId, channelName: await safeName(deps, s.channelId) })),
      );
      await client.views.open({ trigger_id: body.trigger_id, view: addWatchModal(channels, prefill) });
    } catch (e) {
      logger.error(`discover watch open failed: ${e}`);
    }
  };
}

/** Edit → per-channel config modal pre-filled from Convex. */
export function makeHomeEditChannel(deps) {
  return async ({ ack, body, client, logger }) => {
    await ack();
    try {
      const channelId = body.actions?.[0]?.value;
      const subscription = await deps.getSubscription(channelId);
      if (!subscription) throw new Error(`no subscription for ${channelId}`);
      await client.views.open({
        trigger_id: body.trigger_id,
        view: channelConfigModal({
          channelId,
          channelName: await safeName(deps, channelId),
          committees: subscription.committees ?? [],
          keywords: subscription.keywords ?? [],
          language: subscription.language ?? 'en',
        }),
      });
    } catch (e) {
      logger.error(`home edit-channel open failed: ${e}`);
    }
  };
}

/** Overflow "Stop watching" → removeWatch → re-publish the Home. */
export function makeHomeWatchRemove(deps) {
  return async ({ ack, body, client, context, logger }) => {
    await ack();
    try {
      const { channelId, entity } = JSON.parse(body.actions?.[0]?.selected_option?.value ?? '{}');
      await deps.removeWatch({ channelId, entity });
      await publishHome({ client, userId: context.userId }, deps, logger);
    } catch (e) {
      logger.error(`home watch-remove failed: ${e}`);
    }
  };
}

/** Committee typeahead for multi_external_select (169 active Milwaukee bodies). */
export function makeCommitteeOptions(deps) {
  return async ({ ack, options, logger }) => {
    try {
      const query = (options?.value ?? '').toLowerCase();
      const names = await deps.listCommitteeNames();
      const matches = names.filter((n) => n.toLowerCase().includes(query)).slice(0, MAX_OPTIONS);
      await ack({ options: matches.map((n) => ({ text: { type: 'plain_text', text: n.slice(0, 75) }, value: n })) });
    } catch (e) {
      logger.error(`home committee options failed: ${e}`);
      await ack({ options: [] });
    }
  };
}

async function safeName(deps, channelId) {
  try {
    return await deps.getChannelName(channelId);
  } catch {
    return channelId;
  }
}
