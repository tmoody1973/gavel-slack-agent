// Anti-spam cap for civic comments (MOO-171): one submission per user per file per day.
// Pure — the caller supplies the prior submission timestamps (ms) for this (user, file).

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * True if a prior submission falls within the last 24h of `nowMs` (so a new one is blocked).
 * @param {number[]} [priorTimestampsMs] - submission times for this user + file
 * @param {number} nowMs
 * @returns {boolean}
 */
export function exceedsDailyCap(priorTimestampsMs, nowMs) {
  if (!Array.isArray(priorTimestampsMs)) return false;
  return priorTimestampsMs.some((ts) => typeof ts === 'number' && nowMs - ts < DAY_MS);
}
