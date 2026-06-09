import { diffNewItems } from './diff.js';
import { computeAlertFlags } from './flags.js';
import { detectionKey } from './keys.js';
import { toDetectedItem } from './legistar.js';

/**
 * Run one poll cycle: fetch upcoming Final events + their agenda items, diff
 * against last-seen state, and enqueue the genuinely-new items. Every boundary
 * (Legistar fetch, Convex read/write) is injected so this orchestration is
 * unit-testable with in-memory fakes; the heart (diffNewItems) is pure.
 *
 * @param {{
 *   client: string,
 *   fetchUpcomingFinalEvents: () => Promise<object[]>,
 *   fetchEventItems: (eventId: number) => Promise<object[]>,
 *   readSeenEventItemIds: (client: string) => Promise<number[]>,
 *   enqueueDetected: (items: object[]) => Promise<number>,
 *   now?: () => string,
 * }} deps
 */
export async function runPoll(deps) {
  const { client, fetchUpcomingFinalEvents, fetchEventItems, readSeenEventItemIds, enqueueDetected } = deps;
  const nowIso = deps.now ? deps.now() : new Date().toISOString();

  const events = await fetchUpcomingFinalEvents();
  const fetched = [];
  for (const event of events) {
    const items = await fetchEventItems(event.eventId);
    for (const item of items) {
      // Only matter-bearing items become alert jobs — boilerplate agenda lines
      // (webcast/accessibility notices, headers) carry no EventItemMatterId and
      // are nothing to summarize.
      if (item.matterId === undefined) continue;
      const row = toDetectedItem(client, event, item);
      // MOO-51: walk-on (<48h notice) + consent-calendar flags, stored only
      // when set so the Convex validator sees absent rather than false.
      const flags = computeAlertFlags({ eventDate: event.eventDate, consent: item.consent }, nowIso);
      if (flags.walkOnFlag) row.walkOnFlag = true;
      if (flags.consentFlag) row.consentFlag = true;
      fetched.push(row);
    }
  }

  const seenIds = await readSeenEventItemIds(client);
  const seenKeys = new Set(seenIds.map((id) => detectionKey(client, id)));
  const newItems = diffNewItems(fetched, seenKeys);

  if (newItems.length > 0) await enqueueDetected(newItems);
  return { fetchedCount: fetched.length, newItems };
}
