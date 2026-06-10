/**
 * Designed "information unavailable" copy (the MOO-60 pattern, absorbed by
 * UX-C): say plainly what is missing, say what Gavel CAN do, never fake.
 */
const COPY = {
  no_history: {
    en: 'I couldn’t find a recorded history for this item yet.',
    es: 'Todavía no encuentro un historial registrado para este punto.',
  },
  no_matter: {
    en: 'This agenda item isn’t linked to a legislative file, so there’s no record to pull.',
    es: 'Este punto de la agenda no está vinculado a un expediente legislativo, así que no hay registro que consultar.',
  },
  fetch_failed: {
    en: 'The city’s records system didn’t answer just now.',
    es: 'El sistema de registros de la ciudad no respondió en este momento.',
  },
  generic: {
    en: 'That information isn’t available right now.',
    es: 'Esa información no está disponible en este momento.',
  },
};

const CAN_DO = {
  en: (link) =>
    [
      link && `You can read the full record yourself: ${link}.`,
      'I can also watch this item and alert the channel when it moves — click 👁 Watch on the card or use `/gavel watch`.',
    ]
      .filter(Boolean)
      .join(' '),
  es: (link) =>
    [
      link && `Puede leer el expediente completo aquí: ${link}.`,
      'También puedo vigilar este punto y avisar al canal cuando avance — use el botón 👁 Watch o `/gavel watch`.',
    ]
      .filter(Boolean)
      .join(' '),
};

/**
 * @param {string} kind - 'no_history' | 'no_matter' | 'fetch_failed' | anything else → generic
 * @param {{language?: 'en'|'es', legistarUrl?: string}} [opts]
 * @returns {{text: string, blocks: object[]}}
 */
export function errorReply(kind, { language = 'en', legistarUrl } = {}) {
  const copy = COPY[kind] ?? COPY.generic;
  const link = legistarUrl ? `<${legistarUrl}|milwaukee.legistar.com>` : '';
  const text = copy[language] ?? copy.en;
  const canDo = (CAN_DO[language] ?? CAN_DO.en)(link);
  return {
    text,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `ℹ️ ${text}` } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: canDo }] },
    ],
  };
}
