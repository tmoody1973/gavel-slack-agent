import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleAssistantThreadStarted, SUGGESTED_PROMPTS } from '../../../listeners/events/assistant-thread-started.js';

test('prompts are persona-cut: Denise, Marcos (ES), Rachel, watch-flavored (MOO-75)', () => {
  const messages = SUGGESTED_PROMPTS.map((p) => p.message);
  assert.ok(messages.includes("What's happening near my neighborhood this week?"), 'Denise');
  assert.ok(messages.includes('¿Qué decisiones está por tomar la ciudad esta semana?'), 'Marcos ES');
  assert.ok(messages.includes('Show me the vote record on a file'), 'Rachel');
  assert.ok(messages.includes("What's new on the things this channel watches?"), 'watch-flavored');
  assert.equal(SUGGESTED_PROMPTS.length, 4);
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
