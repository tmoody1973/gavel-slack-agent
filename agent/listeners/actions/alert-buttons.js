import { errorReply, historyTimeline } from '../../blockkit/index.js';
import { primeStore } from '../../thread-context/index.js';

/**
 * Real alert-card button handlers (MOO-73, replacing the MOO-44 stubs).
 * Boundaries (Convex + Legistar) are injected so unit tests use fakes:
 * @typedef {{
 *   getDetectedItem: (eventItemId: number) => Promise<object|null>,
 *   getMatter: (matterId: number) => Promise<{fileNumber?: string}>,
 *   getMatterHistory: (matterId: number) => Promise<Array<object>>,
 *   addWatch: (input: {channelId: string, entity: string}) => Promise<unknown>,
 * }} AlertButtonDeps
 */

const GENERIC_ERROR = ':warning: Something went wrong — please try again.';

/** Shared ack → act → ephemeral-on-failure shell. */
function makeHandler(label, act) {
  return async function handle({ ack, body, context, client, logger }) {
    await ack();
    const channelId = /** @type {string} */ (body.channel?.id);
    const userId = /** @type {string} */ (context.userId);
    const cardTs = /** @type {string} */ (body.message?.ts);
    const eventItemId = Number(body.actions?.[0]?.value);
    try {
      await act({ client, channelId, userId, cardTs, eventItemId });
      logger.info(`alert ${label}: eventItemId=${eventItemId} user=${userId}`);
    } catch (e) {
      logger.error(`alert ${label} failed: ${e}`);
      await postEphemeralSafe(client, logger, { channel: channelId, user: userId, text: GENERIC_ERROR });
    }
  };
}

/** The error path must never throw out of a handler. */
async function postEphemeralSafe(client, logger, message) {
  try {
    await client.chat.postEphemeral(message);
  } catch (e) {
    logger.error(`alert ephemeral failed: ${e}`);
  }
}

/** Resolve the watchable name: File #<n> when a matter exists, else the row title. */
async function resolveEntity(deps, row) {
  if (row.matterId) {
    const matter = await deps.getMatter(row.matterId);
    if (matter?.fileNumber) return `File #${matter.fileNumber}`;
  }
  return row.title;
}

async function requireRow(deps, eventItemId) {
  const row = await deps.getDetectedItem(eventItemId);
  if (!row) throw new Error(`no detectedAgendaItems row for eventItemId=${eventItemId}`);
  return row;
}

/**
 * 👁 Watch → real Convex watch on the file number.
 * @param {AlertButtonDeps} deps
 */
export function makeAlertWatch(deps) {
  return makeHandler('watch', async ({ client, channelId, userId, eventItemId }) => {
    const row = await requireRow(deps, eventItemId);
    const entity = await resolveEntity(deps, row);
    await deps.addWatch({ channelId, entity });
    await client.chat.postEphemeral({
      channel: channelId,
      user: userId,
      text: `👁 Watching ${entity} — I’ll alert this channel when it moves.`,
    });
  });
}

/**
 * 🕓 History → live MatterHistory timeline as a thread reply under the card.
 * @param {AlertButtonDeps} deps
 */
export function makeAlertHistory(deps) {
  return makeHandler('history', async ({ client, channelId, userId, cardTs, eventItemId }) => {
    const row = await requireRow(deps, eventItemId);
    if (!row.matterId) {
      const { text } = errorReply('no_matter', {});
      await client.chat.postEphemeral({ channel: channelId, user: userId, text });
      return;
    }
    const [matter, actions] = await Promise.all([deps.getMatter(row.matterId), deps.getMatterHistory(row.matterId)]);
    if (actions.length === 0) {
      const { text } = errorReply('no_history', {});
      await client.chat.postEphemeral({ channel: channelId, user: userId, text });
      return;
    }
    const blocks = historyTimeline({ fileNumber: matter?.fileNumber, actions });
    const fileBit = matter?.fileNumber ? `File #${matter.fileNumber}` : row.title;
    await client.chat.postMessage({
      channel: channelId,
      thread_ts: cardTs,
      text: `🕓 History — ${fileBit}`,
      blocks,
    });
  });
}

/**
 * 💬 Ask Gavel → primed thread under the card; the user types there and
 * message.js engages via the primeStore (no session exists yet).
 * @param {AlertButtonDeps} deps
 */
export function makeAlertAsk(deps) {
  return makeHandler('ask', async ({ client, channelId, cardTs, eventItemId }) => {
    const row = await requireRow(deps, eventItemId);
    let fileNumber;
    if (row.matterId) {
      fileNumber = (await deps.getMatter(row.matterId))?.fileNumber;
    }
    const fileBit = fileNumber ? `File #${fileNumber}` : 'this agenda item';
    const preamble = [
      'CONTEXT (from the alert card the user clicked):',
      fileNumber && `Legislative file: File #${fileNumber}`,
      `Title: ${row.title}`,
      `Committee: ${row.eventBodyName}`,
      row.matterId && `Legistar MatterId: ${row.matterId}`,
      'Answer questions about this item using your civic-record tools.',
    ]
      .filter(Boolean)
      .join('\n');
    primeStore.setSession(channelId, cardTs, preamble);
    await client.chat.postMessage({
      channel: channelId,
      thread_ts: cardTs,
      text: `💬 What would you like to know about ${fileBit}? Reply in this thread and I’ll dig into the record.`,
    });
  });
}
