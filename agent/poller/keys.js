/**
 * Stable dedup key for an agenda item across poll runs. Client-scoped so the
 * same EventItemId under a different Legistar client stays distinct.
 */
export function detectionKey(client, eventItemId) {
  return `${client}:${eventItemId}`;
}
