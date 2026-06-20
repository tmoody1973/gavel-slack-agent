// Shared Story Radar label tables + meta-line composition (MOO-127/128/130). Three
// surfaces render over the same lead shape — the App Home strip (story-leads.js), the
// filterable modal (story-modal.js), and the `/gavel stories` carousel (story-carousel.js)
// — so the explainable chips (subject beat, newsworthiness tags, district, meeting date)
// live here once. Committee + proper names stay English in both languages by design.

const THEME_LABEL = {
  en: {
    police: '🛡️ Police & public safety',
    health: '🏥 Health',
    housing: '🏠 Housing & zoning',
    development: '🏗️ Development',
    licenses: '🍺 Licenses',
    parks: '🌳 Parks & environment',
    streets: '🚧 Streets & infrastructure',
    appointments: '👔 Appointments',
  },
  es: {
    police: '🛡️ Policía y seguridad',
    health: '🏥 Salud',
    housing: '🏠 Vivienda y zonificación',
    development: '🏗️ Desarrollo',
    licenses: '🍺 Licencias',
    parks: '🌳 Parques y medio ambiente',
    streets: '🚧 Calles e infraestructura',
    appointments: '👔 Nombramientos',
  },
};

/** Localized subject-beat label, falling back to the raw theme key. */
export function themeLabel(theme, language = 'en') {
  return (THEME_LABEL[language] ?? THEME_LABEL.en)[theme] ?? theme;
}

/** "📍 District N" / "📍 Distrito N", or null when there's no district. */
export const districtLabel = (district, language = 'en') =>
  district ? (language === 'es' ? `📍 Distrito ${district}` : `📍 District ${district}`) : null;

// Each newsworthiness tag → an explainable chip. Functions take the optional `detail`
// (district, walk-on vs consent, recurrence entity). Committee/proper names stay English.
const TAG_LABEL = {
  en: {
    money: () => '💰 Money',
    accountability: () => '🛡️ Power & accountability',
    equity: (d) => (d ? `👥 Equity · District ${d}` : '👥 Equity / displacement'),
    conflict: () => '⚔️ Conflict',
    novelty: () => '✨ First-of-its-kind',
    anomaly: (d) => (d === 'consent' ? '⚠️ Buried on consent' : '⚠️ Added late'),
    recurrence: (d) => `🔁 ${d ?? 'Repeat entity'}`,
  },
  es: {
    money: () => '💰 Dinero',
    accountability: () => '🛡️ Poder y rendición de cuentas',
    equity: (d) => (d ? `👥 Equidad · Distrito ${d}` : '👥 Equidad / desplazamiento'),
    conflict: () => '⚔️ Conflicto',
    novelty: () => '✨ Primero en su tipo',
    anomaly: (d) => (d === 'consent' ? '⚠️ Oculto en consentimiento' : '⚠️ Añadido tarde'),
    recurrence: (d) => `🔁 ${d ?? 'Entidad recurrente'}`,
  },
};

/** "💰 Money · 🛡️ Power & accountability · ⚠️ Added late" — the explainable why. */
export function tagText(tags, language = 'en') {
  const labels = TAG_LABEL[language] ?? TAG_LABEL.en;
  return (tags ?? [])
    .map((tag) => labels[tag.kind]?.(tag.detail))
    .filter(Boolean)
    .join('  ·  ');
}

const WEEKDAY = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  es: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'],
};
const MONTH = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
};

/**
 * "🗓 Tue Jun 23" (en) / "🗓 mar 23 jun" (es) from an ISO date, or null. Parsed as UTC
 * midnight so the weekday never drifts by timezone (eventDate is a calendar day, not an
 * instant). LLM-free and cheap — safe on the synchronous Home/modal render.
 * @param {string} [iso] - YYYY-MM-DD (extra time component tolerated)
 * @param {'en'|'es'} [language]
 * @returns {string | null}
 */
export function dateLabel(iso, language = 'en') {
  if (!iso) return null;
  const date = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  const weekday = (WEEKDAY[language] ?? WEEKDAY.en)[date.getUTCDay()];
  const month = (MONTH[language] ?? MONTH.en)[date.getUTCMonth()];
  const day = date.getUTCDate();
  return language === 'es' ? `🗓 ${weekday} ${day} ${month}` : `🗓 ${weekday} ${month} ${day}`;
}

/**
 * The explainable context line shared by every surface:
 * "🏛️ {committee} · 📍 District N · 🗓 Tue Jun 23 · {tags}". Empty parts drop out.
 * @param {{ committee?: string, district?: string|number, date?: string, tags?: Array<{kind:string, detail?:any}> }} parts
 * @param {'en'|'es'} [language]
 * @returns {string}
 */
export function metaLine({ committee, district, date, tags }, language = 'en') {
  return [
    committee ? `🏛️ ${committee}` : null,
    districtLabel(district, language),
    dateLabel(date, language),
    tagText(tags, language),
  ]
    .filter(Boolean)
    .join('  ·  ');
}
