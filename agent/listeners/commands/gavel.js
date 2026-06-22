import { growWatchlistPrompt } from '../../blockkit/grow.js';
import {
  helpModal,
  meetingVideoSection,
  storyCarousel,
  storyLeadCards,
  tagSearchable,
  videoModal,
} from '../../blockkit/index.js';
import {
  buildFederatedResultsCard,
  normalizeAgenda,
  normalizeMail,
  normalizeMinutes,
  normalizeZoning,
} from '../../civicmail/federated-card.js';
import { mergeSearchResults, parseSearchTerm, refineResults } from '../../civicmail/search-filter.js';
import { composeLeadAngles, filterByCommitteeOrTopic, selectStoryLeads } from '../../stories/leads.js';
import { isConfigured, nudgeResponse } from '../onboarding/nudge.js';

const KNOWN_SUBCOMMANDS = ['watch', 'unwatch', 'status', 'digest', 'stories', 'video', 'search'];

// Fetch a wide candidate set from Convex (recall), then refine to true matches
// (precision) before the card caps the display — so quoted/multi-word queries don't
// show OR-noise.
const SEARCH_CANDIDATE_LIMIT = 40;
const SEARCH_RESULT_LIMIT = 12;
const PER_SOURCE_LIMIT = 4;

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
  '• `/gavel search <term>` — search the city mail (addresses, owners, license types, record #s)',
  '• `/gavel stories [committee|topic]` — ranked story leads on the upcoming agenda (for reporters)',
  '• `/gavel video [committee]` — browse recent meeting video you can watch (and search)',
  '• `/gavel status` — show this channel’s committees, keywords, language, and watches',
  '• `/gavel unwatch <entity>` — stop watching (names as shown in `/gavel status`)',
  '• `/gavel digest` — weekly digest _(coming in Phase 3)_',
].join('\n');

/**
 * Parse the free text after `/gavel` into a subcommand + its arguments.
 * Unknown or empty input maps to `help`. Pure.
 * @param {string} text
 * @returns {{ subcommand: 'watch' | 'unwatch' | 'status' | 'digest' | 'stories' | 'video' | 'help', args: string }}
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
export async function handleGavelCommand({ command, ack, respond, client, body, logger }, deps) {
  await ack();
  const { subcommand, args } = parseGavelCommand(command.text);
  const channelId = command.channel_id;

  try {
    // Story Radar (MOO-127) is the one subcommand that affords LLM latency: it acks,
    // posts a "digging…" status, then enriches + writes grounded angles and posts again.
    if (subcommand === 'stories') {
      await runStories({ args, channelId, respond, logger }, deps);
      return;
    }

    // Video discovery (MOO-142): no arg opens the filterable browse modal (needs the
    // command's trigger_id); an arg filters straight to an ephemeral list.
    if (subcommand === 'video') {
      await runVideo({ args, channelId, body, client, respond, logger }, deps);
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
      // Configured channel: open the role-aware help modal (MOO-152) instead of the
      // bare command list. The modal is static, so views.open is instant (no trigger race).
      await runHelp({ subscription, body, client, respond, logger });
      return;
    }
    const result = await runSubcommand({ subcommand, args, channelId }, deps);
    const message = typeof result === 'string' ? { text: result } : result;
    await respond({ response_type: 'ephemeral', ...message });
  } catch (err) {
    logger?.error?.(`/gavel ${subcommand} failed: ${err.message}`);
    await respond({ response_type: 'ephemeral', text: ':warning: Something went wrong — please try again.' });
  }
}

/**
 * `/gavel help` in a configured channel → the role-aware help modal (MOO-152). Leads
 * with this channel's persona (role) and language; the modal's switcher covers the rest.
 * Falls back to the ephemeral command list if the modal can't open.
 */
async function runHelp({ subscription, body, client, respond, logger }) {
  const language = subscription?.language === 'es' ? 'es' : 'en';
  const role = subscription?.role ?? 'association';
  try {
    await client.views.open({ trigger_id: body.trigger_id, view: helpModal({ role, language }) });
  } catch (err) {
    logger?.error?.(`/gavel help modal open failed: ${err.message}`);
    await respond({ response_type: 'ephemeral', text: HELP_TEXT });
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
    case 'search':
      return runSearch({ args, channelId }, deps);
    case 'digest':
      return 'The weekly digest is coming in Phase 3.';
    default:
      return HELP_TEXT;
  }
}

/**
 * `/gavel search <term>` — full-text search over the ingested civic mail (MOO-153).
 * The folded routine in the "From the city" digest is not posted per-record; this is
 * how anyone digs back into an individual notification. Citywide by default; the card
 * shows each result's district. Render-only (no Claude). Convex search is injected.
 *
 * @param {{ args: string, channelId: string }} ctx
 * @param {{ getSubscription: (channelId: string) => Promise<object|null>,
 *           searchNotifications: (input: {term: string, limit: number}) => Promise<object[]> }} deps
 */
