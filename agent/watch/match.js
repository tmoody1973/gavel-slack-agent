// Pure watch-matching helpers. No network, no Convex — exercised directly in
// unit tests; the sweep orchestration and cron wiring import these.

import { normalizeAddress } from '../../mcp-server/src/address.js';

/** A watch entity is an "address" if the shared MPROP address parser accepts it. */
export function classifyEntity(entity) {
  return normalizeAddress(entity) ? 'address' : 'name';
}

/** Pull the file token out of a `File #260229` / `file#260229` entity, else null. */
function matterFileNeedle(entity) {
  const m = entity.match(/file\s*#?\s*([\w-]+)/i);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Does a watched entity appear in a new matter? File-number watches match the
 * bare `MatterFile` exactly; everything else is a case-insensitive substring
 * across File + Title + Name (addresses and owner names live in the title).
 */
export function matchMatter(entity, matter) {
  const needle = entity.trim().toLowerCase();
  if (!needle) return false;
  const file = String(matter.file ?? '').toLowerCase();
  const fileNeedle = matterFileNeedle(entity);
  if (fileNeedle && file && file === fileNeedle) return true;
  const hay = [matter.file, matter.title, matter.name].filter(Boolean).join('\n').toLowerCase();
  return hay.includes(needle);
}

/** Stable idempotency key for one (channel, entity, kind, ref) alert. */
export function dedupKey({ channelId, entity, kind, refId }) {
  return [channelId, entity, kind, refId].join(' ');
}
