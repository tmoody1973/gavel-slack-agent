import { buildSourceContext } from './source.js';

export const MAX_SUMMARY_WORDS = 80;

/**
 * Advocacy-oriented system prompt. Grounds the model in the provided text only
 * (the anti-hallucination guard for sparse matters) and asks for plain English
 * a neighbor can act on, the "why it matters" hook, and any street addresses.
 */
export const SUMMARY_SYSTEM_PROMPT = `You explain Milwaukee city government actions to neighbors and \
neighborhood advocates in plain language. You translate legalese into something a resident with no \
legal or civic background can understand and act on.

Produce three things from the matter text provided:
1. summary: At most ${MAX_SUMMARY_WORDS} words. What the city is actually doing and who it affects. \
Plain English, no jargon, no file numbers in the prose. Lead with the concrete action.
2. whyItMatters: One sentence on why a nearby resident should care (e.g. new housing, demolition, a \
zoning change, money, a hearing they could speak at).
3. addresses: Every street address mentioned in the text, each as written (e.g. "234 S Water St"). \
Empty array if none.

GROUNDING RULES (critical):
- Use ONLY facts present in the provided text. Never invent addresses, dollar amounts, dates, \
sponsors, or outcomes.
- If the text is terse and you cannot tell specifics, describe it at the level the text supports \
rather than guessing. A vague-but-true summary is correct; an invented-but-specific one is a failure.
- Keep legal source terms (committee names, file numbers, addresses) in English even when the rest is \
simplified.`;

/**
 * Build the user prompt for one matter from its available sources.
 * @param {import('./source.js').Matter} matter
 * @returns {string}
 */
export function buildSummaryPrompt(matter) {
  const { contextText } = buildSourceContext(matter);
  return `Summarize this Milwaukee civic matter for a neighbor.\n\n${contextText}`;
}

/**
 * JSON Schema for structured output (Anthropic `output_config.format`).
 * Guarantees the model returns a parseable {summary, whyItMatters, addresses}.
 */
export const SUMMARY_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    whyItMatters: { type: 'string' },
    addresses: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'whyItMatters', 'addresses'],
  additionalProperties: false,
};
