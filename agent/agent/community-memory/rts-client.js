const RTS_API_URL = 'https://slack.com/api/assistant.search.context';
const RTS_LIMIT_PER_QUERY = '5';

/**
 * One live Real-Time Search call. Results are returned to the caller only —
 * never persisted (Slack ToS: query the private record live).
 * @param {string} query
 * @param {{ userToken: string, fetchFn?: typeof fetch }} options
 * @returns {Promise<{ ok: boolean, error: string | null, messages: Array<Record<string, any>> }>}
 */
export async function searchRts(query, { userToken, fetchFn = fetch }) {
  const body = new URLSearchParams({
    query,
    content_types: 'messages',
    channel_types: 'public_channel',
    limit: RTS_LIMIT_PER_QUERY,
  });

  const response = await fetchFn(RTS_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${userToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  if (!response.ok) {
    return { ok: false, error: `http_${response.status}`, messages: [] };
  }
  const result = await response.json();

  if (!result.ok) {
    return { ok: false, error: result.error ?? 'unknown_error', messages: [] };
  }
  return { ok: true, error: null, messages: result.results?.messages ?? [] };
}
