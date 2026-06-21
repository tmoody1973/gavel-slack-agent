// Channel-scoped live Real-Time Search for the community-memory bridge (MOO-125). RTS searches
// the whole workspace; the bridge only wants to know whether ONE channel has been discussing a
// topic, so we filter the merged results to that channel_id. Returns the live message objects to
// the caller (the judge needs the snippets) — they are NEVER persisted (Slack ToS).

import { mergeAndDedupe } from './merge.js';
import { searchRts } from './rts-client.js';

/**
 * Run the EN+ES RTS queries, merge+dedupe, and keep only messages from `channelId`.
 * Degrades to [] (never throws) when RTS is disabled or both calls fail.
 * @param {{ queryEn: string, queryEs: string, channelId: string }} input
 * @param {{ userToken: string, fetchFn?: typeof fetch, env?: Record<string, string | undefined> }} options
 * @returns {Promise<Array<Record<string, any>>>}
 */
export async function searchChannel(
  { queryEn, queryEs, channelId },
  { userToken, fetchFn = fetch, env = process.env },
) {
  if (env.GAVEL_DISABLE_RTS === '1') return [];

  const settled = await Promise.allSettled([
    searchRts(queryEn, { userToken, fetchFn }),
    searchRts(queryEs, { userToken, fetchFn }),
  ]);
  const successes = settled.filter((r) => r.status === 'fulfilled' && r.value.ok).map((r) => r.value);
  if (successes.length === 0) return [];

  const merged = mergeAndDedupe(successes[0].messages, successes[1]?.messages ?? []);
  return merged.filter((message) => message.channel_id === channelId);
}
