/**
 * Which subscribed channels should receive this item. A channel matches if the
 * item's committee/category is in its committees list, any keyword appears in
 * the title/subject, or (E-Notify) the item's aldermanic district equals the
 * channel's boundary. Case-insensitive. Returns deduped channelIds.
 *
 * Accepts both shapes so one router serves both heartbeats:
 *   - Legistar detected item: { eventBodyName, title }
 *   - E-Notify notification:  { category, subject, district }
 *
 * @param {{eventBodyName?: string, category?: string, title?: string, subject?: string, district?: string|null}} row
 * @param {Array<{channelId: string, committees: string[], keywords: string[], boundary?: {type: string, value: string}}>} subscriptions
 * @returns {string[]}
 */
export function matchSubscriptions(row, subscriptions) {
  const body = (row.eventBodyName ?? row.category ?? '').toLowerCase();
  const title = (row.title ?? row.subject ?? '').toLowerCase();
  const district = row.district ?? null;
  const channels = new Set();
  for (const sub of subscriptions) {
    const committeeHit = sub.committees.some((committee) => committee.toLowerCase() === body);
    const keywordHit = sub.keywords.some((keyword) => title.includes(keyword.toLowerCase()));
    const districtHit = district != null && sub.boundary?.type === 'district' && sub.boundary.value === district;
    if (committeeHit || keywordHit || districtHit) channels.add(sub.channelId);
  }
  return [...channels];
}
