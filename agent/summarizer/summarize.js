import { buildSummaryPrompt, SUMMARY_SYSTEM_PROMPT } from './prompt.js';
import { buildSourceContext } from './source.js';
import { countWords } from './words.js';

/**
 * @typedef {Object} SummaryResult
 * @property {string} summary
 * @property {string} whyItMatters
 * @property {string[]} addresses
 *
 * @callback Generate
 * @param {{ system: string, prompt: string }} input
 * @returns {Promise<SummaryResult>}
 */

/**
 * Summarize one civic matter into plain English + "why it matters" + addresses.
 *
 * The Claude call is injected as `generate` so this logic — source selection,
 * prompt assembly, output validation, word counting — is testable without a
 * network. Output quality is proven separately against real matters.
 *
 * @param {import('./source.js').Matter} matter
 * @param {{ generate: Generate }} deps
 * @returns {Promise<SummaryResult & { sourcesUsed: string[], wordCount: number }>}
 */
export async function summarizeMatter(matter, { generate }) {
  const { sourcesUsed } = buildSourceContext(matter);
  const prompt = buildSummaryPrompt(matter);

  const result = await generate({ system: SUMMARY_SYSTEM_PROMPT, prompt });
  assertWellFormed(result);

  return {
    summary: result.summary,
    whyItMatters: result.whyItMatters,
    addresses: result.addresses,
    sourcesUsed,
    wordCount: countWords(result.summary),
  };
}

/**
 * Fail fast if the generator returned a shape we can't trust downstream.
 * @param {unknown} result
 */
function assertWellFormed(result) {
  const value = /** @type {Record<string, unknown>} */ (result ?? {});
  if (typeof value.summary !== 'string' || typeof value.whyItMatters !== 'string') {
    throw new Error('Summarizer received a malformed result: missing summary or whyItMatters');
  }
  if (!Array.isArray(value.addresses)) {
    throw new Error('Summarizer received a malformed result: addresses must be an array');
  }
}
