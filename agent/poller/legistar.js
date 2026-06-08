const DEFAULT_WINDOW_DAYS = 7;

/** Advance an ISO timestamp by N days (UTC), deterministically. */
export function addDaysIso(iso, days) {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

/**
 * Build the `/events` OData query for upcoming Final agendas in a date window.
 * Legistar accepts `+` for spaces and `datetime'YYYY-MM-DD'` literals.
 */
export function buildEventsQuery(nowIso, windowDays = DEFAULT_WINDOW_DAYS) {
  const start = nowIso.slice(0, 10);
  const end = addDaysIso(nowIso, windowDays).slice(0, 10);
  const filter =
    `EventDate ge datetime'${start}' and EventDate lt datetime'${end}' ` +
    `and EventAgendaStatusName eq 'Final'`;
  const params = new URLSearchParams({ $filter: filter, $orderby: 'EventDate', $top: '1000' });
  return `events?${params.toString()}`;
}

/** Normalize a raw Legistar event to the fields the spine needs. */
export function mapEvent(raw) {
  return {
    eventId: raw.EventId,
    eventBodyName: raw.EventBodyName,
    eventDate: raw.EventDate,
    agendaPublishedUTC: raw.EventAgendaLastPublishedUTC ?? undefined,
  };
}

/** Normalize a raw Legistar event item (agenda line) to spine fields. */
export function mapEventItem(raw) {
  return {
    eventItemId: raw.EventItemId,
    matterId: raw.EventItemMatterId ?? undefined,
    title: raw.EventItemTitle ?? '',
    agendaNumber: raw.EventItemAgendaNumber ?? undefined,
  };
}

/**
 * Join one event + one item into the `detectedAgendaItems` queue row. Omits
 * undefined optionals so the Convex validator sees absent, not null.
 */
export function toDetectedItem(client, event, item) {
  const row = {
    client,
    eventItemId: item.eventItemId,
    eventId: event.eventId,
    title: item.title,
    eventBodyName: event.eventBodyName,
  };
  if (item.matterId !== undefined) row.matterId = item.matterId;
  if (item.agendaNumber !== undefined) row.agendaNumber = item.agendaNumber;
  if (event.eventDate !== undefined) row.eventDate = event.eventDate;
  if (event.agendaPublishedUTC !== undefined) row.agendaPublishedUTC = event.agendaPublishedUTC;
  return row;
}
