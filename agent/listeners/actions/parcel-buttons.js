/**
 * Parcel-card button handlers (MOO-110). The "Add to watchlist" button on a
 * parcel receipt carries the address as its value; this stores a channel-scoped
 * watch via Convex. The map button (parcel_open_map) is a URL button — Slack
 * opens the link, but Bolt still dispatches an interaction that must be acked
 * (registered in index.js). Convex boundaries are injected for unit tests.
 * @typedef {{ addWatch: (input: {channelId: string, entity: string}) => Promise<unknown> }} ParcelButtonDeps
 */

const GENERIC_ERROR = ':warning: Something went wrong — please try again.';

/** The error path must never throw out of a handler. */
async function postEphemeralSafe(client, logger, message) {
  try {
    await client.chat.postEphemeral(message);
  } catch (e) {
    logger.error(`parcel ephemeral failed: ${e}`);
  }
}

/**
 * 👁 Add to watchlist → real channel-scoped Convex watch on the parcel address.
 * @param {ParcelButtonDeps} deps
 */
export function makeParcelWatch(deps) {
  return async function handle({ ack, body, context, client, logger }) {
    await ack();
    const channelId = /** @type {string} */ (body.channel?.id);
    const userId = /** @type {string} */ (context.userId);
    try {
      const entity = (body.actions?.[0]?.value ?? '').trim();
      if (!entity) throw new Error('parcel_watch button carried no address');
      await deps.addWatch({ channelId, entity });
      logger.info(`parcel watch: entity="${entity}" channel=${channelId} user=${userId}`);
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: `👁 Watching ${entity} — I’ll alert this channel when it shows up in the official record.`,
      });
    } catch (e) {
      logger.error(`parcel watch failed: ${e}`);
      await postEphemeralSafe(client, logger, { channel: channelId, user: userId, text: GENERIC_ERROR });
    }
  };
}
