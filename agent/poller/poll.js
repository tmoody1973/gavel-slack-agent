import { diffNewItems } from './diff.js';
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
 * }} deps
 */
export async function runPoll(deps) {
  const { client, fetchUpcomingFinalEvents, fetchEventItems, readSeenEventItemIds, enqueueDetected } = deps;

  const events = await fetchUpcomingFinalEvents();
  const fetched = [];
  for (const event of events) {
    const items = await fetchEventItems(event.eventId);
    for (const item of items) fetched.push(toDetectedItem(client, event, item));
  }

  const seenIds = await readSeenEventItemIds(client);
  const seenKeys = new Set(seenIds.map((id) => detectionKey(client, id)));
  const newItems = diffNewItems(fetched, seenKeys);

  if (newItems.length > 0) await enqueueDetected(newItems);
  return { fetchedCount: fetched.length, newItems };
}
