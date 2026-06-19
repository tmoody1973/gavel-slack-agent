// Role→config engine for the Front Door (MOO-117 · spec §3). The cohesion fix's
// heart: it turns onboarding from "configure 169 committees" into "confirm three
// defaults" by mapping each persona to a subscription-shaped config that the FD-B
// wiring writes straight into Convex. Pure and deterministic — no I/O, no Slack or
// Convex imports — so it's the testable seam every later surface consumes.

// Canonical Milwaukee committee EventBodyNames. These MUST match Legistar exactly
// (match.js compares case-insensitively against EventBodyName), so only names
// verified against the live record + existing corpus appear here.
export const COMMITTEES = {
  ZONING: 'ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE',
  LICENSES: 'LICENSES COMMITTEE',
  CED: 'COMMUNITY & ECONOMIC DEVELOPMENT COMMITTEE',
  CITY_PLAN: 'CITY PLAN COMMISSION',
  PUBLIC_WORKS: 'PUBLIC WORKS COMMITTEE',
  // Added for the topic-chip map (MOO-121). Verified live against Legistar
  // /bodies — these are the active standing committees (the bare "PUBLIC SAFETY
  // COMMITTEE" is dead, 0 events in 2026). Intentionally NOT in CORE_COMMITTEES:
  // they expand topic coverage without changing any role's defaults.
  FINANCE_PERSONNEL: 'FINANCE & PERSONNEL COMMITTEE',
  PUBLIC_SAFETY_HEALTH: 'PUBLIC SAFETY AND HEALTH COMMITTEE',
};

// The civic bodies Gavel actively covers. Milwaukee has ~169 active bodies and no
// "all" wildcard in match.js, so the reporter's "all committees" default resolves
// to this curated core — "all of what Gavel watches" — and grows as coverage does.
export const CORE_COMMITTEES = [
  COMMITTEES.ZONING,
  COMMITTEES.LICENSES,
  COMMITTEES.CED,
  COMMITTEES.CITY_PLAN,
  COMMITTEES.PUBLIC_WORKS,
];

export const ROLES = ['association', 'organizer', 'reporter'];

// Per spec §3. `keywords` carries coverage that isn't a standing committee — e.g.
// the organizer's "permits" (not a Legistar EventBodyName; it lands in titles /
// E-Notify), emitted as a working keyword instead of dead committee data.
const ROLE_DEFAULTS = {
  association: {
    committees: [COMMITTEES.ZONING, COMMITTEES.LICENSES, COMMITTEES.CED],
    keywords: [],
    language: 'en',
    extras: ['sundayDigest', 'howToBeHeard', 'meetingClips'],
    channelShape: 'single',
  },
  organizer: {
    committees: [COMMITTEES.ZONING, COMMITTEES.LICENSES],
    keywords: ['permit'],
    language: 'es',
    extras: ['watchlists', 'ownershipTools', 'bilingualTranscriptSearch'],
    channelShape: 'multiArea',
  },
  reporter: {
    committees: CORE_COMMITTEES,
    keywords: [],
    language: 'en',
    extras: ['agendaChange', 'transcriptSearchPrimer'],
    channelShape: 'single',
  },
};

/**
 * Smart defaults for a persona — the starting config the confirm modal lets the
 * user edit. Returns a fresh deep copy so callers can mutate it without corrupting
 * the shared preset.
 *
 * @param {'association' | 'organizer' | 'reporter'} role
 * @returns {{ committees: string[], keywords: string[], language: 'en' | 'es', extras: string[], channelShape: 'single' | 'multiArea' }}
 */
export function defaultsForRole(role) {
  const preset = ROLE_DEFAULTS[role];
  if (!preset) {
    throw new Error(`defaultsForRole: unknown role "${role}" (expected one of ${ROLES.join(', ')})`);
  }
  return {
    committees: [...preset.committees],
    keywords: [...preset.keywords],
    language: preset.language,
    extras: [...preset.extras],
    channelShape: preset.channelShape,
  };
}
