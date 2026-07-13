import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleAssistantThreadStarted, SUGGESTED_PROMPTS } from '../../../listeners/events/assistant-thread-started.js';

// The chips are the product's proof, one per memory. A generic prompt returns a shrug; each of
// these returns the real thing, so a first-time visitor's first click is the wow.
test('each suggested prompt exercises a DIFFERENT memory, and one is in Spanish', () => {
  const messages = SUGGESTED_PROMPTS.map((p) => p.message);
  assert.equal(SUGGESTED_PROMPTS.length, 4);
  assert.ok(
    messages.some((m) => /push back/i.test(m)),
    'live community memory (Slack RTS) — opposition-framed, which is what surfaces residents’ own words',
  );
  assert.ok(
    messages.some((m) => /who owns/i.test(m)),
    'structured civic data (the MCP property record)',
  );
  assert.ok(
    messages.some((m) => /call it on june 29|actually call it/i.test(m)),
    'semantic civic memory (the meeting transcript)',
  );
  assert.ok(
    messages.some((m) => /[¿áéíóúñ]/i.test(m)),
    'bilingual generation — at least one prompt is written in Spanish',
  );
  // Every chip needs a short title; Slack truncates hard in the UI.
  for (const p of SUGGESTED_PROMPTS) assert.ok(p.title.length <= 30, `title too long: ${p.title}`);
});

test('handler sets the suggested prompts on the thread', async () => {
  const calls = [];
  await handleAssistantThreadStarted({
    client: { assistant: { threads: { setSuggestedPrompts: async (args) => calls.push(args) } } },
    event: { assistant_thread: { channel_id: 'C1', thread_ts: '1.0' } },
    logger: { error: () => {} },
  });
  assert.equal(calls[0].channel_id, 'C1');
  assert.equal(calls[0].prompts, SUGGESTED_PROMPTS);
});
