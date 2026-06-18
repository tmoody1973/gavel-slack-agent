import { copyFor } from '../onboarding/copy.js';

// Pure Block Kit builders for the Front Door (MOO-118 FD-B · spec §2). Each takes
// a language (or assembled Home state) and returns Block Kit JSON — no I/O, no
// Slack/Convex. They consume FD-A's curated copy (copyFor) + role defaults so the
// onboarding surfaces stay a thin presentation layer over the role→defaults engine.

const plain = (text) => ({ type: 'plain_text', text, emoji: true });
const mrkdwn = (text) => ({ type: 'mrkdwn', text });

const ROLE_LABEL = {
  association: '👵 Neighborhood association',
  organizer: '📣 Community organizer',
  reporter: '📰 Reporter',
};

/** DM/channel nudge: intro + a button that opens the role modal. */
export function nudgeCard(language) {
  const t = copyFor(language);
  return {
    blocks: [
      { type: 'section', text: mrkdwn(t.nudgeIntro) },
      {
        type: 'actions',
        elements: [{ type: 'button', style: 'primary', text: plain(t.nudgeButton), action_id: 'onboarding_open_role' }],
      },
    ],
  };
}

/** View 1 — one question, three role buttons (each pushes the confirm view). */
export function roleModal(language) {
  const t = copyFor(language);
  // action_id must be unique within a view (Slack rejects duplicates), so suffix
  // it with the role; the handler is registered by prefix and reads `value`.
  const roleButton = (value, text) => ({
    type: 'button',
    text: plain(text),
    action_id: `onboarding_pick_role_${value}`,
    value,
  });
  return {
    type: 'modal',
    callback_id: 'onboarding_role_modal',
    title: plain('Set up Gavel'),
    blocks: [
      { type: 'section', text: mrkdwn(`*${t.roleQuestion}*`) },
      {
        type: 'actions',
        elements: [
          roleButton('association', t.roleAssociation),
          roleButton('organizer', t.roleOrganizer),
          roleButton('reporter', t.roleReporter),
        ],
      },
    ],
  };
}

/**
 * View 2 — confirm. Pre-filled summary of defaultsForRole(role); primary submit
 * is "Go live" (tap 2). The full config travels in private_metadata so the submit
 * handler writes exactly what was shown (idempotent, no re-derivation drift). The
 * target channel is a conversations_select, pre-filled when the nudge fired inside
 * a channel and a picker when setup is launched from the App Home — so both entry
 * points reach a working write.
 */
export function confirmModal(role, defaults, language, channelId = null) {
  const t = copyFor(language);
  const summary = [
    `*${t.confirmHeading}*`,
    `🏛 ${defaults.committees.join(', ')}`,
    defaults.keywords.length ? `🔑 ${defaults.keywords.join(', ')}` : null,
    `🌐 ${defaults.language === 'es' ? 'Español' : 'English'}`,
  ]
    .filter(Boolean)
    .join('\n');
  const channelSelect = {
    type: 'conversations_select',
    action_id: 'onboarding_channel_select',
    default_to_current_conversation: true,
    filter: { include: ['public', 'private'], exclude_bot_users: true },
  };
  if (channelId) channelSelect.initial_conversation = channelId;
  return {
    type: 'modal',
    callback_id: 'onboarding_confirm_modal',
    private_metadata: JSON.stringify({ role, defaults, channelId }),
    title: plain('Set up Gavel'),
    submit: plain(t.confirmGoLive),
    close: plain(t.confirmCustomize),
    blocks: [
      { type: 'context', elements: [mrkdwn(ROLE_LABEL[role] ?? role)] },
      { type: 'section', text: mrkdwn(summary) },
      { type: 'input', block_id: 'onboarding_channel', label: plain('Channel'), element: channelSelect },
    ],
  };
}

/**
 * Member welcome (MOO-119 FD-C) — the 5-second orientation every resident sees the
 * first time Gavel posts in their channel. Bilingual per the channel language; the
 * "What can you do?" action surfaces a transcript example (the third memory). Each
 * button carries the language in its value so the threaded reply stays in-language.
 */
export function memberWelcomeCard(language) {
  const t = copyFor(language);
  return {
    blocks: [
      { type: 'section', text: mrkdwn(t.memberWelcome) },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            style: 'primary',
            text: plain(t.memberAsk),
            action_id: 'member_ask_gavel',
            value: language,
          },
          { type: 'button', text: plain(t.memberWhatCanYouDo), action_id: 'member_what_can_you_do', value: language },
        ],
      },
    ],
  };
}

/**
 * App Home before any setup — warm intro + Set up button (the fallback path).
 * The configured-state hub is the richer MOO-74 `homeView`, which now carries the
 * "Set up another channel" onboarding button; there is intentionally no separate
 * configured builder here (one hub, no duplication).
 */
export function homeFirstRun(language) {
  const t = copyFor(language);
  return {
    type: 'home',
    blocks: [
      { type: 'header', text: plain('Gavel — Milwaukee civic transparency 🏛️') },
      { type: 'section', text: mrkdwn(t.nudgeIntro) },
      {
        type: 'actions',
        elements: [{ type: 'button', style: 'primary', text: plain(t.nudgeButton), action_id: 'onboarding_open_role' }],
      },
    ],
  };
}
