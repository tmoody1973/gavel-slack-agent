import { sponsorCard } from '../blockkit/sponsor-card.js';

/** Slack header text caps at 150 chars. */
function headerText(title) {
  const text = `⚖️ ${title}`;
  return text.length > 150 ? `${text.slice(0, 147)}…` : text;
}

/**
 * Assemble the Block Kit alert card. Pure — returns { text, blocks } where
 * `text` is the notification/accessibility fallback and `blocks` is the
 * Block Kit payload. When `language` is 'es' the card is bilingual: EN section,
 * divider, ES section (file numbers/addresses/committee names stay English in
 * both — enforced upstream by the summarizer prompt). The <48h walk-on and
 * consent-calendar warnings render only when the poller set their flags (MOO-51).
 *
 * @param {{
 *   row: {eventItemId: number, eventBodyName: string, title: string, walkOnFlag?: boolean, consentFlag?: boolean},
 *   matter: {fileNumber?: string},
 *   event: {inSiteUrl?: string},
 *   summary: {en: {summary: string, whyItMatters: string}, es: {summary: string, whyItMatters: string}},
 *   footer: {text: string},
 *   language?: 'en' | 'es',
 * }} input
 * @returns {{ text: string, blocks: object[] }}
 */
export function buildAlertCard({ row, matter, event, summary, footer, language = 'en', member = null }) {
  const value = String(row.eventItemId);
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: headerText(row.title), emoji: true } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `*${row.eventBodyName}*` }] },
  ];

  if (row.walkOnFlag) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: '⚠️ *Added late* — on the agenda less than 48h before the meeting.' }],
    });
  }

  if (row.consentFlag) {
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: '⚠️ *On the consent calendar* — set to pass in a batch vote without individual discussion unless someone asks to pull it.',
        },
      ],
    });
  }

  blocks.push(
    { type: 'section', text: { type: 'mrkdwn', text: summary.en.summary } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `💡 *Why it matters:* ${summary.en.whyItMatters}` }] },
  );

  if (language === 'es') {
    blocks.push(
      { type: 'divider' },
      { type: 'section', text: { type: 'mrkdwn', text: `*🇪🇸 En español*\n${summary.es.summary}` } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `💡 *Por qué importa:* ${summary.es.whyItMatters}` }] },
    );
  }

  blocks.push({ type: 'divider' }, { type: 'section', text: { type: 'mrkdwn', text: footer.text } });

  if (member) {
    blocks.push(sponsorCard(member));
  }

  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        action_id: 'alert_watch',
        text: { type: 'plain_text', text: '👁 Watch', emoji: true },
        value,
        style: 'primary',
      },
      {
        type: 'button',
        action_id: 'alert_history',
        text: { type: 'plain_text', text: '🕓 History', emoji: true },
        value,
      },
      {
        type: 'button',
        action_id: 'alert_ask',
        text: { type: 'plain_text', text: '💬 Ask Gavel', emoji: true },
        value,
      },
    ],
  });

  const fileBit = matter.fileNumber ? `File #${matter.fileNumber}` : 'Milwaukee civic record';
  const link = event.inSiteUrl ? `<${event.inSiteUrl}|milwaukee.legistar.com>` : 'milwaukee.legistar.com';
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `${fileBit} · ${link}` }] });

  const text = `New: ${row.title} — ${summary.en.summary}`;
  return { text, blocks };
}
