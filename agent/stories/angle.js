// The grounded story angle (MOO-127). For a single newsworthy lead, ask Claude for a
// one-line *hook* ("here's the story") and a one-line *why it's a story* — written from
// the real matter record only. This is the project's leads-not-verdicts rule made into a
// prompt: surface "worth a look" + the record, never assert wrongdoing, never invent a
// fact. Schema-validated so a malformed angle is dropped, not shipped.
//
// The Claude call is INJECTED as `generate` (built with createClaudeGenerate({ schema:
// STORY_ANGLE_SCHEMA }) at the boundary) — the prompt/validation stay pure and testable.

const TAG_GLOSS = {
  money: 'large public money / contracts / bonding / TIF',
  accountability: 'police, surveillance, ethics, appointments, or no-bid — a power/accountability angle',
  equity: 'displacement — demolitions, evictions, or closures',
  conflict: 'a contested item — appeal, protest, denial, or revocation',
  novelty: 'a first-of-its-kind ordinance, pilot, or new board',
  anomaly: 'a process anomaly — added late (walk-on) or buried on the consent calendar',
  recurrence: 'a repeat entity that keeps appearing across the record',
};

// EN→ES civic glossary so the Spanish angle is composed natively (mirrors the
// summarizer): the model writes as a fluent civic explainer, not a translator.
const CIVIC_GLOSSARY_ES =
  'ordinance = ordenanza; resolution = resolución; alderperson = concejal; Common Council = Concejo Municipal; ' +
  'hearing = audiencia; license = licencia; demolition = demolición; appeal = apelación; appointment = nombramiento; ' +
  'bonding = emisión de bonos; TIF = financiamiento por incremento de impuestos (TIF)';

const GROUNDING_RULES = `GROUNDING RULES (critical — this is journalism, accuracy is everything):
- Use ONLY facts present in the provided record (title, body text, sponsor, committee). Never invent \
dollar amounts, addresses, dates, votes, motives, or outcomes.
- Frame it as a LEAD, not a verdict: "worth a look", "raises the question", "warrants a closer look". \
NEVER assert wrongdoing, illegality, or corruption — you are pointing a reporter at the record, not judging it.
- If the record is terse and you cannot tell the specifics, say what the record supports and note it is thin. \
A vague-but-true hook is correct; a specific-but-invented one is a failure.
- Keep file numbers, addresses, committee names, and proper names exactly as written.`;

/**
 * System prompt for the story-angle generator, localized.
 * @param {'en'|'es'} [language]
 * @returns {string}
 */
export function storyAngleSystemPrompt(language = 'en') {
  const base = `You are a city-hall assignment editor helping a thin local newsroom decide what to cover. \
For one item on an upcoming Milwaukee government agenda, produce two things:
1. hook: One sentence a reporter could use as a story angle — concrete, plain English, drawn from the record.
2. whyStory: One sentence on why it's newsworthy (the public-interest stakes), tied to the tagged reasons.

${GROUNDING_RULES}`;

  if (language === 'es') {
    return `${base}

Write BOTH hook and whyStory in Spanish, composed natively as a fluent civic journalist would (do not \
translate word-for-word). Keep proper names, file numbers, addresses, and committee names in English. \
Use this civic glossary: ${CIVIC_GLOSSARY_ES}.`;
  }
  return base;
}

/**
 * JSON Schema for Anthropic structured output — guarantees a parseable angle.
 */
export const STORY_ANGLE_SCHEMA = {
  type: 'object',
  properties: {
    hook: { type: 'string' },
    whyStory: { type: 'string' },
  },
  required: ['hook', 'whyStory'],
  additionalProperties: false,
};

/**
 * Build the user prompt for one lead from its real record.
 * @param {{ item: {title?: string, eventBodyName?: string}, tags: Array<{kind: string}>, matterText?: string, sponsorName?: string|null }} lead
 * @returns {string}
 */
export function buildStoryAnglePrompt(lead) {
  const { item, tags = [], matterText, sponsorName } = lead;
  const reasons = tags
    .map((tag) => TAG_GLOSS[tag.kind] ?? tag.kind)
    .filter(Boolean)
    .map((reason, index) => `  ${index + 1}. ${reason}`)
    .join('\n');

  const lines = [
    'Assess this single agenda item as a potential story.',
    '',
    `TITLE: ${item?.title ?? '(none)'}`,
    `COMMITTEE: ${item?.eventBodyName ?? '(unknown)'}`,
    sponsorName ? `SPONSOR: ${sponsorName}` : 'SPONSOR: (none listed)',
    '',
    'MATTER TEXT:',
    matterText?.trim() ? matterText.trim() : '(no body text beyond the title — treat as a thin record)',
    '',
    'WHY IT SURFACED (the newsworthiness tags, kinds in brackets):',
    reasons || '  (none)',
    `[tag kinds: ${tags.map((t) => t.kind).join(', ') || 'none'}]`,
  ];
  return lines.join('\n');
}

/**
 * Generate + validate one story angle. Throws if the model output is malformed,
 * so an unvalidated angle never reaches a reporter.
 *
 * @param {object} lead
 * @param {{ generate: (input: {system: string, prompt: string}) => Promise<any>, language?: 'en'|'es' }} deps
 * @returns {Promise<{ hook: string, whyStory: string }>}
 */
export async function generateStoryAngle(lead, { generate, language = 'en' }) {
  const system = storyAngleSystemPrompt(language);
  const prompt = buildStoryAnglePrompt(lead);
  const result = await generate({ system, prompt });
  if (typeof result?.hook !== 'string' || typeof result?.whyStory !== 'string') {
    throw new Error('Story angle generator returned a malformed result: need {hook, whyStory} strings');
  }
  return { hook: result.hook, whyStory: result.whyStory };
}
