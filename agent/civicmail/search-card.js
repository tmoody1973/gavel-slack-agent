// The `/gavel search` results card (MOO-153). The folded routine in the "From the
// city" digest is not posted per-record, so this is how a resident or reporter digs
// back into any individual notification — full-text search over civicNotifications.
// Pure — returns { text, blocks }. The Convex search query is the injected boundary.

const CATEGORY_EMOJI = {
  neighborhood_services: '🏗️',
  licenses: '📋',
  meetings: '🏛️',
  newsletter: '📰',
  other: '📣',
};

const COPY = {
  en: {
    header: (term) => `🔎 Records matching “${term}”`,
    empty: (term) => `No records match “${term}”. Try an address, owner, license type, or record number.`,
    more: (n) => `+${n} more — narrow your search to see them.`,
    footer: 'Public records via Milwaukee E-Notify',
  },
  es: {
    header: (term) => `🔎 Registros que coinciden con “${term}”`,
    empty: (term) =>
      `No se encontró ningún registro para “${term}”. Pruebe una dirección, propietario, tipo de licencia o número de registro.`,
    more: (n) => `+${n} más — refine su búsqueda para verlos.`,
    footer: 'Registros públicos vía Milwaukee E-Notify',
  },
};

/** One result line: "📋 RENEWAL Class B Tavern License — COZUMEL III, LLC · District 12". */
function resultLine(row) {
  const emoji = CATEGORY_EMOJI[row.category] ?? '•';
  const bits = [];
  if (row.business) bits.push(row.business);
  if (row.district) bits.push(`District ${row.district}`);
  if (row.recordNumber) bits.push(`#${row.recordNumber}`);
  const tail = bits.length ? ` — ${bits.join(' · ')}` : '';
  const label = row.detailUrl ? `<${row.detailUrl}|${row.subject}>` : row.subject;
  return `${emoji} ${label}${tail}`;
}

/**
 * Assemble the `/gavel search` results card.
 *
 * @param {{
 *   term: string,
 *   results: Array<{category: string, subject: string, district?: string, recordNumber?: string,
 *                   business?: string, detailUrl?: string}>,
 *   language?: 'en' | 'es',
 *   max?: number,
 * }} input
 * @returns {{ text: string, blocks: object[] }}
 */
export function buildSearchResultsCard({ term, results, language = 'en', max = 8 }) {
  const copy = COPY[language] ?? COPY.en;

  if (results.length === 0) {
    return {
      text: copy.empty(term),
      blocks: [{ type: 'section', text: { type: 'mrkdwn', text: copy.empty(term) } }],
    };
  }

  const shown = results.slice(0, max);
  const remainder = results.length - shown.length;
  const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: `*${copy.header(term)}*` } }];
  // One section per result so each can carry a "Read" button into the record modal.
  for (const row of shown) {
    const section = { type: 'section', text: { type: 'mrkdwn', text: resultLine(row) } };
    if (row.messageId) {
      section.accessory = {
        type: 'button',
        action_id: 'open_civic_record',
        text: { type: 'plain_text', text: '📖 Read' },
        value: row.messageId,
      };
    }
    blocks.push(section);
  }
  if (remainder > 0) {
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: copy.more(remainder) }] });
  }
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: copy.footer }] });

  return { text: `${copy.header(term)} — ${results.length} found`, blocks };
}
