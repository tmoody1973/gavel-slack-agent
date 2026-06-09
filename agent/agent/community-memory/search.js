import { formatResultsAsText, mergeAndDedupe } from './merge.js';
import { searchRts } from './rts-client.js';

/**
 * Run the EN+ES community-memory search: fan out both RTS queries in parallel,
 * merge + dedupe, and render plain text for the agent. When RTS is unavailable
 * (blocked, erroring, or disabled), tell the agent to use the slack-mcp search
 * tools instead. Results are never persisted.
 * @param {{ queryEn: string, queryEs: string }} queries
 * @param {{ userToken: string, fetchFn?: typeof fetch, env?: Record<string, string | undefined> }} options
 * @returns {Promise<string>}
 */
export async function runCommunitySearch({ queryEn, queryEs }, { userToken, fetchFn = fetch, env = process.env }) {
  if (env.GAVEL_DISABLE_RTS === '1') {
    return buildFallbackText('disabled by GAVEL_DISABLE_RTS');
  }

  const settled = await Promise.allSettled([
    searchRts(queryEn, { userToken, fetchFn }),
    searchRts(queryEs, { userToken, fetchFn }),
  ]);
  const successes = settled.filter((r) => r.status === 'fulfilled' && r.value.ok).map((r) => r.value);

  if (successes.length === 0) {
    return buildFallbackText(describeFirstFailure(settled));
  }

  const merged = mergeAndDedupe(successes[0].messages, successes[1]?.messages ?? []);
  const note =
    successes.length === 1 ? '\nNote: only one of the two language searches succeeded; results may be partial.' : '';
  return `${formatResultsAsText(merged)}${note}`;
}

function buildFallbackText(reason) {
  const suffix = reason ? ` (${reason})` : '';
  return `Real-Time Search is unavailable${suffix}. Use the slack-mcp search tools to find prior community discussion instead.`;
}

function describeFirstFailure(settled) {
  for (const result of settled) {
    if (result.status === 'rejected') {
      return result.reason?.message ?? 'request failed';
    }
    if (!result.value.ok) {
      return result.value.error;
    }
  }
  return 'unknown_error';
}
