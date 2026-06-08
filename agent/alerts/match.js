/**
 * Which subscribed channels should receive this detected item: a channel
 * matches if the item's committee is in its committees list, or any of its
 * keywords appears in the title. Case-insensitive. Returns deduped channelIds.
 *
 * @param {{eventBodyName: string, title: string}} row
 * @param {Array<{channelId: string, committees: string[], keywords: string[]}>} subscriptions
 * @returns {string[]}
 */
export function matchSubscriptions(row, subscriptions) {
  const body = row.eventBodyName.toLowerCase();
  const title = row.title.toLowerCase();
  const channels = new Set();
  for (const sub of subscriptions) {
    const committeeHit = sub.committees.some((committee) => committee.toLowerCase() === body);
    const keywordHit = sub.keywords.some((keyword) => title.includes(keyword.toLowerCase()));
    if (committeeHit || keywordHit) channels.add(sub.channelId);
  }
  return [...channels];
}
