// Federated /gavel search results card (MOO-153). One query, grouped by source:
// civic mail · upcoming agendas · meeting minutes · zoning code. Grouping by source
// (rather than a single cross-source ranking) sidesteps incomparable scores — keyword
// BM25 vs cosine similarity across different vector spaces — and reads clearly.
// Pure — returns { text, blocks }. Each source's searcher + normalizer feeds this.

const SNIPPET_CAP = 240;

const MAIL_CATEGORY = {
  meetings: 'Meeting',
  licenses: 'License',
  neighborhood_services: 'Permit / record',
  newsletter: 'Newsletter',
  other: 'Civic notice',
};

const SOURCE_META = {
  mail: { emoji: '📬', label: { en: 'Civic mail', es: 'Correo cívico' } },
  agenda: { emoji: '🏛️', label: { en: 'Upcoming agendas', es: 'Agendas próximas' } },
  minutes: { emoji: '🎙️', label: { en: 'Meeting minutes', es: 'Actas de reuniones' } },
  zoning: { emoji: '📖', label: { en: 'Zoning code', es: 'Código de zonificación' } },
};
const SOURCE_ORDER = ['mail', 'agenda', 'minutes', 'zoning'];

const COPY = {
  en: {
    header: (t) => `🔎 Records matching “${t}”`,
    empty: (t) => `No records match “${t}”. Try different words, or wrap a phrase in quotes for an exact match.`,
    footer: 'Searches city E-Notify, agendas, minutes & zoning · public records',
    // Teaching next-step: one capability nudge so the surface never dead-ends.
    watchNudge: (t) => `👁 Want to be notified when more records like this arrive? Try \`/gavel watch ${t}\``,
  },
  es: {
    header: (t) => `🔎 Registros que coinciden con “${t}”`,
    empty: (t) =>
      `No se encontró ningún registro para “${t}”. Pruebe otras palabras o use comillas para una frase exacta.`,
    footer: 'Busca correo cívico, agendas, actas y zonificación · registros públicos',
    watchNudge: (t) =>
      `👁 ¿Quieres recibir notificaciones cuando lleguen más registros como este? Prueba \`/gavel watch ${t}\``,
  },
};

function truncate(text, max = SNIPPET_CAP) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Collapse whitespace/newlines so a transcript/zoning snippet reads on one line. */
function clean(text) {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

export function normalizeMail(row) {
  const meta = [MAIL_CATEGORY[row.category], row.district && `District ${row.district}`, row.business]
    .filter(Boolean)
    .join(' · ');
  return { source: 'mail', headline: row.subject, meta, snippet: null, messageId: row.messageId ?? null };
}

export function normalizeAgenda(row) {
  return {
    source: 'agenda',
    headline: row.title,
    meta: [row.eventBodyName, row.eventDate].filter(Boolean).join(' · '),
    snippet: null,
    messageId: null,
  };
}

export function normalizeMinutes(row) {
  return {
    source: 'minutes',
    headline: [row.eventBodyName, row.eventDate].filter(Boolean).join(' · ') || 'Meeting transcript',
    meta: null,
    snippet: clean(row.text),
    messageId: null,
  };
}

export function normalizeZoning(row) {
  const label = `§ ${row.section}`;
  return {
    source: 'zoning',
    headline: row.sourceUrl ? `<${row.sourceUrl}|${label}>` : label,
    meta: null,
    snippet: clean(row.text),
    messageId: null,
  };
}

/** One result → a section block (+ a Read button for mail, which opens the modal). */
function resultBlock(result) {
  const lines = [`*${result.headline}*`];
  if (result.meta) lines.push(`_${result.meta}_`);
  if (result.snippet) lines.push(`“${truncate(result.snippet)}”`);
  const block = { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } };
  if (result.messageId) {
    block.accessory = {
      type: 'button',
      action_id: 'open_civic_record',
      text: { type: 'plain_text', text: '📖 Read' },
      value: result.messageId,
    };
  }
  return block;
}

/**
 * Assemble the federated results card.
 *
 * @param {{
 *   term: string,
 *   groups: Array<{ source: 'mail'|'agenda'|'minutes'|'zoning', results: object[] }>,
 *   language?: 'en' | 'es',
 * }} input
 * @returns {{ text: string, blocks: object[] }}
 */
export function buildFederatedResultsCard({ term, groups, language = 'en' }) {
  const copy = COPY[language] ?? COPY.en;
  const bySource = new Map(groups.map((g) => [g.source, g.results ?? []]));
  const total = [...bySource.values()].reduce((sum, results) => sum + results.length, 0);

  if (total === 0) {
    return { text: copy.empty(term), blocks: [{ type: 'section', text: { type: 'mrkdwn', text: copy.empty(term) } }] };
  }

  const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: `*${copy.header(term)}*` } }];
  for (const source of SOURCE_ORDER) {
    const results = bySource.get(source) ?? [];
    if (results.length === 0) continue;
    const meta = SOURCE_META[source];
    blocks.push(
      { type: 'divider' },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `${meta.emoji} *${meta.label[language] ?? meta.label.en}* (${results.length})` },
        ],
      },
      ...results.map(resultBlock),
    );
  }
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: copy.footer }] });
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: copy.watchNudge(term) }] });

  return { text: `${copy.header(term)} — ${total} found`, blocks };
}
