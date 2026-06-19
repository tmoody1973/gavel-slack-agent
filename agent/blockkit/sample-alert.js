import { copyFor } from '../onboarding/copy.js';
import { matterCard } from './matter-card.js';

// "Show, don't tell" sample alert (MOO-122). Right after Go-live, post one real
// upcoming agenda item so the citizen sees what an alert looks like and learns the
// 👁 Watch affordance. Deliberately lighter than the full buildAlertCard: it skips
// the synchronous Claude summary (no LLM call in the Go-live handler) and reuses the
// compact matterCard + the existing alert button vocabulary. The buttons reuse the
// real alert action_ids (alert_watch/alert_history/alert_ask), and because the item
// comes from detectedAgendaItems — the same table those handlers read by eventItemId
// — every button is fully functional with no extra wiring.

const mrkdwn = (text) => ({ type: 'mrkdwn', text });
const button = (action_id, label, value, extra = {}) => ({
  type: 'button',
  action_id,
  text: { type: 'plain_text', text: label, emoji: true },
  value,
  ...extra,
});

/**
 * @param {{eventItemId: number, eventBodyName?: string, title: string}} item - an upcoming detected item
 * @param {'en'|'es'} [language]
 * @returns {{ text: string, blocks: object[] }}
 */
export function sampleAlertCard(item, language = 'en') {
  const t = copyFor(language);
  const value = String(item.eventItemId);
  const blocks = [
    { type: 'section', text: mrkdwn(`📋 *${t.sampleIntro}*`) },
    ...matterCard({ title: item.title, bodyName: item.eventBodyName }),
    {
      type: 'actions',
      elements: [
        button('alert_watch', '👁 Watch', value, { style: 'primary' }),
        button('alert_history', '🕓 History', value),
        button('alert_ask', '💬 Ask Gavel', value),
      ],
    },
  ];
  return { text: `${t.sampleIntro} ${item.title}`, blocks };
}
