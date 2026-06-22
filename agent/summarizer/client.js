import Anthropic from '@anthropic-ai/sdk';

import { buildDocumentBlocks } from './documents.js';
import { SUMMARY_OUTPUT_SCHEMA } from './prompt.js';

// Sonnet per the PRD stack + MOO-42 acceptance criteria: cheap and fast enough
// to run on every agenda item the hourly poller surfaces.
export const SUMMARY_MODEL = 'claude-sonnet-4-6';

/**
 * Build the real `generate` dependency for {@link import('./summarize.js').summarizeMatter}.
 * Wraps the Anthropic Messages API with structured output so the model is
 * constrained to return parseable {summary, whyItMatters, addresses} JSON.
 *
 * Not unit-tested by design (it is the non-deterministic boundary) — its output
 * is proven against real Milwaukee matters in the verification gate.
 *
 * @param {{ apiKey?: string, model?: string, client?: Anthropic }} [options]
 * @returns {import('./summarize.js').Generate}
 */
export function createClaudeGenerate(options = {}) {
  const { apiKey, model = SUMMARY_MODEL, client, schema = SUMMARY_OUTPUT_SCHEMA, maxTokens = 1024 } = options;
  const anthropic = client ?? new Anthropic(apiKey ? { apiKey } : undefined);

  return async function generate({ system, prompt, documents }) {
    // PDF attachments (e.g. a hearing agenda) ride through here as native Claude
    // `document` blocks — the non-deterministic boundary, kept out of the pure
    // source/prompt builders. When present, the user turn becomes a content array.
    const { blocks } = buildDocumentBlocks(documents);
    const content = blocks.length > 0 ? [...blocks, { type: 'text', text: prompt }] : prompt;
    const response = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content }],
      output_config: { format: { type: 'json_schema', schema } },
    });

    const text = response.content.find((block) => block.type === 'text')?.text ?? '';
    try {
      return JSON.parse(text);
    } catch (cause) {
      throw new Error(`Summarizer could not parse model output as JSON: ${text.slice(0, 200)}`, { cause });
    }
  };
}
