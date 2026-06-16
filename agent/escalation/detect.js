// Pure escalation detection. The committee→full-Council transition is signalled
// by a committee action "RECOMMENDED FOR ADOPTION/PASSAGE" (result Pass) — it
// lands ~5 days before the Common Council's final vote (verified against real
// Milwaukee MatterHistory). The intro "ASSIGNED TO" and "HELD TO CALL OF THE
// CHAIR" are NOT escalations.

const RECOMMENDATION = /\bRECOMMENDED FOR\s+(ADOPTION|PASSAGE)\b/i;

/** A passed committee recommendation to advance the matter to the full Council. */
export function isCommitteeRecommendation(action, result) {
  return result === 'Pass' && RECOMMENDATION.test(action || '');
}

/**
 * The escalation event for a matter's history, or null. History is ascending by
 * date (getMatterHistory orders by MatterHistoryActionDate); the LAST matching
 * recommendation is the controlling one.
 */
export function detectEscalation(history) {
  const matches = (history || []).filter((h) => isCommitteeRecommendation(h.action, h.result));
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1];
  return { committee: last.body, date: last.date, action: last.action };
}
