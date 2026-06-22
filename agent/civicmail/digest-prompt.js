// The one batch bilingual summary for the "📬 From the city" digest (MOO-153).
// ONE Claude call per channel over the whole clustered week — NOT one per email.
// Mirrors stories/angle.js + summarizer/bilingual.js: the prompt + schema + validation
// are pure and testable; the Claude call is injected as `generate` (built with
// createClaudeGenerate({ schema: DIGEST_BRIEFING_SCHEMA }) at the boundary).

// EN→ES civic glossary so the Spanish briefing is composed natively (mirrors the
// summarizer + angle generator): the model writes as a fluent civic explainer.
const CIVIC_GLOSSARY_ES =
  'permit = permiso; license = licencia; ordinance = ordenanza; hearing = audiencia; ' +
  'code enforcement = cumplimiento del código; demolition = demolición; zoning = zonificación; ' +
  'Common Council = Concejo Municipal; alderperson = concejal; tavern = taberna; ' +
  'food dealer = vendedor de alimentos; excavation = excavación';

export const DIGEST_BRIEFING_SYSTEM_PROMPT = `You write a short, calm "what the city did near you this week" \
briefing for a neighborhood Slack channel, from a structured roundup of City of Milwaukee E-Notify mail \
(permits, license applications, public meetings). Produce two things, in BOTH English and Spanish:
1. briefing: 2-3 plain sentences summarizing the week — lead with what matters to a resident (meetings to \
attend, license applications nearby), then the routine volume as context. Conversational, not a list.
2. pattern: ONE sentence naming the most notable pattern in the data — a recurring applicant, a cluster of \
one record type, or a hearing with a deadline. If nothing stands out, say the week was routine.

GROUNDING RULES (critical):
- Use ONLY the counts, labels, and names provided. Do NOT invent record types, addresses, dollar amounts, \
dates, applicants, or outcomes. The numbers in the briefing must match the totals given.
- Frame patterns as observations a resident could look into, never as accusations. A recurring applicant is \
"worth noting", never "suspicious". Never assert wrongdoing.
- Keep applicant names, license types, committee names, and record labels exactly as written (in English).

Compose the Spanish natively (do not translate word-for-word — write each as a fluent civic explainer would). \
Use this civic glossary: ${CIVIC_GLOSSARY_ES}.`;

/** JSON Schema for Anthropic structured output — guarantees a parseable bilingual briefing. */
export const DIGEST_BRIEFING_SCHEMA = {
  type: 'object',
  properties: {
    en: {
      type: 'object',
      properties: { briefing: { type: 'string' }, pattern: { type: 'string' } },
      required: ['briefing', 'pattern'],
      additionalProperties: false,
    },
    es: {
      type: 'object',
      properties: { briefing: { type: 'string' }, pattern: { type: 'string' } },
      required: ['briefing', 'pattern'],
      additionalProperties: false,
    },
  },
  required: ['en', 'es'],
  additionalProperties: false,
};

const CATEGORY_LABELS = {
  neighborhood_services: 'permit / code records',
  licenses: 'license actions',
  meetings: 'public meetings',
  newsletter: 'newsletters',
  other: 'other notices',
};

/** "13 Code Enforcement · 7 ROW Excavation Utility · …" from a fold breakdown. */
function renderBreakdown(breakdown) {
  return breakdown.map((b) => `${b.count} ${b.label}`).join(' · ');
}

/**
 * Render the aggregate structure into the grounded user prompt for one batch call.
 * @param {import('./aggregate.js').aggregateCivicMail extends (...a:any)=>infer R ? R : object} aggregate
 * @returns {string}
 */
export function buildDigestBriefingPrompt(aggregate) {
  const { categoryCounts, breakdowns, highlights, recurringEntities } = aggregate;

  const totals = Object.entries(categoryCounts)
    .map(([cat, count]) => `${count} ${CATEGORY_LABELS[cat] ?? cat}`)
    .join(', ');

  const lines = [
    "Summarize this week's City of Milwaukee E-Notify civic mail for a neighborhood Slack channel.",
    '',
    `TOTALS: ${totals || 'nothing this week'}.`,
  ];

  if (breakdowns.neighborhood_services.length) {
    lines.push('', `PERMITS & RECORDS (by type): ${renderBreakdown(breakdowns.neighborhood_services)}.`);
  }
  if (breakdowns.licenses.length) {
    lines.push(`LICENSES (by type): ${renderBreakdown(breakdowns.licenses)}.`);
  }
  if (recurringEntities.length) {
    const named = recurringEntities.map((e) => `${e.entity} (${e.count})`).join('; ');
    lines.push('', `RECURRING APPLICANTS (filed 2+ times this week): ${named}.`);
  }
  if (highlights.length) {
    lines.push('', 'NOTABLE ITEMS:');
    for (const h of highlights) {
      const where = h.district ? ` (District ${h.district})` : '';
      const who = h.business ? ` — ${h.business}` : '';
      lines.push(`  - [${h.category}] ${h.subject}${who}${where}`);
    }
  }

  return lines.join('\n');
}

/**
 * Generate + validate the one bilingual briefing. Throws if the model output is
 * malformed, so an unvalidated briefing never reaches a channel.
 *
 * @param {object} aggregate  the {@link import('./aggregate.js').aggregateCivicMail} result
 * @param {{ generate: (input: {system: string, prompt: string}) => Promise<any> }} deps
 * @returns {Promise<{ en: {briefing: string, pattern: string}, es: {briefing: string, pattern: string} }>}
 */
export async function generateDigestBriefing(aggregate, { generate }) {
  const prompt = buildDigestBriefingPrompt(aggregate);
  const result = await generate({ system: DIGEST_BRIEFING_SYSTEM_PROMPT, prompt });
  const ok = (x) => x && typeof x.briefing === 'string' && typeof x.pattern === 'string';
  if (!ok(result?.en) || !ok(result?.es)) {
    throw new Error('Digest briefing generator returned a malformed result: need en/es each {briefing, pattern}');
  }
  return { en: result.en, es: result.es };
}
