/**
 * Gather everything the card needs for one detected row from Legistar:
 * the matter file number, the hearing event detail, and the primary sponsor's
 * contact (via /sponsors → /persons). `legistar` is injected.
 *
 * @param {{matterId: number, eventId: number}} row
 * @param {{getMatter: Function, getEvent: Function, getMatterSponsors: Function, getPerson: Function}} legistar
 * @returns {Promise<{matter: object, event: object, person: object|null}>}
 */
export async function enrichForAlert(row, legistar) {
  const [matter, event, sponsors] = await Promise.all([
    legistar.getMatter(row.matterId),
    legistar.getEvent(row.eventId),
    legistar.getMatterSponsors(row.matterId),
  ]);

  let person = null;
  const primary = sponsors[0];
  if (primary?.personId !== undefined && primary.personId !== null) {
    const found = await legistar.getPerson(primary.personId);
    person = { name: found.name ?? primary.name, email: found.email, phone: found.phone };
  } else if (primary?.name) {
    person = { name: primary.name, email: undefined, phone: undefined };
  }

  return { matter, event, person };
}
