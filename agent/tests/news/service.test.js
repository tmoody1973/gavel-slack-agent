// agent/tests/news/service.test.js
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createNewsService } from '../../news/service.js';

function harness({ fetched = [], gateKeepAll = true, cached = null } = {}) {
  const calls = { fetchNews: 0, generate: 0, put: [] };
  const source = {
    fetchNews: async () => {
      calls.fetchNews++;
      return fetched;
    },
  };
  const generate = async () => {
    calls.generate++;
    return { relevant: gateKeepAll ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] : [] };
  };
  const store = new Map();
  if (cached) store.set(cached.key, cached.articles);
  const deps = {
    source,
    generate,
    getCached: async (key) => store.get(key) ?? null,
    putCached: async (key, articles) => {
      calls.put.push({ key, articles });
      store.set(key, articles);
    },
    now: () => 1_700_000_000_000,
  };
  return { calls, deps };
}

const ART = (n) => ({ title: `Data center story ${n}`, url: `https://a/${n}`, source: 'TMJ4', publishedAt: 'x' });

describe('createNewsService.enrichForAlert', () => {
  it('skips fetch entirely for an item with no query (returns [])', async () => {
    const h = harness({ fetched: [ART(1)] });
    const out = await createNewsService(h.deps).enrichForAlert({
      fileNumber: '260030',
      title: 'Appointment of a member to the board',
      addresses: [],
    });
    assert.deepEqual(out, []);
    assert.equal(h.calls.fetchNews, 0);
  });

  it('fetches, gates, caps to 3, and writes the cache on a miss', async () => {
    const h = harness({ fetched: [ART(1), ART(2), ART(3), ART(4)] });
    const out = await createNewsService(h.deps).enrichForAlert({
      fileNumber: '260030',
      title: 'Data center at 5825 W Hope Ave',
      addresses: ['5825 W Hope Ave'],
    });
    assert.equal(out.length, 3);
    assert.equal(h.calls.fetchNews, 1);
    assert.equal(h.calls.put[0].key, 'alert:260030');
  });

  it('serves from cache without fetching or gating on a hit', async () => {
    const h = harness({ fetched: [ART(9)], cached: { key: 'alert:260030', articles: [ART(1)] } });
    const out = await createNewsService(h.deps).enrichForAlert({
      fileNumber: '260030',
      title: 'Data center at 5825 W Hope Ave',
      addresses: ['5825 W Hope Ave'],
    });
    assert.equal(out.length, 1);
    assert.equal(out[0].url, 'https://a/1');
    assert.equal(h.calls.fetchNews, 0);
    assert.equal(h.calls.generate, 0);
  });

  it('returns [] (never throws) when the source explodes', async () => {
    const h = harness({ fetched: [ART(1)] });
    h.deps.source.fetchNews = async () => {
      throw new Error('network');
    };
    const out = await createNewsService(h.deps).enrichForAlert({
      fileNumber: '260030',
      title: 'Data center at 5825 W Hope Ave',
      addresses: ['5825 W Hope Ave'],
    });
    assert.deepEqual(out, []);
  });

  it('returns [] (never throws) when getCached rejects', async () => {
    const h = harness({ fetched: [ART(1)] });
    h.deps.getCached = async () => {
      throw new Error('convex read down');
    };
    const out = await createNewsService(h.deps).enrichForAlert({
      fileNumber: '260030',
      title: 'Data center at 5825 W Hope Ave',
      addresses: ['5825 W Hope Ave'],
    });
    assert.ok(Array.isArray(out));
  });

  it('still returns the gated articles when putCached rejects', async () => {
    const h = harness({ fetched: [ART(1), ART(2)] });
    h.deps.putCached = async () => {
      throw new Error('convex write down');
    };
    const out = await createNewsService(h.deps).enrichForAlert({
      fileNumber: '260030',
      title: 'Data center at 5825 W Hope Ave',
      addresses: ['5825 W Hope Ave'],
    });
    assert.equal(out.length, 2);
  });
});

describe('createNewsService.searchNews', () => {
  it('gates against the term, caps to limit, caches by normalized query', async () => {
    const h = harness({ fetched: [ART(1), ART(2)] });
    const out = await createNewsService(h.deps).searchNews({ term: '  Data Center ', limit: 5 });
    assert.equal(out.length, 2);
    assert.equal(h.calls.put[0].key, 'search:data center');
  });
});
