// App Home declutter (MOO-128). THEME = subject/beat — the deterministic clustering
// axis, distinct from MOO-127's newsworthiness TAGS (the "why"). Money is a tag, not a
// beat. Families extend the MOO-121 topic vocabulary; first match wins, so the order is
// specific → general. Pure, LLM-free.

import { districtOf } from '../home/salience.js';

export const THEME_FAMILIES = [
  {
    key: 'police',
    emoji: '🛡️',
    re: /police|MPD|use of force|pursuit|surveillance|officer|fire and police|body camera/i,
  },
  {
    key: 'health',
    emoji: '🏥',
    re: /lead(?: poisoning)?|public health|health department|clinic|food safety|water quality|opioid|sanitation|disease/i,
  },
  {
    key: 'housing',
    emoji: '🏠',
    re: /rezoning|demolition|variance|blight|vacant lot|eviction|conditional use|housing/i,
  },
  {
    key: 'development',
    emoji: '🏗️',
    re: /TIF|tax incremental|redevelopment|development agreement|business improvement district|\bBID\b|economic development|land sale/i,
  },
  { key: 'licenses', emoji: '🍺', re: /license|tavern|liquor|bartender|food dealer/i },
  {
    key: 'parks',
    emoji: '🌳',
    re: /\bpark(?:s|land)?\b|forestry|green space|community garden|tree planting|climate|sustainab/i,
  },
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

const GROUP_SEP = ' ';
const districtChip = (title) => {
  const d = districtOf(title);
  return d != null ? String(d) : undefined;
};

/** Tag kinds shared by ALL members; union fallback if none is shared. */
function sharedTags(leads) {
  const kindSets = leads.map((l) => new Set((l.tags ?? []).map((t) => t.kind)));
  const base = [...(kindSets[0] ?? [])];
  const shared = base.filter((kind) => kindSets.every((set) => set.has(kind)));
  const kinds = shared.length > 0 ? shared : [...new Set(leads.flatMap((l) => (l.tags ?? []).map((t) => t.kind)))];
  return kinds.map((kind) => ({ kind }));
}

/** The district shared by every member, or undefined. */
function sharedDistrict(leads) {
  const districts = leads.map((l) => districtChip(l.item?.title));
  const first = districts[0];
  return first !== undefined && districts.every((d) => d === first) ? first : undefined;
}

const entryScore = (entry) => (entry.kind === 'cluster' ? entry.topScore : (entry.score ?? 0));
const entryDate = (entry) =>
  entry.kind === 'cluster'
    ? (entry.members.map((m) => m.item?.eventDate ?? '').sort()[0] ?? '')
    : (entry.item?.eventDate ?? '');
const entryId = (entry) =>
  entry.kind === 'cluster' ? (entry.members[0].item?.eventItemId ?? 0) : (entry.item?.eventItemId ?? 0);

/**
 * Group already-ranked story leads into clusters (committee + subject beat, ≥2) and
 * singles. Pure; never mutates input. Reuses MOO-123 districtOf for the district facet.
 * @param {Array<{item: object, tags: Array<{kind: string}>, score: number}>} leads
 * @returns {Array<object>}
 */
export function clusterLeads(leads = []) {
  const groups = new Map();
  const order = [];
  for (const lead of leads) {
    const theme = themeOf(lead.item?.title);
    const committee = lead.item?.eventBodyName ?? '';
    const key = theme ? `${committee}${GROUP_SEP}${theme}` : `${GROUP_SEP}single${GROUP_SEP}${order.length}`;
    if (!groups.has(key)) {
      groups.set(key, { theme, committee, members: [] });
      order.push(key);
    }
    groups.get(key).members.push(lead);
  }

  const entries = [];
  for (const key of order) {
    const group = groups.get(key);
    if (group.theme && group.members.length >= 2) {
      entries.push({
        kind: 'cluster',
        theme: group.theme,
        committee: group.committee,
        tags: sharedTags(group.members),
        district: sharedDistrict(group.members),
        members: group.members,
        topScore: Math.max(...group.members.map((m) => m.score ?? 0)),
      });
    } else {
      for (const lead of group.members)
        entries.push({ kind: 'single', district: districtChip(lead.item?.title), ...lead });
    }
  }

  entries.sort(
    (a, b) => entryScore(b) - entryScore(a) || entryDate(a).localeCompare(entryDate(b)) || entryId(a) - entryId(b),
  );
  return entries;
}
