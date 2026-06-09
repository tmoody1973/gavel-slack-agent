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

// Curated EN→ES civic glossary injected so Spanish is composed natively with
// correct civic terms (not machine-translated).
const CIVIC_GLOSSARY = [
  'zoning = zonificación',
  'ordinance = ordenanza',
  'resolution = resolución',
  'hearing = audiencia',
  'public comment = comentario público',
  'alderperson = concejal',
  'Common Council = Concejo Municipal',
  'rezoning = recalificación de zona',
  'demolition = demolición',
  'license = licencia',
  'variance = excepción de zonificación (variance)',
  'conditional use = uso condicional',
  'TIF (tax incremental financing) = financiamiento por incremento de impuestos (TIF)',
  'permit = permiso',
].join('; ');

export const BILINGUAL_SYSTEM_PROMPT = `${SUMMARY_SYSTEM_PROMPT}

Produce the SAME three things in BOTH English and Spanish, composed natively in each language (do not translate word-for-word — write each as a fluent civic explainer would). Return an object with "en" and "es" objects, each holding "summary" and "whyItMatters", plus a single shared "addresses" array.

Keep file numbers, street addresses, and committee names in English in both. Use this civic glossary for Spanish terms: ${CIVIC_GLOSSARY}.`;

export const BILINGUAL_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    en: {
      type: 'object',
      properties: { summary: { type: 'string' }, whyItMatters: { type: 'string' } },
      required: ['summary', 'whyItMatters'],
      additionalProperties: false,
    },
    es: {
      type: 'object',
      properties: { summary: { type: 'string' }, whyItMatters: { type: 'string' } },
      required: ['summary', 'whyItMatters'],
      additionalProperties: false,
    },
    addresses: { type: 'array', items: { type: 'string' } },
  },
  required: ['en', 'es', 'addresses'],
  additionalProperties: false,
};

/** Bilingual user prompt — same source context, asks for EN+ES. */
export function buildBilingualPrompt(matter) {
  const { contextText } = buildSourceContext(matter);
  return `Summarize this Milwaukee civic matter for a neighbor, in English and Spanish.\n\n${contextText}`;
}
