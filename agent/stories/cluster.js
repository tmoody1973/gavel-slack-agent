// App Home declutter (MOO-128). THEME = subject/beat — the deterministic clustering
// axis, distinct from MOO-127's newsworthiness TAGS (the "why"). Money is a tag, not a
// beat. Families extend the MOO-121 topic vocabulary; first match wins, so the order is
// specific → general. Pure, LLM-free.

import { districtOf } from '../home/salience.js';

export const THEME_FAMILIES = [
  { key: 'police', emoji: '🛡️', re: /police|MPD|use of force|pursuit|surveillance|officer|fire and police|body camera/i },
  { key: 'health', emoji: '🏥', re: /lead(?: poisoning)?|public health|health department|clinic|food safety|water quality|opioid|sanitation|disease/i },
  { key: 'housing', emoji: '🏠', re: /rezoning|demolition|variance|blight|vacant lot|eviction|conditional use|housing/i },
  { key: 'development', emoji: '🏗️', re: /TIF|tax incremental|redevelopment|development agreement|business improvement district|\bBID\b|economic development|land sale/i },
  { key: 'licenses', emoji: '🍺', re: /license|tavern|liquor|bartender|food dealer/i },
  { key: 'parks', emoji: '🌳', re: /\bpark(?:s|land)?\b|forestry|green space|community garden|tree planting|climate|sustainab/i },
  { key: 'streets', emoji: '🚧', re: /paving|repaving|resurfac|sewer|water main|sidewalk|alley|pothole/i },
  { key: 'appointments', emoji: '👔', re: /appoint|confirmation|nomination|\bboard\b|\bcommission\b/i },
];

/**
 * The subject beat a title belongs to, or null. First matching family wins.
 * @param {string} [title]
 * @returns {string | null}
 */
export function themeOf(title) {
  const text = title ?? '';
  for (const family of THEME_FAMILIES) if (family.re.test(text)) return family.key;
  return null;
}
