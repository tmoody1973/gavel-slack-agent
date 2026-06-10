import assert from 'node:assert/strict';
import { test } from 'node:test';
import { errorReply } from '../../blockkit/error-reply.js';

test('no_history EN says what is missing and what Gavel can still do', () => {
  const { text, blocks } = errorReply('no_history', {
    legistarUrl: 'https://milwaukee.legistar.com/x',
  });
  assert.match(text, /history/i);
  const all = JSON.stringify(blocks);
  assert.ok(all.includes('milwaukee.legistar.com'));
  assert.match(all, /watch/i);
});

test('no_history ES renders Spanish copy', () => {
  const { text } = errorReply('no_history', { language: 'es' });
  assert.match(text, /historial/i);
});

test('fetch_failed and no_matter kinds render without links when none given', () => {
  for (const kind of ['fetch_failed', 'no_matter']) {
    const { text, blocks } = errorReply(kind, {});
    assert.ok(text.length > 0);
    assert.ok(!JSON.stringify(blocks).includes('undefined'));
  }
});

test('unknown kind falls back to the generic unavailable copy', () => {
  const { text } = errorReply('never_heard_of_it', {});
  assert.match(text, /isn’t available|not available/i);
});
