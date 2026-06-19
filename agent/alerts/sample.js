import { matchSubscriptions } from './match.js';

// Sample-alert selection for the "show, don't tell" onboarding (MOO-122). Pure —
// given the upcoming detected items and the channel's brand-new subscription, pick
// the single best item to post as a live example. "Best" = matches the channel
// (reusing the exact match.js predicate so the sample can't claim a match the real
// alerter wouldn't), soonest meeting first ("a live example from this week").

/**
 * @param {Array<{eventItemId: number, eventBodyName?: string, title?: string, eventDate?: string}>} upcoming
 * @param {{channelId: string, committees: string[], keywords: string[], boundary?: object}} subscription
 * @returns {object | null}
 */
export function pickSampleItem(upcoming, subscription) {
  if (!Array.isArray(upcoming) || upcoming.length === 0) return null;
  const matches = upcoming.filter((item) => matchSubscriptions(item, [subscription]).length > 0);
  if (matches.length === 0) return null;
  return matches.sort((a, b) => String(a.eventDate ?? '').localeCompare(String(b.eventDate ?? '')))[0];
}
