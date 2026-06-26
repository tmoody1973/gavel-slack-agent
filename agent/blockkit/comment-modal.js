// The review-and-edit modal for filing a public comment (MOO-171). Pure Block Kit. The
// resident edits the Gavel-drafted text, confirms their name + position, and submits — the
// view_submission handler reads block_ids + private_metadata. Civic identifiers stay English.

const plain = (text) => ({ type: 'plain_text', text: String(text).slice(0, 150), emoji: true });
const section = (text) => ({ type: 'section', text: { type: 'mrkdwn', text } });
const context = (text) => ({ type: 'context', elements: [{ type: 'mrkdwn', text }] });

const COPY = {
  en: {
    title: 'Comment to the city',
    submit: 'Send to the city',
    cancel: 'Cancel',
    item: (file, title) => `*File #${file}* — ${title}`,
    positionLabel: 'Your position',
    positions: { support: 'Support', oppose: 'Oppose', neutral: 'Neutral', question: 'Just a question' },
    bodyLabel: 'Your comment (edit freely)',
    drafting: ':sparkles: Gavel is drafting your comment… one moment.',
    nameLabel: 'Your name (required for the public record)',
    addressLabel: 'Your address (optional)',
    demo: (inbox) => `:test_tube: Demo mode — this is sent to a test inbox (${inbox || 'test'}), *not* the city.`,
  },
  es: {
    title: 'Comentario a la ciudad',
    submit: 'Enviar a la ciudad',
    cancel: 'Cancelar',
    item: (file, title) => `*File #${file}* — ${title}`,
    positionLabel: 'Tu postura',
    positions: { support: 'A favor', oppose: 'En contra', neutral: 'Neutral', question: 'Solo una pregunta' },
    bodyLabel: 'Tu comentario (edítalo libremente)',
    drafting: ':sparkles: Gavel está redactando tu comentario… un momento.',
    nameLabel: 'Tu nombre (requerido para el registro público)',
    addressLabel: 'Tu dirección (opcional)',
    demo: (inbox) => `:test_tube: Modo demo — se envía a un buzón de prueba (${inbox || 'test'}), *no* a la ciudad.`,
  },
};

const copyFor = (language) => COPY[language === 'es' ? 'es' : 'en'];

function positionElement(copy) {
  return {
    type: 'radio_buttons',
    action_id: 'position',
    options: ['support', 'oppose', 'neutral', 'question'].map((key) => ({
      text: plain(copy.positions[key]),
      value: key,
    })),
  };
}

// While Gavel drafts, the comment is a read-only placeholder — there is no editable input to
// submit, so a bare template can never be filed before the Claude draft swaps in (MOO-171).
const draftingBlock = (copy) => section(copy.drafting);

const commentInputBlock = (copy, draftText) => ({
  type: 'input',
  block_id: 'civic_comment_body',
  label: plain(copy.bodyLabel),
  element: { type: 'plain_text_input', action_id: 'body', multiline: true, initial_value: draftText },
});

/**
 * Build the comment review/edit modal.
 * @param {{ fileNumber: string, title: string, draftText?: string, language?: string,
 *           demoMode?: boolean, testInbox?: string, drafting?: boolean }} input
 * @returns {object} a Block Kit modal view
 */
export function buildCommentModal({
  fileNumber,
  title,
  draftText = '',
  language,
  demoMode = false,
  testInbox,
  drafting = false,
} = {}) {
  const lang = language === 'es' ? 'es' : 'en';
  const copy = copyFor(lang);

  const blocks = [
    section(copy.item(fileNumber, title)),
    { type: 'divider' },
    {
      type: 'input',
      block_id: 'civic_comment_position',
      label: plain(copy.positionLabel),
      element: positionElement(copy),
    },
    drafting ? draftingBlock(copy) : commentInputBlock(copy, draftText),
    {
      type: 'input',
      block_id: 'civic_comment_name',
      label: plain(copy.nameLabel),
      element: { type: 'plain_text_input', action_id: 'name' },
    },
    {
      type: 'input',
      block_id: 'civic_comment_address',
      optional: true,
      label: plain(copy.addressLabel),
      element: { type: 'plain_text_input', action_id: 'address' },
    },
  ];

  if (demoMode) blocks.push(context(copy.demo(testInbox)));

  return {
    type: 'modal',
    callback_id: 'civic_comment_modal',
    private_metadata: JSON.stringify({ fileNumber, language: lang, demoMode: Boolean(demoMode) }),
    title: plain(copy.title),
    submit: plain(copy.submit),
    close: plain(copy.cancel),
    blocks,
  };
}
