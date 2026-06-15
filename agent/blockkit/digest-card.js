const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Format a Legistar local date ("2026-06-18T00:00:00") as "Jun 18". */
function shortDate(iso) {
  const [, month, day] = iso.slice(0, 10).split('-').map(Number);
  return `${MONTHS[month - 1]} ${day}`;
}

const mrkdwn = (text) => ({ type: 'section', text: { type: 'mrkdwn', text } });

/** One top-3 line: "⚠️ *Jun 18* · <link|File #260234> — title". Walk-ons get ⚠️. */
function itemLine(item) {
  const flag = item.walkOnFlag ? '⚠️ ' : '• ';
  const fileBit = item.fileNumber
    ? item.legistarUrl
      ? `<${item.legistarUrl}|File #${item.fileNumber}>`
      : `File #${item.fileNumber}`
    : null;
  const head = [`${flag}*${shortDate(item.eventDate)}*`, fileBit].filter(Boolean).join(' · ');
  return `${head} — ${item.title}`;
}

const COPY = {
  en: {
    header: '📬 Your civic week',
    summary: (total, attn) =>
      `*${total}* ${total === 1 ? 'item' : 'items'} in your subscriptions this week` +
      (attn > 0 ? ` · *${attn}* ${attn === 1 ? 'needs' : 'need'} attention` : ''),
    quiet: 'A quiet week — nothing on your subscriptions is up for a vote in the next 7 days.',
    footer: '🗣️ *How to be heard:* open a meeting’s agenda from its file link above to see when and where to comment.',
    manage: '⚙️ Manage your committees, keywords, and watches in the Gavel App Home.',
  },
  es: {
    header: '📬 Tu semana cívica',
    summary: (total, attn) =>
      `*${total}* ${total === 1 ? 'asunto' : 'asuntos'} en tus suscripciones esta semana` +
      (attn > 0 ? ` · *${attn}* ${attn === 1 ? 'requiere' : 'requieren'} atención` : ''),
    quiet: 'Una semana tranquila — nada de tus suscripciones se vota en los próximos 7 días.',
    footer:
      '🗣️ *Cómo participar:* abre la agenda de una reunión desde el enlace del expediente para ver cuándo y dónde comentar.',
    manage: '⚙️ Administra tus comités, palabras clave y seguimientos en el App Home de Gavel.',
  },
};

/** One language's body: summary line, items (or quiet line), footer, manage line. */
function section(copy, total, needsAttention, top, label) {
  const blocks = [];
  if (label) blocks.push(mrkdwn(`*🇪🇸 ${label}*`));
  blocks.push(mrkdwn(copy.summary(total, needsAttention)));
  blocks.push(total === 0 ? mrkdwn(`_${copy.quiet}_`) : mrkdwn(top.map(itemLine).join('\n')));
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: copy.footer }] });
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: copy.manage }] });
  return blocks;
}

/**
 * The Sunday Digest card (MOO-76). Bilingual when language === 'es' (EN section,
 * divider, ES section — item titles/file numbers/committees stay English, the
 * MOO-43 rule). total === 0 → graceful quiet-week variant. Pure.
 *
 * @param {{ total: number, needsAttention: number, top: Array<{title: string, eventBodyName: string, eventDate: string, fileNumber?: string, legistarUrl?: string, walkOnFlag?: boolean}>, language?: 'en' | 'es' }} week
 * @returns {{ text: string, blocks: object[] }}
 */
export function digestCard({ total, needsAttention, top, language = 'en' }) {
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: COPY.en.header, emoji: true } },
    ...section(COPY.en, total, needsAttention, top, null),
  ];

  if (language === 'es') {
    blocks.push({ type: 'divider' }, ...section(COPY.es, total, needsAttention, top, 'Tu semana cívica · En español'));
  }

  const text =
    total === 0
      ? 'A quiet civic week — nothing up for a vote.'
      : `Your civic week: ${total} ${total === 1 ? 'item' : 'items'} in your subscriptions.`;
  return { text, blocks };
}
