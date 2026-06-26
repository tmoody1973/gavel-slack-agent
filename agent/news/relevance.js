// agent/news/relevance.js
// The Claude relevance gate. On a civic-trust product a wrong match is worse than no match, so
// nothing surfaces unless the model confirms the article is about THIS item. Pure prompt builder +
// a degrade-safe filter over an injected generate boundary.

export const NEWS_GATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['relevant'],
  properties: {
    relevant: {
      type: 'array',
      items: { type: 'integer' },
      description: 'Indices of articles that are specifically about the subject.',
    },
  },
};

const SYSTEM =
  'You decide which news headlines are specifically about a given local government matter. ' +
  'Return ONLY the indices of headlines that are clearly about THIS matter (same project, place, ' +
  'or decision). Exclude generic city news, listicles, and anything you are unsure about.';

/**
 * @param {string} subject  what the articles must be about (item title + address, or a search term)
 * @param {Array<{ title: string }>} articles
 * @returns {{ system: string, prompt: string }}
 */
export function buildGatePrompt(subject, articles) {
  const list = articles.map((a, i) => `[${i}] ${a.title}`).join('\n');
  const prompt = `Subject: ${subject}\n\nHeadlines:\n${list}\n\nReturn the indices that are about the subject.`;
  return { system: SYSTEM, prompt };
}

/**
 * @param {string} subject
 * @param {Array<object>} articles
 * @param {{ generate: (input: { system: string, prompt: string }) => Promise<{ relevant: number[] }> }} deps
 * @returns {Promise<Array<object>>}
 */
export async function filterRelevant(subject, articles, { generate }) {
  if (!Array.isArray(articles) || articles.length === 0) return [];
  try {
    const { system, prompt } = buildGatePrompt(subject, articles);
    const result = await generate({ system, prompt });
    const indices = result?.relevant;
    if (!Array.isArray(indices)) return [];
    const keep = new Set(indices.filter((i) => Number.isInteger(i)));
    return articles.filter((_, i) => keep.has(i));
  } catch {
    return [];
  }
}
