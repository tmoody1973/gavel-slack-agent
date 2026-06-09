// MOO-51: the insider-knowledge flags. The 5-minute poll cadence makes
// detection time ≈ publication time, so "first detected <48h before the
// meeting" catches both true walk-ons (items added to a later agenda version)
// and late-published agendas — either way neighbors got under 48h of notice.

const WALK_ON_WINDOW_HOURS = 48;
const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * Compute the alert flags for one detected agenda item.
 * `eventDate` is Legistar's bare local-midnight timestamp; it is treated as
 * UTC midnight, which errs slightly toward flagging (never toward missing a
 * genuine late add). No eventDate → never flagged.
 *
 * @param {{ eventDate?: string, consent?: boolean }} item
 * @param {string} nowIso - injected clock (deterministic tests)
 * @returns {{ walkOnFlag: boolean, consentFlag: boolean }}
 */
export function computeAlertFlags({ eventDate, consent }, nowIso) {
  return {
    walkOnFlag: isWithinWalkOnWindow(eventDate, nowIso),
    consentFlag: consent === true,
  };
}

function isWithinWalkOnWindow(eventDate, nowIso) {
  if (!eventDate) return false;
  const meetingMs = Date.parse(/[Zz]|[+-]\d{2}:?\d{2}$/.test(eventDate) ? eventDate : `${eventDate}Z`);
  if (Number.isNaN(meetingMs)) return false;
  const hoursUntilMeeting = (meetingMs - Date.parse(nowIso)) / MS_PER_HOUR;
  return hoursUntilMeeting < WALK_ON_WINDOW_HOURS;
}
