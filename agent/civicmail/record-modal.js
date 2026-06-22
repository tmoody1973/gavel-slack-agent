// The civic-record modal (MOO-153). The in-Slack reading surface for one E-Notify
// record — opened from a digest highlight or a /gavel search result. Replaces the
// useless generic E-Notify link with the actual content: the email body, the text
// extracted from PDF attachments, and — for flyers — the image rendered inline.
//
// Pure — returns a Slack view object. The handler resolves fresh presigned attachment
// URLs (they expire) and passes them in as `resolvedAttachments`; this builder never
// does I/O. No Claude: a modal must open within ~3s of the click.

const SECTION_LIMIT = 2900; // Slack section mrkdwn caps at 3000; leave headroom.

const CATEGORY_META = {
  meetings: {
    emoji: '🏛️',
    label: { en: 'Public meeting', es: 'Reunión pública' },
    heard: {
      en: 'Attend or watch the live webcast — public comment is taken at the meeting.',
      es: 'Asista o vea la transmisión en vivo — se acepta comentario público en la reunión.',
    },
  },
  licenses: {
    emoji: '📋',
    label: { en: 'License application', es: 'Solicitud de licencia' },
    heard: {
      en: 'To support or object, contact the License Division before the hearing.',
      es: 'Para apoyar u objetar, comuníquese con la División de Licencias antes de la audiencia.',
    },
  },
  neighborhood_services: {
    emoji: '🏗️',
    label: { en: 'Permit / code record', es: 'Permiso / registro de código' },
    heard: {
      en: 'See the record detail for status and next steps.',
      es: 'Consulte el detalle del registro para conocer el estado y los próximos pasos.',
    },
  },
  newsletter: { emoji: '📰', label: { en: 'Newsletter', es: 'Boletín' } },
  other: { emoji: '📣', label: { en: 'Civic notice', es: 'Aviso cívico' } },
};

const COPY = {
  en: {
    title: 'City record',
    done: 'Done',
    body: 'What this is',
    attachment: 'From the attachment',
    heard: 'How to be heard',
    watch: '👁 Watch this',
    source: '🔗 City record',
  },
  es: {
    title: 'Registro municipal',
    done: 'Cerrar',
    body: 'De qué se trata',
    attachment: 'Del adjunto',
    heard: 'Cómo participar',
    watch: '👁 Seguir esto',
    source: '🔗 Sitio de la ciudad',
  },
};

function truncate(text, max = SECTION_LIMIT) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** "📋 License application · District 12 · BANDERAS 408, LLC · #REC". */
function factsLine(record, meta, lang) {
  const bits = [`*${meta.label[lang]}*`];
  if (record.district) bits.push(lang === 'es' ? `Distrito ${record.district}` : `District ${record.district}`);
  if (record.business) bits.push(record.business);
  if (record.addresses?.[0]) bits.push(record.addresses[0]);
  if (record.recordNumber) bits.push(`#${record.recordNumber}`);
  return bits.join('  ·  ');
}

/**
 * Build the civic-record modal view.
 *
 * @param {{
 *   record: object,                       // a civicNotifications row
 *   resolvedAttachments?: Array<{ filename: string, contentType: string, url: string|null }>,
 *   language?: 'en' | 'es',
 * }} input
 * @returns {object} a Slack `views.open` modal view
 */
export function buildCivicRecordModal({ record, resolvedAttachments = [], language = 'en' }) {
  const lang = language === 'es' ? 'es' : 'en';
  const copy = COPY[lang];
  const meta = CATEGORY_META[record.category] ?? CATEGORY_META.other;

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: truncate(`${meta.emoji} ${record.subject}`, 150), emoji: true },
    },
    { type: 'context', elements: [{ type: 'mrkdwn', text: factsLine(record, meta, lang) }] },
  ];

  if (record.bodyText) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*${copy.body}*\n${truncate(record.bodyText)}` } });
  }

  if (record.attachmentText) {
    blocks.push(
      { type: 'divider' },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `📎 *${copy.attachment}*\n${truncate(record.attachmentText)}` },
      },
    );
  }

  // Images render inline (a flyer is meant to be seen); other attachments become
  // download links. A null URL degrades to the filename — no broken image/link.
  for (const attachment of resolvedAttachments) {
    if (!attachment.url) {
      blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `📎 ${attachment.filename}` }] });
    } else if (attachment.contentType?.startsWith('image/')) {
      blocks.push({ type: 'image', image_url: attachment.url, alt_text: attachment.filename });
    } else {
      blocks.push({
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `⬇ <${attachment.url}|${attachment.filename}>` }],
      });
    }
  }

  if (meta.heard) {
    blocks.push(
      { type: 'divider' },
      { type: 'section', text: { type: 'mrkdwn', text: `🗣️ *${copy.heard}* — ${meta.heard[lang]}` } },
    );
  }

  const actions = [];
  const watchEntity = record.business || record.recordNumber || record.subject;
  if (watchEntity) {
    actions.push({
      type: 'button',
      action_id: 'record_watch',
      text: { type: 'plain_text', text: copy.watch, emoji: true },
      style: 'primary',
      value: truncate(watchEntity, 70),
    });
  }
  if (record.detailUrl) {
    actions.push({
      type: 'button',
      action_id: 'record_source',
      text: { type: 'plain_text', text: copy.source, emoji: true },
      url: record.detailUrl,
    });
  }
  if (actions.length) blocks.push({ type: 'actions', elements: actions });

  return {
    type: 'modal',
    title: { type: 'plain_text', text: copy.title },
    close: { type: 'plain_text', text: copy.done },
    blocks,
  };
}
