import assert from 'node:assert';
import { describe, it } from 'node:test';

import {
  buildDisclosureMessage,
  buildSeedPlan,
  CONTENT_DATE_RE,
  DISCLOSURE_MARKER,
  formatMessage,
} from '../../sandbox/plan.js';

describe('formatMessage', () => {
  it('prefixes the content-date and matches CONTENT_DATE_RE', () => {
    const out = formatMessage({ date: 'Feb 2025', text: 'Hello neighbors' });
    assert.ok(out.includes('Hello neighbors'));
    assert.ok(out.includes('[Feb 2025]'));
    assert.ok(CONTENT_DATE_RE.test(out), `expected content-date prefix on: ${out}`);
  });
});

describe('buildDisclosureMessage', () => {
  it('always contains the staged-sandbox marker', () => {
    assert.ok(buildDisclosureMessage('en').includes(DISCLOSURE_MARKER));
  });

  it('appends a Spanish line for es channels only', () => {
    const en = buildDisclosureMessage('en');
    const es = buildDisclosureMessage('es');
    assert.ok(es.length > en.length, 'es disclosure should append a Spanish translation');
    assert.match(es, /datos|demostraci|sandbox/i);
  });
});

describe('buildSeedPlan', () => {
  const channels = [
    {
      name: 'test-en',
      language: 'en',
      client: 'milwaukee',
      boundary: { type: 'district', value: '7' },
      committees: ['LICENSES COMMITTEE'],
      keywords: ['zoning'],
      messages: [{ date: 'Mar 2024', text: 'standalone one' }],
    },
    {
      name: 'test-es',
      language: 'es',
      client: 'milwaukee',
      boundary: { type: 'district', value: '12' },
      committees: ['LICENSES COMMITTEE'],
      keywords: ['liquor license'],
      messages: [{ date: 'Jan 2024', text: 'welcome' }],
      thread: {
        anchor: 'Punta Cana LLC',
        messages: [
          { date: 'Feb 2025', text: 'parent about 2000 S 13th St' },
          { date: 'Feb 2025', text: 'reply one' },
          { date: 'Feb 2025', text: 'reply two' },
        ],
      },
    },
  ];

  it('produces one plan entry per channel', () => {
    assert.strictEqual(buildSeedPlan(channels).length, 2);
  });

  it('builds upsertSubscription args without channelId (filled at runtime)', () => {
    const [en] = buildSeedPlan(channels);
    assert.deepStrictEqual(Object.keys(en.subscription).sort(), [
      'boundary',
      'client',
      'committees',
      'keywords',
      'language',
    ]);
    assert.ok(!('channelId' in en.subscription), 'channelId is resolved at runtime, not in the plan');
    assert.deepStrictEqual(en.subscription.boundary, { type: 'district', value: '7' });
    assert.strictEqual(en.subscription.language, 'en');
  });

  it('exposes the slack channel name for conversations.list resolution', () => {
    const [en] = buildSeedPlan(channels);
    assert.strictEqual(en.channelName, 'test-en');
  });

  it('tags every thread post with the same thread key and content-dates all posts', () => {
    const es = buildSeedPlan(channels)[1];
    assert.ok(es.posts.length >= 4, 'standalone + 3 thread posts');
    const threadPosts = es.posts.filter((p) => p.thread);
    assert.strictEqual(threadPosts.length, 3);
    assert.ok(threadPosts.every((p) => p.thread === threadPosts[0].thread));
    assert.ok(
      es.posts.every((p) => CONTENT_DATE_RE.test(p.text)),
      'every post text is content-dated',
    );
  });

  it('content-dates every post in every channel', () => {
    for (const plan of buildSeedPlan(channels)) {
      for (const post of plan.posts) {
        assert.ok(CONTENT_DATE_RE.test(post.text), `missing date prefix: ${post.text}`);
      }
    }
  });
});
