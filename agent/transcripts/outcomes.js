// Minutes / vote-record layer (MOO-113 task D): the "what was DECIDED" companion to
// the transcript text. Post-meeting, Legistar populates each agenda item's action
// outcome (EventItemActionName / PassedFlag / Mover, the minutes PDF on the event).
// Milwaukee committee votes are voice votes, so Seconder/Tally are usually null —
// the outcome is action + pass-flag + who moved it. Pure: parses Legistar shapes,
// no I/O. PUBLIC RECORD ONLY (official minutes) — never any Slack content.

/** Collapse the runs of internal whitespace Legistar returns (e.g. "FOR  ADOPTION"). */
function squish(value) {
  return value.replace(/\s+/g, ' ').trim();
}

/** Keep an optional field only when it carries a real value (drop null/empty). */
function present(value) {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text === '' ? undefined : text;
}

/**
 * Map one Legistar event item to a structured outcome record. Optional fields that
 * are null/empty are omitted rather than stored as null.
 * @param {object} item
 * @param {{eventId:number, eventDate?:string, eventMinutesFile?:string}} ctx
 */
export function buildMatterOutcome(item, { eventId, eventDate, eventMinutesFile }) {
  const record = {
    eventItemId: item.EventItemId,
    eventId,
    actionName: squish(String(item.EventItemActionName)),
  };
  const optional = {
    matterId: item.EventItemMatterId ?? undefined,
    matterFile: present(item.EventItemMatterFile),
    agendaNumber: present(item.EventItemAgendaNumber),
    actionText: present(item.EventItemActionText),
    passedFlag: present(item.EventItemPassedFlagName),
    mover: present(item.EventItemMover),
    seconder: present(item.EventItemSeconder),
    tally: present(item.EventItemTally),
    eventDate: present(eventDate),
    minutesFile: present(eventMinutesFile),
  };
  for (const [key, value] of Object.entries(optional)) {
    if (value !== undefined) record[key] = value;
  }
  return record;
}

/** Parse a meeting's items into outcomes, keeping only items with a recorded action. */
export function buildMatterOutcomes(items, ctx) {
  return items.filter((item) => present(item.EventItemActionName)).map((item) => buildMatterOutcome(item, ctx));
}
