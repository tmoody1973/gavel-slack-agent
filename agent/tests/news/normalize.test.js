// agent/tests/news/normalize.test.js
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeNews } from '../../news/normalize.js';

describe('normalizeNews', () => {
  it('renders the headline as a Slack link and source · date as meta, no snippet', () => {
    const row = normalizeNews({
      title: 'Data center planned for 5825 W Hope Ave',
      url: 'https://www.tmj4.com/story',
      source: 'TMJ4',
      publishedAt: 'Tue, 24 Jun 2026 14:02:00 GMT',
    });
    assert.equal(row.source, 'news');
    assert.equal(row.headline, '<https://www.tmj4.com/story|Data center planned for 5825 W Hope Ave>');
    assert.match(row.meta, /TMJ4/);
    assert.equal(row.snippet, null);
    assert.equal(row.messageId, null);
  });

  it('tolerates a missing source/date', () => {
    const row = normalizeNews({ title: 'X', url: 'https://x', source: null, publishedAt: null });
    assert.equal(row.headline, '<https://x|X>');
    assert.equal(row.meta, null);
  });
});
