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
  const filter = `EventDate ge datetime'${start}' and EventDate lt datetime'${end}' and EventAgendaStatusName eq 'Final'`;
  const params = new URLSearchParams({ $filter: filter, $orderby: 'EventDate', $top: '1000' });
  return `events?${params.toString()}`;
}

/**
 * Tag a no-offset timestamp as UTC. Legistar returns EventAgendaLastPublishedUTC
 * without a timezone designator (e.g. "2026-06-08T14:38:48.597") even though the
 * field is genuinely UTC; left bare, `new Date()` would misparse it as local.
 */
function toUtcIso(value) {
  if (value === undefined || value === null) return undefined;
  return /[Zz]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`;
}

/** Normalize a raw Legistar event to the fields the spine needs. */
export function mapEvent(raw) {
  return {
    eventId: raw.EventId,
    eventBodyName: raw.EventBodyName,
    eventDate: raw.EventDate,
    agendaPublishedUTC: toUtcIso(raw.EventAgendaLastPublishedUTC),
  };
}

/** Normalize a raw Legistar event item (agenda line) to spine fields. */
export function mapEventItem(raw) {
  return {
    eventItemId: raw.EventItemId,
    matterId: raw.EventItemMatterId ?? undefined,
    title: raw.EventItemTitle ?? '',
    agendaNumber: raw.EventItemAgendaNumber ?? undefined,
    consent: raw.EventItemConsent === 1,
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

/** Normalize a raw Legistar matter to the card's file number. */
export function mapMatter(raw) {
  return { fileNumber: raw.MatterFile };
}

/**
 * Build the `/matters` OData query for matters introduced in the last N days,
 * newest-first. The watchlist sweep matches watched entities against these.
 */
export function buildMattersQuery(nowIso, lookbackDays = 7) {
  const since = addDaysIso(nowIso, -lookbackDays).slice(0, 10);
  const filter = `MatterIntroDate ge datetime'${since}'`;
  const params = new URLSearchParams({ $filter: filter, $orderby: 'MatterIntroDate desc', $top: '1000' });
  return `matters?${params.toString()}`;
}

/** Normalize a raw Legistar matter to the fields the watch sweep matches on. */
export function mapMatterSummary(raw) {
  return {
    matterId: raw.MatterId,
    file: raw.MatterFile ?? '',
    title: raw.MatterTitle ?? '',
    name: raw.MatterName ?? '',
    introDate: raw.MatterIntroDate ?? undefined,
    bodyName: raw.MatterBodyName ?? undefined,
    typeName: raw.MatterTypeName ?? undefined,
  };
}

/** Normalize a raw sponsor row (the alderperson behind a matter). */
export function mapSponsor(raw) {
  return { name: raw.MatterSponsorName, personId: raw.MatterSponsorNameId, sequence: raw.MatterSponsorSequence };
}

/** Normalize a raw person to contact fields; empty strings/null → undefined. */
export function mapPerson(raw) {
  const clean = (value) => (value ? value : undefined);
  return { name: raw.PersonFullName, email: clean(raw.PersonEmail), phone: clean(raw.PersonPhone) };
}

/** Normalize a raw event to its hearing detail (time/location/links). */
export function mapEventDetail(raw) {
  return {
    date: raw.EventDate,
    time: raw.EventTime ?? undefined,
    location: raw.EventLocation ?? undefined,
    inSiteUrl: raw.EventInSiteURL ?? undefined,
    agendaPdf: raw.EventAgendaFile ?? undefined,
  };
}

/** Normalize a raw MatterHistory row (field names verified live: matter 73861). */
export function mapMatterAction(raw) {
  return {
    date: raw.MatterHistoryActionDate ?? undefined,
    action: raw.MatterHistoryActionName ?? '',
    body: raw.MatterHistoryActionBodyName ?? undefined,
    result: raw.MatterHistoryPassedFlagName ?? undefined,
  };
}

const LEGISTAR_BASE = 'https://webapi.legistar.com/v1';

/**
 * Create a Legistar OData client for one city ({client}-aware). `fetch` and
 * `now` are injected so the pure query/mapping logic is exercised in unit tests
 * and only this thin wiring touches the network in the verify script.
 */
export function createLegistarClient({
  fetch,
  client,
  userAgent,
  now = () => new Date().toISOString(),
  baseUrl = LEGISTAR_BASE,
}) {
  const root = `${baseUrl}/${client}`;
  const headers = { 'User-Agent': userAgent, Accept: 'application/json' };

  async function getJson(path) {
    const url = `${root}/${path}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Legistar request failed: ${res.status} for ${url}`);
    return res.json();
  }

  async function fetchUpcomingFinalEvents() {
    const raw = await getJson(buildEventsQuery(now()));
    return raw.map(mapEvent);
  }

  async function fetchEventItems(eventId) {
    const raw = await getJson(`events/${eventId}/eventitems?AgendaNote=1&Attachments=1`);
    return raw.map(mapEventItem);
  }

  async function fetchRecentMatters(lookbackDays = 7) {
    const raw = await getJson(buildMattersQuery(now(), lookbackDays));
    return raw.map(mapMatterSummary);
  }

  async function getMatter(matterId) {
    return mapMatter(await getJson(`matters/${matterId}`));
  }

  async function getMatterSponsors(matterId) {
    const raw = await getJson(`matters/${matterId}/sponsors`);
    return raw.map(mapSponsor).sort((a, b) => a.sequence - b.sequence);
  }

  async function getMatterHistory(matterId) {
    const params = new URLSearchParams({ $orderby: 'MatterHistoryActionDate' });
    const raw = await getJson(`matters/${matterId}/histories?${params.toString()}`);
    return raw.map(mapMatterAction);
  }

  async function fetchActiveBodyNames() {
    const params = new URLSearchParams({ $filter: 'BodyActiveFlag eq 1', $select: 'BodyName' });
    const raw = await getJson(`bodies?${params.toString()}`);
    return raw
      .map((b) => b.BodyName)
      .filter(Boolean)
      .sort();
  }

  async function getPerson(personId) {
    return mapPerson(await getJson(`persons/${personId}`));
  }

  async function getEvent(eventId) {
    return mapEventDetail(await getJson(`events/${eventId}`));
  }

  return {
    fetchUpcomingFinalEvents,
    fetchEventItems,
    fetchActiveBodyNames,
    fetchRecentMatters,
    getMatter,
    getMatterSponsors,
    getMatterHistory,
    getPerson,
    getEvent,
  };
}
