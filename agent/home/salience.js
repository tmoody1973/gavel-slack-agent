// Salience selection for the "🔎 Discover this week" App Home feed (MOO-123). The
// poller pulls the FULL upcoming agenda but the status strip only counts items that
// match a channel's subscriptions. This surfaces the unknown-unknowns: items in the
// citizen's district, process anomalies (walk-ons / consent-calendar burials), and
// the biggest matters — regardless of subscription.
//
// Pure and EXPLAINABLE (not ML): every surfaced item carries structured `reasons`,
// so the renderer can show *why* it's here. That same {item, reasons} shape is the
// reusable spine the journalist Story Radar (MOO-127) re-scores for newsworthiness.

const DISTRICT_RE = /\((\d+)(?:st|nd|rd|th)\s+Aldermanic District\)/i;

// Transparent "big this week" signals read off the title/body — no enrichment, no
// per-item Legistar/Claude call (the Home must render fast). Order = priority.
const MONEY_RE = /\$|\bmillion\b|\bbond(?:ing|s)?\b|\bappropriat|\btax levy\b|\bbudget\b/i;
const LEGISLATION_RE = /^(?:an?\s+)?(?:substitute\s+)?(?:ordinance|resolution)\b/i;

/**
 * The aldermanic district named in a Legistar title (Milwaukee titles often carry
 * "(7th Aldermanic District)"), or null. No geocoding — district-level only (v1).
 * @param {string} [title]
 * @returns {number | null}
 */
export function districtOf(title) {
  const match = DISTRICT_RE.exec(title ?? '');
  return match ? Number(match[1]) : null;
}

/** The transparent "big" reason for an item, or null. */
function bigReason(item) {
  const title = item.title ?? '';
  if (MONEY_RE.test(title)) return 'money';
  if (LEGISLATION_RE.test(title.trim())) return 'legislation';
  if ((item.eventBodyName ?? '').toLowerCase().includes('common council')) return 'fullCouncil';
  return null;
}

const PRIORITY = { district: 100, walkOn: 50, consent: 50, big: 10 };
const weightOf = (reasons) => reasons.reduce((sum, r) => Math.max(sum, PRIORITY[r.kind] ?? 0), 0) + reasons.length; // ties broken by signal count

/**
 * Select the salient upcoming items, ranked and explainable.
 * @param {Array<{eventItemId: number, title?: string, eventBodyName?: string, eventDate?: string, walkOnFlag?: boolean, consentFlag?: boolean}>} upcoming
 * @param {{ boundaries?: Array<string|number>, cap?: number }} [opts]
 * @returns {Array<{ item: object, reasons: Array<{kind: string, detail?: string}> }>}
 */
export function selectSalient(upcoming, { boundaries = [], cap = 6 } = {}) {
  const districts = new Set((boundaries ?? []).map(String));
  const scored = [];
  for (const item of upcoming ?? []) {
    const reasons = [];
    const district = districtOf(item.title);
    if (district != null && districts.has(String(district)))
      reasons.push({ kind: 'district', detail: String(district) });
    if (item.walkOnFlag) reasons.push({ kind: 'walkOn' });
    if (item.consentFlag) reasons.push({ kind: 'consent' });
    const big = bigReason(item);
    if (big) reasons.push({ kind: 'big', detail: big });
    if (reasons.length > 0) scored.push({ item, reasons });
  }

  scored.sort(
    (a, b) =>
      weightOf(b.reasons) - weightOf(a.reasons) ||
      String(a.item.eventDate ?? '').localeCompare(String(b.item.eventDate ?? '')),
  );

  const seen = new Set();
  const out = [];
  for (const entry of scored) {
    if (seen.has(entry.item.eventItemId)) continue;
    seen.add(entry.item.eventItemId);
    out.push(entry);
    if (out.length >= cap) break;
  }
  return out;
}
