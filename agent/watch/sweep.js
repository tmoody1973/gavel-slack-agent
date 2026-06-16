// Pure watchlist-sweep orchestration (MOO-53). Mirrors poller/poll.js: all I/O
// is injected, so the matching + dedup + grouping logic is unit-tested with
// fakes and only the cron wiring touches Legistar/CKAN/Convex/Slack.

import { dedupKey, matchMatter } from './match.js';

/**
 * Diff new matters + permits against every watch, post one card per channel with
 * its fresh hits, and record those hits so the next sweep won't repeat them.
 * Records AFTER posting a channel's card, mirroring the poller's markSent-after-post.
 *
 * @param {{
 *   watches: Array<{channelId: string, entity: string, client: string}>,
 *   lookbackDays: number,
 *   sinceDate: string,
 *   now: () => number,
 *   fetchRecentMatters: (lookbackDays: number) => Promise<Array<object>>,
 *   resolvePermitHits: (watch: object, sinceDate: string) => Promise<Array<object>>,
 *   listAlertedKeys: () => Promise<Array<{channelId: string, entity: string, kind: string, refId: string}>>,
 *   buildCard: (hits: Array<object>, language: string) => {text: string, blocks: object[]},
 *   postCard: (channelId: string, card: object) => Promise<void>,
 *   recordAlerts: (alerts: Array<object>) => Promise<number>,
 *   languageFor: (channelId: string) => 'en' | 'es',
 *   logger?: Console,
 * }} deps
 */
export async function runWatchSweep(deps) {
  const {
    watches,
    lookbackDays,
    sinceDate,
    now,
    fetchRecentMatters,
    resolvePermitHits,
    listAlertedKeys,
    buildCard,
    postCard,
    recordAlerts,
    languageFor,
    logger = console,
  } = deps;

  const matters = await fetchRecentMatters(lookbackDays);
  const alerted = new Set((await listAlertedKeys()).map(dedupKey));

  const hitsByChannel = new Map();
  for (const watch of watches) {
    const matterHits = matters
      .filter((m) => matchMatter(watch.entity, m))
      .map((m) => ({ channelId: watch.channelId, entity: watch.entity, kind: 'matter', refId: String(m.matterId), matter: m }));

    const permitRows = await resolvePermitHits(watch, sinceDate);
    const permitHits = permitRows.map((p) => ({
      channelId: watch.channelId,
      entity: watch.entity,
      kind: 'permit',
      refId: String(p.recordId),
      permit: p,
    }));

    for (const hit of [...matterHits, ...permitHits]) {
      const key = dedupKey(hit);
      if (alerted.has(key)) continue;
      alerted.add(key); // also dedupes within this run (same matter, two watches in one channel)
      if (!hitsByChannel.has(hit.channelId)) hitsByChannel.set(hit.channelId, []);
      hitsByChannel.get(hit.channelId).push(hit);
    }
  }

  let freshHits = 0;
  for (const [channelId, hits] of hitsByChannel) {
    const card = buildCard(hits, languageFor(channelId));
    await postCard(channelId, card);
    await recordAlerts(
      hits.map((h) => ({ channelId: h.channelId, entity: h.entity, kind: h.kind, refId: h.refId, alertedAt: now() })),
    );
    freshHits += hits.length;
    logger.log(`[watch-sweep] ${channelId}: posted ${hits.length} hit(s)`);
  }

  return { matterCount: matters.length, watchCount: watches.length, channels: hitsByChannel.size, freshHits };
}
