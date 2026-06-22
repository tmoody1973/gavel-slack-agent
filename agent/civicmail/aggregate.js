import { shouldSuppress } from './dedup.js';

// The civic-mail aggregator (MOO-153). Turns a high-volume, low-signal E-Notify
// stream into a consumable "what the city did this week" structure: routine folded
// into counts, actionable items surfaced individually, recurring entities flagged.
//
// Pure and deterministic — no Claude, Convex, or Slack. The non-deterministic batch
// summary (digest-prompt.js) and the Block Kit render (digest-card.js) consume this
// structure. The insight the issue names: individual emails are noise; in aggregate
// they reveal patterns (one entity filing repeatedly across a block).

// Meetings (a hearing deadline) and licenses (an objection window) are time-boxed,
// so they earn an individual highlight; everything else folds into counts.
const DEFAULT_MAX_HIGHLIGHTS = 6;

// The city buries the specific complaint in the description after a colon
// ("DNS Activity:Large pile of tires"), so folding on the raw text never groups.
// Fold on the record TYPE (the part before the colon), mapping the two jargon
// prefixes to plain language. Clean-typed records ("ROW Excavation Utility") have
// no colon and pass through unchanged.
const NS_TYPE_LABELS = {
  'DNS Activity': 'Code enforcement (DNS)',
  'Department of Public Works Activity': 'Public Works activity',
};

/** The label a neighborhood-services / license row folds under: license type for
 * licenses; for NS records the record type (description before the colon, jargon
 * mapped), then subType, then a generic bucket. Never the terse subject. */
function foldLabel(notification) {
  if (notification.category === 'licenses') {
    return notification.subType ?? 'License application';
  }
  const description = notification.description ?? notification.subType ?? 'Other record';
  const recordType = description.split(':')[0].trim();
  return NS_TYPE_LABELS[recordType] ?? recordType;
}

/** Normalize an entity name for recurrence grouping: uppercase, collapse whitespace.
 * Keeps the first-seen original for display. */
function entityKey(business) {
  return business.toUpperCase().replace(/\s+/g, ' ').trim();
}

/** Count occurrences of `labelOf(row)` over rows, as a {label, count}[] sorted by
 * count desc then label asc (stable, presentation-ready). */
function foldByLabel(rows, labelOf) {
  const counts = new Map();
  for (const row of rows) {
    const label = labelOf(row);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** License entities (businesses) appearing 2+ times — the displacement/repeat-actor
 * signal. Grounded: only real recurrence, never inferred intent. */
function findRecurringEntities(licenses) {
  const byKey = new Map();
  for (const lic of licenses) {
    if (!lic.business) continue;
    const key = entityKey(lic.business);
    const entry = byKey.get(key) ?? { entity: lic.business, count: 0 };
    entry.count += 1;
    byKey.set(key, entry);
  }
  return [...byKey.values()]
    .filter((e) => e.count >= 2)
    .sort((a, b) => b.count - a.count || a.entity.localeCompare(b.entity));
}

/** A compact highlight row for the card / prompt — enough to render one line. */
function toHighlight(notification) {
  return {
    category: notification.category,
    subject: notification.subject,
    ...(notification.business ? { business: notification.business } : {}),
    ...(notification.district ? { district: notification.district } : {}),
    ...(notification.subType ? { subType: notification.subType } : {}),
    ...(notification.detailUrl ? { detailUrl: notification.detailUrl } : {}),
  };
}

/**
 * Pick the highlights: every (deduped) meeting first since meetings are time-boxed,
 * then licenses with recurring entities ahead of one-off licenses, capped at
 * `maxHighlights`. Routine neighborhood-services records never highlight — they fold.
 */
function selectHighlights(byCategory, recurringKeys, maxHighlights) {
  const meetings = byCategory.meetings ?? [];
  const licenses = byCategory.licenses ?? [];
  const recurringLicenses = licenses.filter((l) => l.business && recurringKeys.has(entityKey(l.business)));
  const otherLicenses = licenses.filter((l) => !(l.business && recurringKeys.has(entityKey(l.business))));
  return [...meetings, ...recurringLicenses, ...otherLicenses].slice(0, maxHighlights).map(toHighlight);
}

/**
 * Aggregate civic-mail notifications into the per-channel digest structure.
 *
 * @param {object[]} notifications  `civicNotifications` rows
 * @param {{
 *   legistarItems?: Array<{eventId: number|string}>,  // poller-detected events, for dedup
 *   district?: string|null,                            // deliberate geo gate (null = citywide)
 *   maxHighlights?: number,
 * }} [options]
 * @returns {{
 *   total: number, suppressed: number,
 *   categoryCounts: Record<string, number>,
 *   breakdowns: { neighborhood_services: Array<{label,count}>, licenses: Array<{label,count}> },
 *   highlights: object[],
 *   recurringEntities: Array<{entity: string, count: number}>,
 * }}
 */
export function aggregateCivicMail(notifications, options = {}) {
  const { legistarItems = [], district = null, maxHighlights = DEFAULT_MAX_HIGHLIGHTS } = options;

  const scoped = district == null ? notifications : notifications.filter((n) => n.district === district);

  const kept = [];
  let suppressed = 0;
  for (const notification of scoped) {
    if (shouldSuppress(notification, legistarItems)) {
      suppressed += 1;
      continue;
    }
    kept.push(notification);
  }

  const byCategory = {};
  const categoryCounts = {};
  for (const notification of kept) {
    const cat = notification.category ?? 'other';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(notification);
    categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
  }

  const recurringEntities = findRecurringEntities(byCategory.licenses ?? []);
  const recurringKeys = new Set(recurringEntities.map((e) => entityKey(e.entity)));

  return {
    total: kept.length,
    suppressed,
    categoryCounts,
    breakdowns: {
      neighborhood_services: foldByLabel(byCategory.neighborhood_services ?? [], foldLabel),
      licenses: foldByLabel(byCategory.licenses ?? [], foldLabel),
    },
    highlights: selectHighlights(byCategory, recurringKeys, maxHighlights),
    recurringEntities,
  };
}
