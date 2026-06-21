// The role-aware help modal (MOO-152). `/gavel help` and the App Home "❓ How Gavel
// works" button both open this; the role switcher re-renders it via views.update. Pure
// over the static guide content (help/guide.js) — classic Block Kit, no LLM, no network,
// so it opens instantly with no trigger_id-expiry risk.

import { GUIDE_URL, helpForRole, INTRO, ROLE_LABEL, ROLES } from '../help/guide.js';

const plain = (text) => ({ type: 'plain_text', text: String(text).slice(0, 150), emoji: true });
const section = (text) => ({ type: 'section', text: { type: 'mrkdwn', text } });
const context = (text) => ({ type: 'context', elements: [{ type: 'mrkdwn', text }] });

const COPY = {
  en: { title: '❓ How Gavel works', close: 'Close', fullGuide: '📖 Full guide', switchLead: 'See Gavel for a' },
  es: { title: '❓ Cómo funciona Gavel', close: 'Cerrar', fullGuide: '📖 Guía completa', switchLead: 'Ver Gavel para' },
};

/** One persona switch button; the current role is highlighted. */
function roleSwitchButton(role, currentRole, language) {
  const label = ROLE_LABEL[role][language === 'es' ? 'es' : 'en'];
  const button = {
    type: 'button',
    action_id: `help_role:${role}`,
    text: plain(label),
    value: role,
  };
  if (role === currentRole) button.style = 'primary';
  return button;
}

/**
 * Build the help modal for one persona + language.
 * @param {{ role?: string, language?: 'en'|'es' }} [opts]
 * @returns {object} a Block Kit modal view
 */
export function helpModal({ role = 'association', language = 'en' } = {}) {
  const lang = language === 'es' ? 'es' : 'en';
  const copy = COPY[lang];
  const guide = helpForRole(role, lang);

  const blocks = [
    context(INTRO[lang]),
    section(`*${guide.label}*\n${guide.tagline}`),
    {
      type: 'actions',
      elements: ROLES.map((r) => roleSwitchButton(r, guide.role, lang)),
    },
    { type: 'divider' },
  ];

  for (const group of guide.sections) {
    blocks.push(section(`*${group.heading}*`));
    for (const it of group.items) blocks.push(section(`*${it.icon} ${it.title}*\n${it.body}`));
  }

  blocks.push(
    { type: 'divider' },
    {
      type: 'actions',
      elements: [{ type: 'button', action_id: 'help_full_guide', text: plain(copy.fullGuide), url: GUIDE_URL }],
    },
    context(
      lang === 'es'
        ? 'Funciona en cualquier canal suscrito · pregúntame lo que sea en un hilo.'
        : 'Works in any subscribed channel · ask me anything in a thread.',
    ),
  );

  return {
    type: 'modal',
    callback_id: 'help_modal',
    private_metadata: JSON.stringify({ role: guide.role, language: lang }),
    title: plain(copy.title),
    close: plain(copy.close),
    blocks,
  };
}
