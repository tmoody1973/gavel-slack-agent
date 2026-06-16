import { BILINGUAL_SYSTEM_PROMPT, buildBilingualPrompt } from './prompt.js';
import { buildSourceContext } from './source.js';

/**
 * Summarize one matter into a native bilingual {en, es} pair + addresses.
 * The Claude call is injected as `generate` (built with BILINGUAL_OUTPUT_SCHEMA).
 *
 * Optional `documents` (e.g. a PDF agenda) are passed through to the Claude
 * boundary as native document blocks — the pure source/prompt builders stay
 * text-only, preserving the test seam.
 *
 * @param {import('./source.js').Matter} matter
 * @param {{ generate: (input: {system: string, prompt: string, documents?: object[]}) => Promise<any>, documents?: object[] }} deps
 */
export async function summarizeMatterBilingual(matter, { generate, documents }) {
  const { sourcesUsed } = buildSourceContext(matter);
  const prompt = buildBilingualPrompt(matter);
  const result = await generate({ system: BILINGUAL_SYSTEM_PROMPT, prompt, documents });
  assertBilingual(result);
  return { en: result.en, es: result.es, addresses: result.addresses, sourcesUsed };
}

function assertBilingual(result) {
  const ok = (x) => x && typeof x.summary === 'string' && typeof x.whyItMatters === 'string';
  if (!ok(result?.en) || !ok(result?.es) || !Array.isArray(result?.addresses)) {
    throw new Error(
      'Summarizer returned a malformed bilingual result: need en{summary,whyItMatters}, es{...}, addresses[]',
    );
  }
}
