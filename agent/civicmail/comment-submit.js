// File a resident's public comment (MOO-171). Called ONLY from the view_submission handler —
// i.e. only after the resident explicitly confirmed in the modal, so there is no auto-send path.
// Guardrails enforced here: a real name is required (never fabricate a constituent), the comment
// must be non-empty, and a recipient must already be resolved (degrade safe, never guess).

const POSITION_LABEL = {
  support: 'In support',
  oppose: 'Opposed',
  neutral: 'Neutral — questions/concerns',
  question: 'A question',
};

const blank = (value) => !value || !String(value).trim();

/**
 * Compose the public-comment email. Pure.
 * @returns {{ subject: string, text: string }}
 */
export function composeCommentEmail({ fileNumber, title, position, body, name, address }) {
  const subject = `Public comment — File #${fileNumber}`;
  const signature = [name, address].filter(Boolean).join(', ');
  const text = [
    `Re: File #${fileNumber} — ${title}`,
    `Position: ${POSITION_LABEL[position] ?? POSITION_LABEL.neutral}`,
    '',
    String(body).trim(),
    '',
    `— ${signature}`,
    'Submitted via Gavel on behalf of a constituent.',
  ].join('\n');
  return { subject, text };
}

/**
 * Send the comment via the injected mail boundary, after the guardrails pass.
 * @param {{ fileNumber: string, title: string, position?: string, body: string, name: string,
 *           address?: string, recipient: string|null, demoMode?: boolean }} input
 * @param {{ send: (msg: {to: string, subject: string, text: string}) => Promise<unknown> }} deps
 * @returns {Promise<{sent: boolean, recipient?: string, demoMode?: boolean, subject?: string, text?: string, error?: string}>}
 */
export async function submitComment(input, { send }) {
  if (blank(input.name)) return { sent: false, error: 'A name is required to file a comment.' };
  if (blank(input.body)) return { sent: false, error: 'The comment is empty.' };
  if (blank(input.recipient)) {
    return { sent: false, error: 'No recipient resolved — file manually; Gavel will not guess an address.' };
  }

  const { subject, text } = composeCommentEmail(input);
  await send({ to: input.recipient, subject, text });
  return { sent: true, recipient: input.recipient, demoMode: Boolean(input.demoMode), subject, text };
}
