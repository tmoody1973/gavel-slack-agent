// agent/news/source.js
// The NewsSource interface + its first implementation: Google News RSS search (free, no key,
// hyperlocal, real article links). A future exaNewsSource.js exports the same { fetchNews } shape.
// Degrade-safe at the boundary: any failure returns [] so news can never break a caller.

import { parseGoogleNewsRss } from './rss.js';

const DEFAULT_TIMEOUT_MS = 5000;
const ENDPOINT = 'https://news.google.com/rss/search';

/**
 * @param {{ fetch: typeof fetch, userAgent: string, timeoutMs?: number }} deps
 * @returns {{ fetchNews: (input: { query: string, sinceDays?: number }) => Promise<Array<object>> }}
 */
export function createGoogleNewsSource({ fetch, userAgent, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  async function fetchNews({ query, sinceDays = 30 }) {
    if (!query?.trim()) return [];
    const q = `${query} when:${sinceDays}d`;
    const url = `${ENDPOINT}?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': userAgent, Accept: 'application/rss+xml, application/xml' },
        signal: controller.signal,
      });
      if (!res.ok) return [];
      return parseGoogleNewsRss(await res.text());
    } catch {
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  return { fetchNews };
}
