import assert from 'node:assert';
import { describe, it } from 'node:test';

import { formatResultsAsText, mergeAndDedupe } from '../../agent/community-memory/merge.js';

function message(overrides = {}) {
  return {
    channel_id: 'C001',
    message_ts: '1710000000.000100',
    author_user_id: 'U001',
    is_author_bot: false,
    content: 'we should oppose this rezoning',
    permalink: 'https://example.slack.com/archives/C001/p1710000000000100',
    ...overrides,
  };
}

describe('mergeAndDedupe', () => {
  it('removes duplicates that appear in both language result sets', () => {
    const shared = message();
    const enOnly = message({ message_ts: '1710000001.000100' });
    const merged = mergeAndDedupe([shared, enOnly], [shared]);
    assert.strictEqual(merged.length, 2);
  });

  it('keeps messages with the same ts in different channels', () => {
    const a = message({ channel_id: 'C001' });
    const b = message({ channel_id: 'C002' });
    assert.strictEqual(mergeAndDedupe([a], [b]).length, 2);
  });

  it('sorts newest-first by message_ts', () => {
    const older = message({ message_ts: '1700000000.000100' });
    const newer = message({ message_ts: '1720000000.000100' });
    const merged = mergeAndDedupe([older], [newer]);
    assert.strictEqual(merged[0].message_ts, '1720000000.000100');
  });

  it('caps the merged list at 8 results', () => {
    const en = Array.from({ length: 6 }, (_, i) => message({ message_ts: `17100000${i}0.000100` }));
    const es = Array.from({ length: 6 }, (_, i) => message({ message_ts: `17200000${i}0.000100` }));
    assert.strictEqual(mergeAndDedupe(en, es).length, 8);
  });

  it('handles empty and one-sided inputs', () => {
    assert.deepStrictEqual(mergeAndDedupe([], []), []);
    assert.strictEqual(mergeAndDedupe([message()], []).length, 1);
  });
});

describe('formatResultsAsText', () => {
  it('returns a no-results sentence for an empty list', () => {
    assert.match(formatResultsAsText([]), /No prior community discussion/);
  });

  it('includes date, channel, author, snippet, and permalink', () => {
    const text = formatResultsAsText([message()]);
    assert.match(text, /2024-03-09/);
    assert.match(text, /<#C001>/);
    assert.match(text, /<@U001>/);
    assert.match(text, /oppose this rezoning/);
    assert.match(text, /p1710000000000100/);
  });

  it('labels bot authors instead of mentioning them', () => {
    const text = formatResultsAsText([message({ is_author_bot: true })]);
    assert.match(text, /a bot/);
  });

  it('truncates long content to 300 characters', () => {
    const text = formatResultsAsText([message({ content: 'x'.repeat(500) })]);
    assert.ok(!text.includes('x'.repeat(301)));
    assert.match(text, /x{300}…/);
  });

  it('survives missing fields without throwing', () => {
    const text = formatResultsAsText([{ message_ts: 'not-a-number' }]);
    assert.match(text, /unknown date/);
  });
});
