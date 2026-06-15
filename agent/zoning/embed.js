const ENDPOINT = 'https://api.openai.com/v1/embeddings';
const MODEL = 'text-embedding-3-small';

/**
 * Embed a batch of strings with OpenAI text-embedding-3-small. `fetchFn` and
 * `apiKey` are injected so the chunker/ingest pipeline is unit-tested and only
 * the ingest script touches the network. Returns vectors in input order.
 * @param {string[]} texts
 * @param {{apiKey:string, fetchFn?:typeof fetch}} options
 * @returns {Promise<number[][]>}
 */
export async function embedTexts(texts, { apiKey, fetchFn = fetch }) {
  if (texts.length === 0) return [];
  const res = await fetchFn(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: MODEL, input: texts }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`embeddings request failed: ${res.status} ${detail}`);
  }
  const body = await res.json();
  return body.data.map((d) => d.embedding);
}

/** Single-string convenience used by the live tool. */
export async function embedQuery(text, options) {
  const [vector] = await embedTexts([text], options);
  return vector;
}
