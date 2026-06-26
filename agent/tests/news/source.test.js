// agent/tests/news/source.test.js
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createGoogleNewsSource } from '../../news/source.js';

const RSS = `<rss><channel><item>
  <title>Data center planned - TMJ4</title>
  <link>https://news.google.com/x</link>
  <pubDate>Tue, 24 Jun 2026 14:02:00 GMT</pubDate>
  <source url="https://tmj4.com">TMJ4</source>
</item></channel></rss>`;

describe('createGoogleNewsSource', () => {
  it('builds a Google News RSS URL with the query and UA, returns parsed articles', async () => {
    const calls = [];
    const fetch = async (url, opts) => {
      calls.push({ url, opts });
      return { ok: true, status: 200, text: async () => RSS };
    };
    const source = createGoogleNewsSource({ fetch, userAgent: 'GavelTest/1.0' });
    const out = await source.fetchNews({ query: '5825 W Hope Ave data center Milwaukee' });
    assert.equal(out.length, 1);
    assert.equal(out[0].source, 'TMJ4');
    assert.match(calls[0].url, /news\.google\.com\/rss\/search/);
    assert.match(calls[0].url, /5825/);
    assert.equal(calls[0].opts.headers['User-Agent'], 'GavelTest/1.0');
  });

  it('degrades to [] on a non-200 response', async () => {
    const fetch = async () => ({ ok: false, status: 503, text: async () => '' });
    const source = createGoogleNewsSource({ fetch, userAgent: 'GavelTest/1.0' });
    assert.deepEqual(await source.fetchNews({ query: 'x' }), []);
  });

  it('degrades to [] when fetch throws (timeout/abort)', async () => {
    const fetch = async () => {
      throw new Error('aborted');
    };
    const source = createGoogleNewsSource({ fetch, userAgent: 'GavelTest/1.0' });
    assert.deepEqual(await source.fetchNews({ query: 'x' }), []);
  });
});
