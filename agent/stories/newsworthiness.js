// The journalist lens (MOO-127). Where MOO-123's salience selector asks "is this
// civically important to a resident?", this re-scores the SAME items for a reporter:
// "of everything on the agenda, which might be a *story*, and why?"
//
// Pure and EXPLAINABLE by design — never a black-box score (mirrors salience.js's
// "not ML" rule and the project's leads-not-verdicts framing). Every item carries
// structured `tags`, each a {kind, detail?} the renderer turns into a 💰/🛡️/👥 chip,
// so a reporter can see the *reason* and judge for themselves. The composite `score`
// is just the transparent sum of matched tag weights.

import { districtOf } from '../home/salience.js';

// Title/text signals, read off the matter record — no per-item Claude call (the
// scorer must stay pure and the App Home must render fast). Each is a high-signal
// civic phrase, kept conservative so it surfaces leads without crying wolf.
const SIGNAL_PATTERNS = {
  money:
    /\$|\bmillion\b|\bbillion\b|\bbond(?:ing|s)?\b|\bappropriat\w*|\btax (?:levy|incremental)\b|\bTIF\b|\bcontract\b|\bno-bid\b|\bgrant\b/i,
  accountability:
    /\bpolice\b|\bsurveillance\b|\bethics\b|\bmisconduct\b|\boversight\b|\bappoint\w*|\bno-bid\b|\bbody camera\b|\bfire and police\b|\binvestigat\w*/i,
  novelty: /\bcreat\w*|\bestablish\w*|\bpilot\b|\bfirst-of-its-kind\b|\bfirst of its kind\b/i,
  conflict:
    /\bappeal\b|\bprotest\b|\bobjection\b|\bden(?:y|ial|ied)\b|\brevo(?:ke|cation|ked)\b|\bcontested\b|\bgrievance\b|\blawsuit\b|\bdispute\b/i,
  equity: /\bdemolition\b|\bdemolish\b|\beviction\b|\bevict\w*|\bclosure\b|\bdisplac\w*|\brelocat\w*/i,
};

// Novelty should fire on "creating/establishing" only for actual legislation, not a
// stray "establish" in prose — guard it against the legislation shape salience uses.
const LEGISLATION_RE = /^(?:an?\s+)?(?:substitute\s+)?(?:ordinance|resolution)\b/i;

/**
 * Transparent weight per tag kind — the composite ranking is the sum of these.
 * Power/accountability and money/equity lead because they are the costliest stories
 * to leave uncovered; novelty/recurrence are softer "worth a look" signals.
 */
export const NEWSWORTHINESS_WEIGHTS = {
  accountability: 5,
  money: 4,
  equity: 4,
  conflict: 3,
  anomaly: 3,
  recurrence: 3,
  novelty: 2,
};

/** Convenience for callers/tests: just the tag kinds of a score, in order. */
export const tagKinds = (score) => (score?.tags ?? []).map((tag) => tag.kind);

/**
 * Score one agenda item through the newsworthiness lens. Pure: never mutates `item`.
 *
 * @param {{eventItemId?: number, title?: string, eventBodyName?: string, walkOnFlag?: boolean, consentFlag?: boolean}} item
 * @param {{ text?: string, recurrence?: { detail?: string } }} [signals]
 *   - `text`: extra matter body text (from enrichment) to scan alongside the title.
 *   - `recurrence`: a repeat-entity hit from the ownership portfolio (MOO-110/112).
 * @returns {{ tags: Array<{kind: string, detail?: string}>, score: number }}
 */
export function scoreNewsworthiness(item, signals = {}) {
  const title = item?.title ?? '';
  const scanText = `${title} ${signals.text ?? ''}`;
  const tags = [];

  if (SIGNAL_PATTERNS.money.test(scanText)) tags.push({ kind: 'money' });
  if (SIGNAL_PATTERNS.accountability.test(scanText)) tags.push({ kind: 'accountability' });
  if (SIGNAL_PATTERNS.conflict.test(scanText)) tags.push({ kind: 'conflict' });

  if (SIGNAL_PATTERNS.equity.test(scanText)) {
    const district = districtOf(title);
    tags.push(district != null ? { kind: 'equity', detail: String(district) } : { kind: 'equity' });
  }

  if (LEGISLATION_RE.test(title.trim()) && SIGNAL_PATTERNS.novelty.test(scanText)) tags.push({ kind: 'novelty' });

  if (item?.walkOnFlag) tags.push({ kind: 'anomaly', detail: 'walkOn' });
  if (item?.consentFlag) tags.push({ kind: 'anomaly', detail: 'consent' });

  if (signals.recurrence) tags.push({ kind: 'recurrence', detail: signals.recurrence.detail });

  const score = tags.reduce((sum, tag) => sum + (NEWSWORTHINESS_WEIGHTS[tag.kind] ?? 0), 0);
  return { tags, score };
}
