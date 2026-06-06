import assert from 'node:assert';
import { describe, it } from 'node:test';

import { countWords } from '../../summarizer/words.js';

describe('countWords', () => {
  it('counts words separated by single spaces', () => {
    assert.strictEqual(countWords('the council approved the rezoning'), 5);
  });

  it('collapses irregular whitespace and newlines', () => {
    assert.strictEqual(countWords('  the   council\n approved\tthe rezoning  '), 5);
  });

  it('returns 0 for an empty or whitespace-only string', () => {
    assert.strictEqual(countWords(''), 0);
    assert.strictEqual(countWords('   \n  '), 0);
  });
});
