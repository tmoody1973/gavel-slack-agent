// Pure escalation detection. The committee→full-Council transition is signalled
// by a committee action "RECOMMENDED FOR ADOPTION/PASSAGE" (result Pass) — it
// lands ~5 days before the Common Council's final vote (verified against real
// Milwaukee MatterHistory). The intro "ASSIGNED TO" and "HELD TO CALL OF THE
// CHAIR" are NOT escalations.

const RECOMMENDATION = /\bRECOMMENDED FOR\s+(ADOPTION|PASSAGE)\b/i;
const COUNCIL_BODY = /COMMON COUNCIL/i;
const COUNCIL_DISPOSITION = /\b(ADOPTED|PASSED|PLACED ON FILE|FAILED|RECONSIDERED)\b/i;

/** A passed committee recommendation to advance the matter to the full Council. */
export function isCommitteeRecommendation(action, result) {
  return result === 'Pass' && RECOMMENDATION.test(action || '');
}

/** A full-Council final disposition (the vote already happened). */
function isCouncilVote(row) {
  return COUNCIL_BODY.test(row.body || '') && COUNCIL_DISPOSITION.test(row.action || '');
}

/**
 * The escalation event for a matter's history, or null. History is ascending by
 * date (getMatterHistory orders by MatterHistoryActionDate); the LAST matching
 * committee recommendation is the controlling one. Returns null when the full
 * Council has ALREADY voted after that recommendation — the point of the ping is
 * the heads-up *before* the final vote, so a decided matter is not an escalation.
 */
export function detectEscalation(history) {
  const rows = history || [];
  let lastRecIndex = -1;
  for (let i = 0; i < rows.length; i += 1) {
    if (isCommitteeRecommendation(rows[i].action, rows[i].result)) lastRecIndex = i;
  }
  if (lastRecIndex === -1) return null;
  const alreadyVoted = rows.slice(lastRecIndex + 1).some(isCouncilVote);
  if (alreadyVoted) return null;
  const rec = rows[lastRecIndex];
  return { committee: rec.body, date: rec.date, action: rec.action };
}
