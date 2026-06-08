import { detectionKey } from './keys.js';

/**
 * The idempotent heart of the poller: given fetched items and the set of keys
 * already seen, return only the genuinely-new items. Pure and deterministic —
 * also dedups repeats within one fetch batch.
 *
 * @param {Array<{client: string, eventItemId: number}>} fetchedItems
 * @param {Set<string>|string[]} seenKeys  full detectionKeys, not raw ids
 */
export function diffNewItems(fetchedItems, seenKeys) {
  const seen = seenKeys instanceof Set ? seenKeys : new Set(seenKeys);
  const newItems = [];
  const batch = new Set();
  for (const item of fetchedItems) {
    const key = detectionKey(item.client, item.eventItemId);
    if (seen.has(key) || batch.has(key)) continue;
    batch.add(key);
    newItems.push(item);
  }
  return newItems;
}
