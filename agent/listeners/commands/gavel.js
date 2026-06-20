import { growWatchlistPrompt } from '../../blockkit/grow.js';
import { storyLeadCards } from '../../blockkit/index.js';
import { composeLeadAngles, filterByCommitteeOrTopic, selectStoryLeads } from '../../stories/leads.js';
import { isConfigured, nudgeResponse } from '../onboarding/nudge.js';

const KNOWN_SUBCOMMANDS = ['watch', 'unwatch', 'status', 'digest', 'stories'];

const STORY_LEAD_CAP = 5;

const STORIES_COPY = {
  en: {
    status: '🔎 Digging through this week’s agenda for story leads…',
    empty: (label) =>
      `📰 No story leads jumped out for *${label}* this week — try \`/gavel stories\` for the whole agenda.`,
  },
  es: {
    status: '🔎 Revisando la agenda de esta semana en busca de pistas de reportaje…',
    empty: (label) =>
      `📰 No surgieron pistas de reportaje para *${label}* esta semana — prueba \`/gavel stories\` para toda la agenda.`,
  },
};

const HELP_TEXT = [
  '*Gavel commands*',
  '• `/gavel watch <entity>` — alert this channel when a file number, address, or name appears',
  '• `/gavel stories [committee|topic]` — ranked story leads on the upcoming agenda (for reporters)',
  '• `/gavel status` — show this channel’s committees, keywords, language, and watches',
  '• `/gavel unwatch <entity>` — stop watching (names as shown in `/gavel status`)',
  '• `/gavel digest` — weekly digest _(coming in Phase 3)_',
].join('\n');

/**
 * Parse the free text after `/gavel` into a subcommand + its arguments.
 * Unknown or empty input maps to `help`. Pure.
 * @param {string} text
 * @returns {{ subcommand: 'watch' | 'unwatch' | 'status' | 'digest' | 'stories' | 'help', args: string }}
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
    // Story Radar (MOO-127) is the one subcommand that affords LLM latency: it acks,
    // posts a "digging…" status, then enriches + writes grounded angles and posts again.
    if (subcommand === 'stories') {
      await runStories({ args, channelId, respond }, deps);
      return;
    }

    // First touch: a bare `/gavel` in a channel that hasn't finished onboarding
    // surfaces the Set up Gavel nudge (with the command list kept below it). Honor
    // an existing channel-language preference when one is already on record.
    if (subcommand === 'help') {
      const subscription = await deps.getSubscription(channelId);
      if (!isConfigured(subscription)) {
        await respond(nudgeResponse(subscription?.language ?? 'en', HELP_TEXT));
        return;
      }
    }
    const result = await runSubcommand({ subcommand, args, channelId }, deps);
    const message = typeof result === 'string' ? { text: result } : result;
    await respond({ response_type: 'ephemeral', ...message });
  } catch (err) {
    logger?.error?.(`/gavel ${subcommand} failed: ${err.message}`);
    await respond({ response_type: 'ephemeral', text: ':warning: Something went wrong — please try again.' });
  }
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

/**
 * `/gavel stories [committee|topic]` — on-demand ranked story leads (MOO-127).
 * Posts a status line first, then the leads with grounded angles. Heavy deps
 * (Legistar enrichment + Claude) are injected, so this stays unit-testable.
 *
 * @param {{ args: string, channelId: string, respond: Function }} ctx
 * @param {{
 *   getSubscription: (channelId: string) => Promise<object|null>,
 *   listUpcoming: () => Promise<Array<object>>,
 *   listMembers: () => Promise<Array<object>>,
 *   enrichLead: (item: object) => Promise<object>,
 *   generateAngle: (input: {system: string, prompt: string}) => Promise<any>,
 *   countTranscript?: (eventId: number) => Promise<number>,
 * }} deps
 */
async function runStories({ args, channelId, respond }, deps) {
  const subscription = await deps.getSubscription(channelId);
  const language = subscription?.language === 'es' ? 'es' : 'en';
  const copy = STORIES_COPY[language];
  await respond({ response_type: 'ephemeral', text: copy.status });

  const boundaries = [subscription?.boundary?.value].filter(Boolean);
  const upcoming = await deps.listUpcoming();
  const { items, label } = filterByCommitteeOrTopic(upcoming, args);
  const leads = selectStoryLeads(items, { boundaries, cap: STORY_LEAD_CAP });
  if (leads.length === 0) {
    await respond({ response_type: 'ephemeral', replace_original: false, text: copy.empty(label) });
    return;
  }

  const members = await deps.listMembers();
  const composed = await composeLeadAngles(leads, {
    enrich: deps.enrichLead,
    generate: deps.generateAngle,
    members,
    language,
    countTranscript: deps.countTranscript,
  });
  await respond({
    response_type: 'ephemeral',
    replace_original: false,
    text: `📰 Story leads — ${label}`,
    blocks: storyLeadCards(composed, { label, language }),
  });
}

async function runWatch({ args, channelId }, deps) {
  const entity = args.trim();
  if (!entity) {
    return 'Usage: `/gavel watch <entity>` — e.g. `/gavel watch 2000 S 13th St` or `/gavel watch File #260229`.';
  }
  await deps.addWatch({ channelId, entity });
  const text = `👁 Watching *${entity}* — I’ll alert this channel when it shows up in the official record.`;

  // FD-D adaptive growth: the *first* watch on a channel proposes a dedicated
  // #gavel-watchlist (a nudge + How → checklist). Subsequent watches stay plain.
  const watches = await deps.listWatches(channelId);
  if (watches.length === 1) {
    const subscription = await deps.getSubscription(channelId);
    const prompt = growWatchlistPrompt(subscription?.language ?? 'en');
    return { text, blocks: [{ type: 'section', text: { type: 'mrkdwn', text } }, ...prompt.blocks] };
  }
  return text;
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
