// Plain-language topic chips (MOO-121 · Discovery 1). A fresh resident can't pick
// "ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE" — they don't speak that language.
// This is a legibility layer over the existing subscription mechanics: a citizen
// picks plain-English topics, and they map behind the scenes to the exact committees
// + keywords the matcher already uses. No new storage, no change to match.js.
//
// Pure and deterministic (no I/O, no Slack/Convex), so it's the testable seam both
// the confirm modal and the Go-live write-through consume.
//
// INVARIANT: topic committee-sets and keyword-sets are pairwise DISJOINT. That makes
// the reverse map (topicsFor) an exact inverse of the forward union — a user's chip
// selection survives the write-through → re-render cycle unchanged (round-trip).
// Committees stay canonical English EventBodyNames even in the ES label set.

import { COMMITTEES } from './defaults.js';

export const TOPIC_KEYS = ['housing', 'licenses', 'streets', 'parks', 'safety', 'budget'];

// Keywords are conservative on purpose: match.js does a naive title substring test,
// so bare "park" (→ "parking") or "street" (→ any address) would over-fire. Each term
// here is a high-signal civic phrase, not an everyday word. Committees do the heavy
// lifting; keywords catch what isn't a standing committee (e.g. permits, potholes).
export const TOPICS = {
  housing: {
    label_en: '🏠 Housing & development',
    label_es: '🏠 Vivienda y desarrollo',
    committees: [COMMITTEES.ZONING, COMMITTEES.CED, COMMITTEES.CITY_PLAN],
    keywords: ['rezoning', 'demolition', 'variance', 'redevelopment', 'blight', 'vacant lot', 'land sale', 'permit'],
  },
  licenses: {
    label_en: '🍺 Bars & licenses',
    label_es: '🍺 Bares y licencias',
    committees: [COMMITTEES.LICENSES],
    keywords: ['liquor license', 'tavern', 'bartender', 'extension of premises', 'alcohol', 'nightclub', 'food dealer'],
  },
  streets: {
    label_en: '🚧 Streets & construction',
    label_es: '🚧 Calles y construcción',
    committees: [COMMITTEES.PUBLIC_WORKS],
    keywords: ['paving', 'repaving', 'resurfacing', 'pothole', 'sidewalk', 'alley', 'sewer', 'water main'],
  },
  parks: {
    label_en: '🌳 Parks & green space',
    label_es: '🌳 Parques y áreas verdes',
    // Milwaukee has no live standing parks committee (county runs the parks), so
    // this topic is keyword-only — an honest, narrow signal off the agenda titles.
    committees: [],
    keywords: ['playground', 'forestry', 'green space', 'community garden', 'tree planting', 'parkland'],
  },
  safety: {
    label_en: '🚓 Public safety',
    label_es: '🚓 Seguridad pública',
    committees: [COMMITTEES.PUBLIC_SAFETY_HEALTH],
    keywords: ['police', 'fire department', 'reckless driving', 'public safety', 'carjacking', 'speeding'],
  },
  budget: {
    label_en: '💰 Budget & taxes',
    label_es: '💰 Presupuesto e impuestos',
    committees: [COMMITTEES.FINANCE_PERSONNEL],
    keywords: ['budget', 'tax levy', 'appropriation', 'bonding', 'special assessment', 'tax incremental'],
  },
};

/**
 * UI option data for the topic chips, localized. Pure data — the Block Kit layer
 * turns each {key,label} into a checkbox option. Falls back to English labels for
 * any unsupported language (mirrors copyFor / normalizeSubscription).
 *
 * @param {string} [language]
 * @returns {Array<{ key: string, label: string }>}
 */
export function topicChoices(language) {
  const field = language === 'es' ? 'label_es' : 'label_en';
  return TOPIC_KEYS.map((key) => ({ key, label: TOPICS[key][field] }));
}

/**
 * Forward map: the deduped union of committees + keywords for a set of topic keys.
 * This is exactly what Go-live writes through normalizeSubscription. Unknown keys
 * are ignored (a forged checkbox value can't corrupt the write).
 *
 * @param {string[]} keys
 * @returns {{ committees: string[], keywords: string[] }}
 */
export function committeesAndKeywordsForTopics(keys) {
  const committees = [];
  const keywords = [];
  for (const key of keys ?? []) {
    const topic = TOPICS[key];
    if (!topic) continue;
    for (const committee of topic.committees) if (!committees.includes(committee)) committees.push(committee);
    for (const keyword of topic.keywords) if (!keywords.includes(keyword)) keywords.push(keyword);
  }
  return { committees, keywords };
}

/**
 * Reverse map: which topics are "on" for a subscription. A topic lights when the
 * subscription shares any of its committees (case-insensitive, like match.js) or any
 * of its keywords. Used to pre-check the chips from role defaults and to re-render an
 * existing channel's config. Returns keys in canonical TOPIC_KEYS order.
 *
 * @param {string[]} committees
 * @param {string[]} keywords
 * @returns {string[]}
 */
export function topicsFor(committees, keywords) {
  const subCommittees = new Set((committees ?? []).map((c) => String(c).toLowerCase()));
  const subKeywords = new Set(keywords ?? []);
  return TOPIC_KEYS.filter((key) => {
    const topic = TOPICS[key];
    const committeeHit = topic.committees.some((c) => subCommittees.has(c.toLowerCase()));
    const keywordHit = topic.keywords.some((k) => subKeywords.has(k));
    return committeeHit || keywordHit;
  });
}
