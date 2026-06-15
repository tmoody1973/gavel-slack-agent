import assert from 'node:assert/strict';
import { test } from 'node:test';
import { embedTexts } from '../../zoning/embed.js';

function fakeFetch(captured) {
  return async (url, init) => {
    captured.url = url;
    captured.body = JSON.parse(init.body);
    captured.auth = init.headers.Authorization;
    const data = captured.body.input.map((_, i) => ({ embedding: Array(1536).fill(i / 10) }));
    return { ok: true, json: async () => ({ data }) };
  };
}

test('embeds a batch and returns one vector per input, in order', async () => {
  const captured = {};
  const vectors = await embedTexts(['a', 'b', 'c'], { apiKey: 'sk-test', fetchFn: fakeFetch(captured) });
  assert.equal(vectors.length, 3);
  assert.equal(vectors[0].length, 1536);
  assert.equal(captured.body.model, 'text-embedding-3-small');
  assert.deepEqual(captured.body.input, ['a', 'b', 'c']);
  assert.equal(captured.auth, 'Bearer sk-test');
});

test('throws a clear error on a non-ok response', async () => {
  const fetchFn = async () => ({ ok: false, status: 429, text: async () => 'rate limited' });
  await assert.rejects(() => embedTexts(['a'], { apiKey: 'sk', fetchFn }), /embeddings request failed: 429/);
});
