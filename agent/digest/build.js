import { matchSubscriptions } from '../alerts/match.js';
import { digestCard } from '../blockkit/index.js';

const TOP_N = 3;
const DEFAULT_WINDOW_DAYS = 7;

/** Advance a YYYY-MM-DD string by N days (UTC), returning YYYY-MM-DD. */
function addDaysIso(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Soonest-first; walk-ons win ties so "needs attention" floats to the top. */
function byUrgency(a, b) {
  const da = (a.eventDate ?? '').slice(0, 10);
  const db = (b.eventDate ?? '').slice(0, 10);
  if (da !== db) return da < db ? -1 : 1;
  return (b.walkOnFlag ? 1 : 0) - (a.walkOnFlag ? 1 : 0);
}

/**
 * One digest per subscription. Pure over injected data + async enrich. Each
 * subscription's matches (via alerts/match.js) are windowed to [now, now+7d),
 * counted, sorted soonest-first, and only the rendered top-3 are enriched.
 * A zero-match channel still gets an entry whose card is the quiet-week variant;
 * the caller decides whether to post it.
 *
 * @param {{
 *   subscriptions: Array<{channelId: string, committees: string[], keywords: string[], language?: 'en'|'es'}>,
 *   upcoming: Array<object>,
 *   enrich: (row: object) => Promise<{fileNumber?: string, legistarUrl?: string}>,
 *   now: string,
 *   windowDays?: number,
 * }} input
 * @returns {Promise<Array<{channelId: string, language: string, total: number, card: {text: string, blocks: object[]}}>>}
 */
export async function buildChannelDigests({ subscriptions, upcoming, enrich, now, windowDays = DEFAULT_WINDOW_DAYS }) {
  const windowEnd = addDaysIso(now, windowDays);
  const inWindow = upcoming.filter((row) => {
    const d = (row.eventDate ?? '').slice(0, 10);
    return d >= now && d < windowEnd;
  });

  const digests = [];
  for (const sub of subscriptions) {
    const matches = inWindow.filter((row) => matchSubscriptions(row, [sub]).length > 0);
    const total = matches.length;
    const needsAttention = matches.filter((row) => row.walkOnFlag).length;
    const top = [...matches].sort(byUrgency).slice(0, TOP_N);
    const enriched = await Promise.all(
      top.map(async (row) => ({
        title: row.title,
        eventBodyName: row.eventBodyName,
        eventDate: row.eventDate,
        walkOnFlag: row.walkOnFlag,
        ...(await enrich(row)),
      })),
    );
    const language = sub.language ?? 'en';
    digests.push({
      channelId: sub.channelId,
      language,
      total,
      card: digestCard({ total, needsAttention, top: enriched, language }),
    });
  }
  return digests;
}
