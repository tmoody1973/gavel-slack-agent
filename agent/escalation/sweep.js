// Pure escalation-sweep orchestration (MOO-52). Mirrors poller/poll.js: all I/O
// injected. For each tracked, not-yet-escalated matter it detects the committee→
// Council transition, re-derives the watching channels via the SAME
// matchSubscriptions on the stored detected row, posts a ping, and records the
// matter once.

import { matchSubscriptions } from '../alerts/match.js';
import { detectEscalation } from './detect.js';

export async function runEscalationSweep(deps) {
  const {
    client,
    detectedSince,
    recommendedAfter,
    now,
    listTrackedMatters,
    listEscalatedMatterIds,
    listSubscriptions,
    getMatterHistory,
    getMatterMeta,
    matterUrl,
    buildCard,
    postCard,
    recordEscalation,
    languageFor,
    logger = console,
  } = deps;

  const tracked = (await listTrackedMatters(client)).filter((r) => r.detectedAt >= detectedSince);
  const byMatter = new Map();
  for (const row of tracked) {
    if (!byMatter.has(row.matterId)) byMatter.set(row.matterId, []);
    byMatter.get(row.matterId).push(row);
  }

  const escalated = new Set(await listEscalatedMatterIds(client));
  const subscriptions = await listSubscriptions(client);

  let detected = 0;
  let pinged = 0;
  for (const [matterId, rows] of byMatter) {
    if (escalated.has(matterId)) continue;
    try {
      const esc = detectEscalation(await getMatterHistory(matterId));
      if (!esc) continue;
      // A timely heads-up only: a recommendation older than the window means the
      // matter stalled (or its vote long passed) — not an upcoming Council vote.
      if (recommendedAfter && esc.date && esc.date.slice(0, 10) < recommendedAfter) continue;
      detected += 1;

      const meta = await getMatterMeta(matterId);
      const channels = new Set();
      for (const row of rows) for (const ch of matchSubscriptions(row, subscriptions)) channels.add(ch);

      if (channels.size > 0) {
        const url = matterUrl(matterId, meta.guid);
        for (const channel of channels) {
          const card = buildCard(
            {
              fileNumber: meta.fileNumber,
              title: meta.title || rows[0].title,
              committee: esc.committee,
              recommendedDate: esc.date,
              url,
            },
            languageFor(channel),
          );
          await postCard(channel, card);
          pinged += 1;
        }
      }

      await recordEscalation({
        client,
        matterId,
        fileNumber: meta.fileNumber,
        committee: esc.committee,
        recommendedDate: esc.date,
        channelsPinged: channels.size,
        escalatedAt: now(),
      });
      logger.log?.(`[escalation] matter ${matterId}: ${channels.size} ping(s)`);
    } catch (err) {
      logger.error?.(`[escalation] matter ${matterId} failed: ${err.message}`);
    }
  }

  return { trackedCount: byMatter.size, detected, pinged };
}
