/** Slack caps a home view at 100 blocks; stay well under with sane slices. */
const MAX_WATCH_ROWS = 20;
const MAX_CHANNEL_ROWS = 10;

const mrkdwn = (text) => ({ type: 'section', text: { type: 'mrkdwn', text } });

const plural = (count, singular, pluralForm = `${singular}s`) => (count === 1 ? singular : pluralForm);

/**
 * The Hybrid App Home (MOO-74): status strip (Denise) + watches and
 * per-channel config with edit modals (Marcos). Pure over HomeState.
 * @param {{
 *   strip: {meetings: number, lateAdds: number, watchHits: number},
 *   watches: Array<{channelId: string, channelName: string, entity: string}>,
 *   channels: Array<{channelId: string, channelName: string, committees: string[], keywords: string[], language: 'en'|'es'}>,
 * }} state
 * @returns {{type: 'home', blocks: object[]}}
 */
export function homeView({ strip, watches, channels, discover = [] }) {
  if (channels.length === 0) return emptyStateView();
  const language = channels.some((c) => c.language === 'es') ? 'es' : 'en';

  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: '🏛️ Gavel — your civic week', emoji: true } },
    mrkdwn(
      `This week: *${strip.meetings}* ${plural(strip.meetings, 'meeting touches', 'meetings touch')} your subscriptions · ⚠️ *${strip.lateAdds}* added late · 👁 *${strip.watchHits}* ${plural(strip.watchHits, 'watch hit')}`,
    ),
    { type: 'divider' },
    ...discoverBlocks(discover, language),
    {
      type: 'section',
      text: { type: 'mrkdwn', text: '*👁 Watches*' },
      accessory: {
        type: 'button',
        action_id: 'home_add_watch',
        text: { type: 'plain_text', text: '＋ Watch', emoji: true },
        style: 'primary',
      },
    },
    ...watchBlocks(watches),
    { type: 'divider' },
    mrkdwn('*⚙️ Channel alerts*'),
    ...channels.slice(0, MAX_CHANNEL_ROWS).flatMap(channelBlocks),
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          action_id: 'onboarding_open_role',
          text: { type: 'plain_text', text: '＋ Set up another channel', emoji: true },
        },
        {
          type: 'button',
          action_id: 'grow_areas',
          text: { type: 'plain_text', text: '🏘 I cover multiple neighborhoods', emoji: true },
        },
      ],
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: 'Sourced live from Milwaukee’s official Legistar records · `/gavel` works in any subscribed channel.',
        },
      ],
    },
  ];
  return { type: 'home', blocks };
}

const MAX_DISCOVER_ROWS = 6;

const DISCOVER_COPY = {
  en: {
    heading: '*🔎 Discover this week*',
    quiet: 'Quiet week — nothing flagged beyond your subscriptions yet.',
    watch: '👁 Watch',
  },
  es: {
    heading: '*🔎 Descubre esta semana*',
    quiet: 'Semana tranquila — nada destacado más allá de tus suscripciones todavía.',
    watch: '👁 Seguir',
  },
};

const REASON_LABEL = {
  en: {
    district: (d) => `📍 District ${d}`,
    walkOn: () => '⚠️ Added late',
    consent: () => '⚠️ Consent calendar',
    big: () => '💰 Big this week',
  },
  es: {
    district: (d) => `📍 Distrito ${d}`,
    walkOn: () => '⚠️ Añadido tarde',
    consent: () => '⚠️ Agenda de consentimiento',
    big: () => '💰 Importante esta semana',
  },
};

/** Explainable "why this surfaced" tags: committee + one tag per salience reason. */
function reasonTagText(reasons, eventBodyName, language) {
  const labels = REASON_LABEL[language] ?? REASON_LABEL.en;
  const tags = reasons.map((reason) => labels[reason.kind]?.(reason.detail)).filter(Boolean);
  return [`🏛️ ${eventBodyName}`, ...tags].join(' · ');
}

/** The "🔎 Discover this week" section: salient items + a 👁 Watch button each (MOO-123). */
function discoverBlocks(discover, language) {
  const copy = DISCOVER_COPY[language] ?? DISCOVER_COPY.en;
  if (!discover || discover.length === 0) {
    return [mrkdwn(`${copy.heading}\n${copy.quiet}`), { type: 'divider' }];
  }
  const blocks = [mrkdwn(copy.heading)];
  for (const { item, reasons } of discover.slice(0, MAX_DISCOVER_ROWS)) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*${item.title}*` },
      accessory: {
        type: 'button',
        action_id: 'discover_watch',
        text: { type: 'plain_text', text: copy.watch, emoji: true },
        value: String(item.title ?? '').slice(0, 1900),
      },
    });
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: reasonTagText(reasons, item.eventBodyName ?? '', language) }],
    });
  }
  blocks.push({ type: 'divider' });
  return blocks;
}

function watchBlocks(watches) {
  if (watches.length === 0) {
    return [
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: 'No watches yet — watch a file number, address, or name and I’ll alert the channel when it moves.',
          },
        ],
      },
    ];
  }
  return watches.slice(0, MAX_WATCH_ROWS).map((w) => ({
    type: 'section',
    text: { type: 'mrkdwn', text: `• *${w.entity}* — #${w.channelName}` },
    accessory: {
      type: 'overflow',
      action_id: 'home_watch_remove',
      options: [
        {
          text: { type: 'plain_text', text: '🚫 Stop watching', emoji: true },
          value: JSON.stringify({ channelId: w.channelId, entity: w.entity }),
        },
      ],
    },
  }));
}

function channelBlocks(channel) {
  const language = channel.language === 'es' ? '🇪🇸 Español (bilingual)' : '🇺🇸 English';
  const committees = channel.committees.length > 0 ? channel.committees.join(', ') : '_none_';
  const keywords = channel.keywords.length > 0 ? channel.keywords.join(', ') : '_none_';
  return [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*#${channel.channelName}* · ${language}` },
      accessory: {
        type: 'button',
        action_id: 'home_edit_channel',
        text: { type: 'plain_text', text: 'Edit', emoji: true },
        value: channel.channelId,
      },
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `🏛 ${committees}\n🔑 ${keywords}` }],
    },
  ];
}

function emptyStateView() {
  return {
    type: 'home',
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '🏛️ Gavel — Milwaukee civic transparency', emoji: true } },
      mrkdwn(
        "I watch Milwaukee city government so your neighborhood doesn't have to — plain-English (and Spanish) alerts *before* the vote.",
      ),
      { type: 'divider' },
      mrkdwn(
        '*Get set up in two steps:*\n1. *Invite me to a channel* — `/invite @Gavel` where your neighbors talk.\n2. *Subscribe it* — `/gavel watch <file, address, or name>` or ask an admin to add committees.\nAlerts start posting automatically once a channel is subscribed.',
      ),
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: 'Questions? DM me — “What meetings are coming up this week?”' }],
      },
    ],
  };
}
