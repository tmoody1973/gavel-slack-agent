/**
 * Fusion guard against the Legistar poller (MOO-41). A meeting E-Notify carries
 * a direct `MeetingDetail.aspx?ID=<n>` link, and that `<n>` is the Legistar
 * Event ID the poller stores as `eventId`. So if the poller already detected
 * that event, the channel was (or will be) alerted with the deeper Legistar
 * card — suppress the E-Notify duplicate to keep trust.
 *
 * Only meetings can collide: permits/licenses/enforcement live in Accela, not
 * Legistar, so they never dedupe against the poller.
 *
 * @param {{category: string, legistarMeetingId?: string|null}} notification
 * @param {Array<{eventId: number|string}>} legistarItems  poller-detected items
 * @returns {boolean} true if this notification duplicates a Legistar alert
 */
export function shouldSuppress(notification, legistarItems) {
  if (notification.category !== 'meetings' || !notification.legistarMeetingId) {
    return false;
  }
  const meetingId = String(notification.legistarMeetingId);
  return (legistarItems ?? []).some((item) => String(item.eventId) === meetingId);
}
