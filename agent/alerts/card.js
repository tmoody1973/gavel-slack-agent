/** Slack header text caps at 150 chars. */
function headerText(title) {
  const text = `⚖️ ${title}`;
  return text.length > 150 ? `${text.slice(0, 147)}…` : text;
}

/**
 * The Notification-template thumbnail: a matched council member's headshot as a
 * section accessory. Returns null unless the URL is a real https image — Slack
 * rejects a card with a malformed/empty image block, so a missing headshot must
 * degrade to no accessory (the contact line still renders).
 */
function headshotAccessory(member) {
  const url = member?.imageUrl;
  if (typeof url === 'string' && url.startsWith('https://')) {
    return { type: 'image', image_url: url, alt_text: member.name ?? 'council member' };
  }
  return null;
}

/** Member name/title + contact links as a context line (the headshot rides as the
 * section accessory now, so this carries no image). */
function memberContext(member) {
  const contact = [
    member.phone && `☎️ ${member.phone}`,
    member.email && `✉️ <mailto:${member.email}|${member.email}>`,
    member.webpage && `<${member.webpage}|City webpage>`,
  ]
    .filter(Boolean)
    .join(' · ');
  return { type: 'context', elements: [{ type: 'mrkdwn', text: `*${member.name}* — ${member.title}\n${contact}` }] };
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
export function buildAlertCard({
  row,
  matter,
  event,
  summary,
  footer,
  language = 'en',
  member = null,
  newsLinks = [],
}) {
  const value = String(row.eventItemId);
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: headerText(row.title), emoji: true } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `🏛️ *${row.eventBodyName}*` }] },
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

  // Primary section: the plain-language summary, with the council headshot as the
  // Notification-template accessory thumbnail when a sponsor is matched.
  const primarySection = { type: 'section', text: { type: 'mrkdwn', text: summary.en.summary } };
  const accessory = headshotAccessory(member);
  if (accessory) primarySection.accessory = accessory;
  blocks.push(primarySection, {
    type: 'context',
    elements: [{ type: 'mrkdwn', text: `💡 *Why it matters:* ${summary.en.whyItMatters}` }],
  });

  if (member) {
    blocks.push(memberContext(member));
  }

  if (language === 'es') {
    blocks.push(
      { type: 'divider' },
      { type: 'section', text: { type: 'mrkdwn', text: `*🇪🇸 En español*\n${summary.es.summary}` } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `💡 *Por qué importa:* ${summary.es.whyItMatters}` }] },
    );
  }

  blocks.push({ type: 'divider' }, { type: 'section', text: { type: 'mrkdwn', text: footer.text } });

  // 📰 Local news enrichment — only when ≥1 gated article. Real links only, no Gavel summary.
  if (Array.isArray(newsLinks) && newsLinks.length > 0) {
    const lines = newsLinks
      .slice(0, 3)
      .map((a) => `• <${a.url}|${a.title}>${a.source ? ` · ${a.source}` : ''}`)
      .join('\n');
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `📰 *In the local news*\n${lines}` }],
    });
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
      ...(matter.fileNumber
        ? [
            {
              type: 'button',
              action_id: 'civic_comment_open',
              text: {
                type: 'plain_text',
                text: language === 'es' ? '✍️ Haz oír tu voz' : '✍️ Make my voice heard',
                emoji: true,
              },
              value: matter.fileNumber,
            },
          ]
        : []),
    ],
  });

  const fileBit = matter.fileNumber ? `File #${matter.fileNumber}` : 'Milwaukee civic record';
  const link = event.inSiteUrl ? `<${event.inSiteUrl}|milwaukee.legistar.com>` : 'milwaukee.legistar.com';
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `${fileBit} · ${link}` }] });

  const text = `New: ${row.title} — ${summary.en.summary}`;
  return { text, blocks };
}
