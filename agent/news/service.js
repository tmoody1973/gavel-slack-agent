// agent/news/service.js
// Ties the news pieces together for both surfaces: cache-first → fetch → Claude gate → cap.
// Every public method is degrade-safe (returns [] on any failure) so news can never break an
// alert or a search.
import { buildNewsQuery } from './query.js';
import { filterRelevant } from './relevance.js';

const DEFAULT_RAW_LIMIT = 5;
const DEFAULT_MAX_SHOWN = 3;

const normalizeTerm = (term) =>
  String(term ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

/**
 * @param {{
 *   source: { fetchNews: (input: { query: string }) => Promise<object[]> },
 *   generate: (input: { system: string, prompt: string }) => Promise<{ relevant: number[] }>,
 *   getCached: (key: string) => Promise<object[]|null>,
 *   putCached: (key: string, articles: object[]) => Promise<unknown>,
 *   now?: () => number,
 *   rawLimit?: number,
 *   maxShown?: number,
 * }} deps
 */
export function createNewsService(deps) {
  const { source, generate, getCached, putCached, rawLimit = DEFAULT_RAW_LIMIT, maxShown = DEFAULT_MAX_SHOWN } = deps;

  async function resolve(key, query, subject, cap) {
    try {
      const cached = await getCached(key).catch(() => null);
      if (cached) return cached.slice(0, cap);
      const fetchedRaw = await source.fetchNews({ query });
      const raw = (Array.isArray(fetchedRaw) ? fetchedRaw : []).slice(0, rawLimit);
      const gatedRaw = await filterRelevant(subject, raw, { generate });
      const gated = (Array.isArray(gatedRaw) ? gatedRaw : []).slice(0, cap);
      await putCached(key, gated).catch(() => {});
      return gated;
    } catch {
      return [];
    }
  }

  async function enrichForAlert({ fileNumber, title, addresses }) {
    const built = buildNewsQuery({ title, addresses });
    if (!built) return [];
    const subject = [title, built.address].filter(Boolean).join(' — ');
    return resolve(`alert:${fileNumber}`, built.query, subject, maxShown);
  }

  async function searchNews({ term, limit = DEFAULT_RAW_LIMIT }) {
    const normalized = normalizeTerm(term);
    if (!normalized) return [];
    return resolve(`search:${normalized}`, `${normalized} Milwaukee`, normalized, limit);
  }

  return { enrichForAlert, searchNews };
}
