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

// The "other"/"newsletter" mail is not noise — it's press releases, community
// events, informal hearings, bids, and job postings. Classify by subject keyword so
// they get real counts (and the actionable ones a highlight) instead of one opaque
// "18 other" tally. Order matters: the first rule that hits wins. Newsletters are
// classified by category upstream; here a newsletter subject still resolves to one.
const CIVIC_LIFE_RULES = [
  { kind: 'Bid / RFP', test: /request for (pricing|proposal|qualification|bid)|\brf[pq]\b|\baddendum\b/i },
  { kind: 'Job posting', test: /job announcement|career opportunit|\bhiring\b|\bvacanc/i },
  { kind: 'Newsletter', test: /\bnewsletter\b/i },
  { kind: 'Press release', test: /news release|media advisory|press release|\bpress\b/i },
  { kind: 'Public hearing / meeting', test: /\bhearing\b|\bmeeting\b|\bcommission\b|\bboard\b|review board/i },
  {
    kind: 'Community event',
    test: /\bjoin\b|\battend\b|kick ?off|dedication|\bsession\b|conversation|celebrat|\bfestival\b/i,
  },
];

// The civic-life kinds a resident can act on / show up to — these earn a highlight.
const ACTIONABLE_LIFE_KINDS = new Set(['Public hearing / meeting', 'Community event']);

// Per-lane caps so the highlights stay diverse: a wall of identical committee
// meetings would crowd out the community event or recurring applicant that's the
// real signal. Headline counts still show every category in full.
const HIGHLIGHT_LANE_CAPS = { meetings: 3, civicLife: 2, recurringLicenses: 2 };

/** Friendly civic-life kind for an "other"/"newsletter" mail, from its subject. */
export function civicLifeKind(subject) {
  const text = subject ?? '';
  return CIVIC_LIFE_RULES.find((rule) => rule.test.test(text))?.kind ?? 'Notice';
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

/** A compact highlight row for the card / prompt — enough to render one line. For
 * civic-life mail the friendly kind rides along so the card can pick an emoji. */
function toHighlight(notification) {
  const isCivicLife = notification.category === 'other' || notification.category === 'newsletter';
  return {
    category: notification.category,
    subject: notification.subject,
    ...(isCivicLife ? { kind: civicLifeKind(notification.subject) } : {}),
    ...(notification.business ? { business: notification.business } : {}),
    ...(notification.district ? { district: notification.district } : {}),
    ...(notification.subType ? { subType: notification.subType } : {}),
    ...(notification.detailUrl ? { detailUrl: notification.detailUrl } : {}),
  };
}

/**
 * Pick the highlights, capped at `maxHighlights`: formal meetings first (time-boxed),
 * then actionable civic life (a hearing or community event a resident can attend),
 * then licenses with recurring entities ahead of one-off licenses. Routine
 * neighborhood-services records never highlight — they fold into counts.
 */
function selectHighlights(byCategory, recurringKeys, maxHighlights) {
  const meetings = (byCategory.meetings ?? []).slice(0, HIGHLIGHT_LANE_CAPS.meetings);
  const civicActionable = (byCategory.other ?? [])
    .filter((n) => ACTIONABLE_LIFE_KINDS.has(civicLifeKind(n.subject)))
    .slice(0, HIGHLIGHT_LANE_CAPS.civicLife);
  const licenses = byCategory.licenses ?? [];
  const isRecurring = (l) => l.business && recurringKeys.has(entityKey(l.business));
  const recurringLicenses = licenses.filter(isRecurring).slice(0, HIGHLIGHT_LANE_CAPS.recurringLicenses);
  const otherLicenses = licenses.filter((l) => !isRecurring(l));
  return [...meetings, ...civicActionable, ...recurringLicenses, ...otherLicenses]
    .slice(0, maxHighlights)
    .map(toHighlight);
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
  const {
    legistarItems = [],
    district = null,
    since = null,
    until = null,
    maxHighlights = DEFAULT_MAX_HIGHLIGHTS,
  } = options;

  const inWindow = (n) => {
    const day = (n.receivedAt ?? '').slice(0, 10);
    if (since && day < since) return false;
    if (until && day > until) return false;
    return true;
  };
  const districtMatch = (n) => district == null || n.district === district;
  const scoped = notifications.filter((n) => inWindow(n) && districtMatch(n));

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
      civic_life: foldByLabel([...(byCategory.other ?? []), ...(byCategory.newsletter ?? [])], (n) =>
        civicLifeKind(n.subject),
      ),
    },
    highlights: selectHighlights(byCategory, recurringKeys, maxHighlights),
    recurringEntities,
  };
}
