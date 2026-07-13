// Draft a resident's public comment for a civic item (MOO-171). The PROMPT is pure and
// testable; the Claude call is an injected boundary. Honest drafting is a hard guardrail:
// the comment states the resident's position and questions and is grounded ONLY in the
// item facts we pass — it never invents statistics, claims, or events.

const POSITION_PHRASE = {
  support: 'in SUPPORT of',
  oppose: 'OPPOSED to',
  neutral: 'neutral, with questions and concerns about',
  question: 'asking questions about',
};

const positionPhrase = (position) => POSITION_PHRASE[position] ?? POSITION_PHRASE.neutral;

const isSpanish = (language) => language === 'es';

const SYSTEM = [
  'You help a Milwaukee resident write a short, sincere public comment to submit to the city about an',
  'item on a public meeting agenda. Write in the first person, plain and respectful, 80–150 words.',
  'HARD RULE: use ONLY the facts provided about the item. Do NOT invent statistics, studies, events,',
  "quotes, or claims. State the resident's position and their genuine questions or concerns. This is a",
  'personal comment, not an evidence brief.',
].join(' ');

/**
 * Build the {system, prompt} for the comment draft. Pure. Falls back to English instructions
 * for any non-Spanish language (the OUTPUT language; civic identifiers stay English regardless).
 *
 * @param {{ fileNumber: string, title: string, position?: string, language?: string, concern?: string }} input
 * @returns {{ system: string, prompt: string }}
 */
export function buildCommentDraftPrompt({ fileNumber, title, position, language, concern } = {}) {
  const lines = [`Item: File #${fileNumber} — "${title}".`, `The resident is ${positionPhrase(position)} this item.`];
  if (concern) lines.push(`Their stated concern: ${concern}.`);

  if (isSpanish(language)) {
    lines.push(
      'Write the comment in SPANISH. Keep civic identifiers in ENGLISH even in the Spanish text:',
      'the file number, committee/body name, and street address are official and must not be translated.',
    );
  } else {
    lines.push('Write the comment in English.');
  }
  lines.push('Reference the file number so the clerk can route it. Do not invent any facts beyond the above.');

  return { system: SYSTEM, prompt: lines.join('\n') };
}

/** The generate boundary is schema-bound, so ask for the draft in a named field. */
export const COMMENT_DRAFT_SCHEMA = {
  type: 'object',
  properties: { comment: { type: 'string' } },
  required: ['comment'],
  additionalProperties: false,
};

/**
 * Draft the comment via the injected generate boundary. Thin.
 *
 * Accepts both shapes the boundary can return: a bare string (test fakes) and the parsed
 * `{ comment }` object that createClaudeGenerate actually resolves to — it always applies a
 * json_schema, so it never yields a string. Blindly String()-ing that object rendered a literal
 * "[object Object]" into the comment modal for every real user.
 *
 * @param {object} input - same shape as buildCommentDraftPrompt
 * @param {{ generate: (args: {system: string, prompt: string}) => Promise<string|{comment: string}> }} deps
 * @returns {Promise<string>}
 */
export async function draftComment(input, { generate }) {
  const { system, prompt } = buildCommentDraftPrompt(input);
  const out = await generate({ system, prompt });
  const text = typeof out === 'string' ? out : (out?.comment ?? '');
  return String(text ?? '').trim();
}
