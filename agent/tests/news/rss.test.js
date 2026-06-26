// agent/tests/news/rss.test.js
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseGoogleNewsRss } from '../../news/rss.js';

const SAMPLE = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Google News</title>
  <item>
    <title>Data center planned for 5825 W Hope Ave - WTMJ</title>
    <link>https://news.google.com/rss/articles/ABC123?oc=5</link>
    <pubDate>Tue, 24 Jun 2026 14:02:00 GMT</pubDate>
    <source url="https://www.tmj4.com">TMJ4</source>
    <description>&lt;a href="x"&gt;Data center planned&lt;/a&gt;</description>
  </item>
  <item>
    <title>Council weighs zoning change - Urban Milwaukee</title>
    <link>https://news.google.com/rss/articles/DEF456</link>
    <pubDate>Mon, 23 Jun 2026 09:00:00 GMT</pubDate>
    <source url="https://urbanmilwaukee.com">Urban Milwaukee</source>
  </item>
</channel></rss>`;

describe('parseGoogleNewsRss', () => {
  it('parses each item into title, url, source, publishedAt', () => {
    const out = parseGoogleNewsRss(SAMPLE);
    assert.equal(out.length, 2);
    assert.equal(out[0].title, 'Data center planned for 5825 W Hope Ave - WTMJ');
    assert.equal(out[0].url, 'https://news.google.com/rss/articles/ABC123?oc=5');
    assert.equal(out[0].source, 'TMJ4');
    assert.equal(out[0].publishedAt, 'Tue, 24 Jun 2026 14:02:00 GMT');
    assert.equal(out[1].source, 'Urban Milwaukee');
  });

  it('returns [] for empty or malformed input instead of throwing', () => {
    assert.deepEqual(parseGoogleNewsRss(''), []);
    assert.deepEqual(parseGoogleNewsRss('not xml at all'), []);
    assert.deepEqual(parseGoogleNewsRss(undefined), []);
  });

  it('decodes HTML entities in the title and tolerates a missing source', () => {
    const xml = `<rss><channel><item>
      <title>Parks &amp; Rec budget vote</title>
      <link>https://news.google.com/x</link>
      <pubDate>Wed, 25 Jun 2026 00:00:00 GMT</pubDate>
    </item></channel></rss>`;
    const out = parseGoogleNewsRss(xml);
    assert.equal(out[0].title, 'Parks & Rec budget vote');
    assert.equal(out[0].source, null);
  });
});
