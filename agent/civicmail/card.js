// Human labels + "how to be heard" guidance per E-Notify category. Keeps the
// civic-action footer the PRD protects, tailored to where each notice is acted
// on (a meeting vs the License Division vs the DNS record).
const CATEGORY_META = {
  meetings: {
    emoji: '🏛️',
    label: 'Public meeting',
    heard: 'Attend or watch the live webcast — public comment is taken at the meeting.',
  },
  licenses: {
    emoji: '📋',
    label: 'License application',
    heard: 'To support or object, contact the License Division before the hearing.',
  },
  neighborhood_services: {
    emoji: '🏗️',
    label: 'Permit / code record',
    heard: 'See the record detail for status and next steps.',
  },
  newsletter: { emoji: '📰', label: 'Official newsletter', heard: '' },
  other: { emoji: '⚖️', label: 'Civic notice', heard: '' },
};

/** Slack header text caps at 150 chars. */
function headerText(emoji, title) {
  const text = `${emoji} ${title}`;
  return text.length > 150 ? `${text.slice(0, 147)}…` : text;
}

/** A short "where/what" context line from the derived fields. */
function locationLine(notification) {
  const bits = [];
  if (notification.district) bits.push(`Aldermanic District ${notification.district}`);
  if (notification.addresses?.[0]) bits.push(notification.addresses[0]);
  if (notification.recordNumber) bits.push(`#${notification.recordNumber}`);
  return bits.join(' · ');
}

/**
 * Assemble the Block Kit card for an E-Notify civic notification. Pure — returns
 * { text, blocks }. Mirrors the Legistar alert card's bilingual layout (EN, then
 * an ES section when the channel's language is 'es') and "how to be heard" footer,
 * but links to the actual record/meeting rather than Legistar-resolving buttons
 * (E-Notify items have no Legistar eventItemId).
 *
 * @param {{
 *   notification: {category: string, subject: string, district?: string, addresses?: string[],
 *                  recordNumber?: string, detailUrl?: string, legistarMeetingId?: string},
 *   summary: {en: {summary: string, whyItMatters: string}, es: {summary: string, whyItMatters: string}},
 *   language?: 'en' | 'es',
 * }} input
 * @returns {{ text: string, blocks: object[] }}
 */
export function buildNotificationCard({ notification, summary, language = 'en' }) {
  const meta = CATEGORY_META[notification.category] ?? CATEGORY_META.other;
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: headerText(meta.emoji, notification.subject), emoji: true } },
  ];

  const contextBits = [`*${meta.label}*`];
  const where = locationLine(notification);
  if (where) contextBits.push(where);
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: contextBits.join('  ·  ') }] });

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

  if (meta.heard) {
    blocks.push(
      { type: 'divider' },
      { type: 'section', text: { type: 'mrkdwn', text: `🗣️ *How to be heard:* ${meta.heard}` } },
    );
  }

  const source = notification.detailUrl ? `<${notification.detailUrl}|View the record>` : 'City of Milwaukee E-Notify';
  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: `${source} · public record via Milwaukee E-Notify` }],
  });

  return { text: `${meta.label}: ${notification.subject} — ${summary.en.summary}`, blocks };
}
