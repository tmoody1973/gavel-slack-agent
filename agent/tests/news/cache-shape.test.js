// agent/tests/news/cache-shape.test.js
// Guards the Article shape the news service caches. Convex handlers run in the Convex runtime and
// are integration-verified live (Task 9/10 verification); here we lock the field contract so the
// service and the validator can't drift.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ARTICLE_FIELDS } from '../../news/article-shape.js';

describe('cached article shape', () => {
  it('is exactly title/url/source/publishedAt', () => {
    assert.deepEqual([...ARTICLE_FIELDS].sort(), ['publishedAt', 'source', 'title', 'url']);
  });
});
