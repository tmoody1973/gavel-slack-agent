// Milwaukee Common Council public-comment / "how to participate" page. No
// per-matter registration link exists in Legistar, so this is a stable
// city-level constant (verify the live URL during the verification gate).
export const HOW_TO_PARTICIPATE_URL = 'https://city.milwaukee.gov/CommonCouncil/Participate';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Format a Legistar local date string ("2026-06-10T00:00:00") as "Jun 10". */
function shortDate(iso) {
  const [, month, day] = iso.slice(0, 10).split('-').map(Number);
  return `${MONTHS[month - 1]} ${day}`;
}

/**
 * Build the "How to be heard / Cómo participar" footer mrkdwn from a hearing
 * event and (optional) sponsor person. Degrades field-by-field.
 *
 * @param {{date: string, time?: string, location?: string}} event
 * @param {{name: string, email?: string, phone?: string}|null} person
 * @returns {{ text: string }}
 */
export function buildFooter(event, person) {
  const lines = ['🗣️ *How to be heard / Cómo participar*'];

  const when = event.time ? `${shortDate(event.date)} · ${event.time}` : shortDate(event.date);
  lines.push(event.location ? `📅 *${when}*  📍 ${event.location}` : `📅 *${when}*`);

  lines.push(`✋ <${HOW_TO_PARTICIPATE_URL}|Register to comment / Regístrese para comentar>`);

  if (person?.name) {
    const contact = [`👤 ${person.name}`, person.email && `✉️ ${person.email}`, person.phone && `☎️ ${person.phone}`]
      .filter(Boolean)
      .join(' · ');
    lines.push(contact);
  }

  return { text: lines.join('\n') };
}
