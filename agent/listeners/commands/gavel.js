import { parcelCard } from '../../blockkit/index.js';

const KNOWN_SUBCOMMANDS = ['watch', 'unwatch', 'status', 'digest', 'parcel'];

const HELP_TEXT = [
  '*Gavel commands*',
  '• `/gavel parcel <address>` — look up a property (owner, zoning, lot size); bare opens a form',
  '• `/gavel watch <entity>` — alert this channel when a file number, address, or name appears',
  '• `/gavel status` — show this channel’s committees, keywords, language, and watches',
  '• `/gavel unwatch <entity>` — stop watching (names as shown in `/gavel status`)',
  '• `/gavel digest` — weekly digest _(coming in Phase 3)_',
].join('\n');

/**
 * Parse the free text after `/gavel` into a subcommand + its arguments.
 * Unknown or empty input maps to `help`. Pure.
 * @param {string} text
 * @returns {{ subcommand: 'watch' | 'unwatch' | 'status' | 'digest' | 'help', args: string }}
 */
export function parseGavelCommand(text) {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return { subcommand: 'help', args: '' };
  const [head, ...rest] = trimmed.split(/\s+/);
  const subcommand = head.toLowerCase();
  if (!KNOWN_SUBCOMMANDS.includes(subcommand)) return { subcommand: 'help', args: '' };
  return { subcommand: /** @type {any} */ (subcommand), args: rest.join(' ') };
}

/**
 * Handle `/gavel` — the no-App-Home config surface (MOO-46). Always acks
 * first and replies ephemerally. Convex boundaries are injected for tests.
 *
 * @param {{ command: {text: string, channel_id: string}, ack: Function, respond: Function, logger?: {error: Function} }} args
 * @param {{
 *   addWatch: (input: {channelId: string, entity: string}) => Promise<unknown>,
 *   getSubscription: (channelId: string) => Promise<object|null>,
 *   listWatches: (channelId: string) => Promise<Array<{entity: string}>>,
 *   removeWatch: (input: {channelId: string, entity: string}) => Promise<unknown|null>,
 * }} deps
 * @returns {Promise<void>}
 */
export async function handleGavelCommand({ command, ack, respond, logger }, deps) {
  await ack();
  const { subcommand, args } = parseGavelCommand(command.text);
  const channelId = command.channel_id;

  try {
    if (subcommand === 'parcel') {
      await runParcel({ args, triggerId: command.trigger_id }, deps, respond);
      return;
    }
    const text = await runSubcommand({ subcommand, args, channelId }, deps);
    await respond({ response_type: 'ephemeral', text });
  } catch (err) {
    logger?.error?.(`/gavel ${subcommand} failed: ${err.message}`);
    await respond({ response_type: 'ephemeral', text: ':warning: Something went wrong — please try again.' });
  }
}

/** `/gavel parcel <address>` → ephemeral property card; bare → open the lookup modal. */
async function runParcel({ args, triggerId }, deps, respond) {
  const address = args.trim();
  if (!address) {
    await deps.openLookupModal(triggerId);
    return;
  }
  let parcel = null;
  try {
    parcel = await deps.lookupParcel(address);
  } catch {
    parcel = null; // unparseable address → treat as not found
  }
  if (!parcel) {
    await respond({
      response_type: 'ephemeral',
      text: `No Milwaukee parcel found for *${address}* — check the spelling and the N/S/E/W direction.`,
    });
    return;
  }
  await respond({ response_type: 'ephemeral', text: `🏠 ${parcel.address}`, blocks: parcelCard(parcel) });
}

async function runSubcommand({ subcommand, args, channelId }, deps) {
  switch (subcommand) {
    case 'watch':
      return runWatch({ args, channelId }, deps);
    case 'status':
      return runStatus(channelId, deps);
    case 'unwatch':
      return runUnwatch({ args, channelId }, deps);
    case 'digest':
      return 'The weekly digest is coming in Phase 3.';
    default:
      return HELP_TEXT;
  }
}

async function runWatch({ args, channelId }, deps) {
  const entity = args.trim();
  if (!entity) {
    return 'Usage: `/gavel watch <entity>` — e.g. `/gavel watch 2000 S 13th St` or `/gavel watch File #260229`.';
  }
  await deps.addWatch({ channelId, entity });
  return `👁 Watching *${entity}* — I’ll alert this channel when it shows up in the official record.`;
}

async function runUnwatch({ args, channelId }, deps) {
  const entity = args.trim();
  if (!entity) {
    return 'Usage: `/gavel unwatch <entity>` — exactly as it appears in `/gavel status`.';
  }
  const removed = await deps.removeWatch({ channelId, entity });
  if (!removed) {
    return `This channel isn’t watching *${entity}*. Check \`/gavel status\` for the exact name.`;
  }
  return `🚫 No longer watching *${entity}*.`;
}

async function runStatus(channelId, deps) {
  const [subscription, watches] = await Promise.all([deps.getSubscription(channelId), deps.listWatches(channelId)]);
  if (!subscription) {
    return 'This channel is not configured yet — no subscription found. Alerts will not post here until one is set up.';
  }
  const watchList = watches.length > 0 ? watches.map((w) => `• ${w.entity}`).join('\n') : '_none_';
  return [
    '*Gavel status for this channel*',
    `🏛 Committees: ${formatList(subscription.committees)}`,
    `🔑 Keywords: ${formatList(subscription.keywords)}`,
    `🌐 Language: ${subscription.language === 'es' ? 'Español (bilingual cards)' : 'English'}`,
    `👁 Watches:\n${watchList}`,
  ].join('\n');
}

function formatList(values) {
  return values && values.length > 0 ? values.join(', ') : '_none_';
}