async function runSearch({ args, channelId }, deps) {
  if (!args.trim()) {
    return 'Usage: `/gavel search <term>` — e.g. `/gavel search 2000 S 13th St`, `/gavel search tavern`, or `/gavel search "data center"` (quotes = exact phrase).';
  }
  // Federated across the civic memory: civic mail (keyword + semantic), upcoming
  // Legistar agendas (keyword over title), meeting minutes + zoning code (semantic).
  // Quotes → exact, keyword-only (skips the semantic lanes); unquoted → hybrid. The
  // query is embedded once for all three vector lanes; results group by source.
  const parsed = parseSearchTerm(args);
  const subscription = await deps.getSubscription(channelId);
  const language = subscription?.language === 'es' ? 'es' : 'en';

  const vector = parsed.exact ? null : await (deps.embedQuery?.(parsed.display).catch(() => null) ?? null);
  const safe = (promise) => (promise ? promise.catch(() => []) : Promise.resolve([]));

  const [mailCandidates, mailSemantic, agendaHits, minutesHits, zoningHits] = await Promise.all([
    safe(deps.searchNotifications?.({ term: parsed.display, limit: SEARCH_CANDIDATE_LIMIT })),
    vector ? safe(deps.semanticSearch?.(vector)) : Promise.resolve([]),
    safe(deps.searchAgendas?.(parsed.display)),
    vector ? safe(deps.searchMinutes?.(vector)) : Promise.resolve([]),
    vector ? safe(deps.searchZoning?.(vector)) : Promise.resolve([]),
  ]);

  const mailKeyword = refineResults(mailCandidates, parsed);
  const mail = parsed.exact
    ? mailKeyword
    : mergeSearchResults(mailKeyword, mailSemantic, { limit: SEARCH_RESULT_LIMIT });
  // Mail searchText is long and OR-noisy, so it needs the AND/phrase refine; agenda
  // titles are short and already keyword-ranked, so only tighten them for an exact
  // (quoted) phrase — otherwise trust Convex's title ranking.
  const agendas = parsed.exact ? refineResults(agendaHits, parsed, (row) => row.title) : agendaHits;

  const groups = [
    { source: 'mail', results: mail.slice(0, PER_SOURCE_LIMIT).map(normalizeMail) },
    { source: 'agenda', results: agendas.slice(0, PER_SOURCE_LIMIT).map(normalizeAgenda) },
    { source: 'minutes', results: minutesHits.slice(0, PER_SOURCE_LIMIT).map(normalizeMinutes) },
    { source: 'zoning', results: zoningHits.slice(0, PER_SOURCE_LIMIT).map(normalizeZoning) },
  ];
  return buildFederatedResultsCard({ term: parsed.display, groups, language });
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
async function runStories({ args, channelId, respond, logger }, deps) {
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

  // MOO-130: render the response as a swipeable carousel of story cards (confirmed to
  // render on the deployed app). If Slack ever rejects the newer carousel block, fall
  // back to the classic storyLeadCards list so the reporter still gets their leads.
  const base = { response_type: 'ephemeral', replace_original: false, text: `📰 Story leads — ${label}` };
  try {
    await respond({ ...base, blocks: storyCarousel(composed, { label, language }) });
  } catch (err) {
    logger?.error?.(`/gavel stories carousel rejected, falling back to list: ${err.message}`);
    await respond({ ...base, blocks: storyLeadCards(composed, { label, language }) });
  }
}

/**
 * `/gavel video [committee]` — the no-jargon video library (MOO-142). No arg opens the
 * filterable browse modal via the command's `trigger_id`; an arg narrows directly to an
 * ephemeral list. Lookup + links only (no Claude). Heavy boundaries are injected.
 *
 * @param {{ args: string, channelId: string, body: object, client: object, respond: Function, logger?: {error: Function} }} ctx
 * @param {{
 *   getSubscription: (channelId: string) => Promise<object|null>,
 *   listRecentMeetingsWithVideo: () => Promise<Array<object>>,
 *   listIngestedEventIds: () => Promise<number[]>,
 * }} deps
 */
async function runVideo({ args, channelId, body, client, respond, logger }, deps) {
  const subscription = await deps.getSubscription(channelId);
  const language = subscription?.language === 'es' ? 'es' : 'en';
  const [meetings, ingested] = await Promise.all([deps.listRecentMeetingsWithVideo(), deps.listIngestedEventIds()]);
  const tagged = tagSearchable(meetings, ingested);

  const term = args.trim();
  if (term) {
    const matches = tagged.filter((m) => m.eventBodyName.toLowerCase().includes(term.toLowerCase()));
    await respond({
      response_type: 'ephemeral',
      replace_original: false,
      text: `🎥 Meeting video — ${term}`,
      blocks: meetingVideoSection(matches, language),
    });
    return;
  }

  try {
    await client.views.open({ trigger_id: body.trigger_id, view: videoModal(tagged, { language, committee: null }) });
  } catch (err) {
    logger?.error?.(`/gavel video modal open failed: ${err.message}`);
    await respond({
      response_type: 'ephemeral',
      text: ':movie_camera: Could not open the video browser — please try again.',
    });
  }
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
