// Pure normalization for channel subscriptions — the logic seam the Convex
// mutations call before writing. Enforces the minimal-PII whitelist (only
// channel/lists/language/boundary survive), defaults, and dedup, so no Slack
// user identity or message content can leak into the store.

export const CLIENTS = ['milwaukee', 'milwaukeecounty'];
export const LANGUAGES = ['en', 'es'];
export const ROLES = ['association', 'organizer', 'reporter'];
const DEFAULT_CLIENT = 'milwaukee';
const DEFAULT_LANGUAGE = 'en';

/**
 * @typedef {Object} SubscriptionInput
 * @property {string} channelId
 * @property {string} [client]
 * @property {string[]} [committees]
 * @property {string[]} [keywords]
 * @property {string} [language]
 * @property {{ type: string, value: string }} [boundary]
 * @property {'association'|'organizer'|'reporter'} [role]  — onboarding: channel role bucket
 * @property {boolean} [configured]                          — onboarding: setup wizard completed
 * @property {number} [onboardedAt]                          — onboarding: epoch ms when onboarding finished
 * @property {number} [welcomePostedAt]                      — onboarding: epoch ms when welcome card was posted
 *
 * @param {SubscriptionInput} input
 * @returns {{ channelId: string, client: string, committees: string[], keywords: string[], language: string, boundary?: { type: 'district', value: string }, role?: 'association'|'organizer'|'reporter', configured?: boolean, onboardedAt?: number, welcomePostedAt?: number }}
 */
export function normalizeSubscription(input) {
  const channelId = (input?.channelId ?? '').trim();
  if (!channelId) {
    throw new Error('normalizeSubscription: channelId is required');
  }

  const client = input.client ?? DEFAULT_CLIENT;
  if (!CLIENTS.includes(client)) {
    throw new Error(`normalizeSubscription: unrecognized client "${client}" (expected one of ${CLIENTS.join(', ')})`);
  }

  const language = LANGUAGES.includes(input.language) ? input.language : DEFAULT_LANGUAGE;

  const result = {
    channelId,
    client,
    committees: cleanList(input.committees),
    keywords: cleanList(input.keywords),
    language,
  };

  const boundary = normalizeBoundary(input.boundary);
  if (boundary) {
    result.boundary = boundary;
  }

  if (input.role !== undefined) {
    if (!ROLES.includes(input.role)) {
      throw new Error(`normalizeSubscription: unrecognized role "${input.role}" (expected ${ROLES.join(', ')})`);
    }
    result.role = input.role;
  }
  if (input.configured !== undefined) result.configured = Boolean(input.configured);
  if (typeof input.onboardedAt === 'number') result.onboardedAt = input.onboardedAt;
  if (typeof input.welcomePostedAt === 'number') result.welcomePostedAt = input.welcomePostedAt;

  return result;
}

/**
 * Trim, drop empties, and dedup (first occurrence wins).
 * @param {unknown} list
 * @returns {string[]}
 */
function cleanList(list) {
  if (!Array.isArray(list)) {
    return [];
  }
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const trimmed = String(item ?? '').trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      out.push(trimmed);
    }
  }
  return out;
}

/**
 * Only a district boundary is supported for now (geo-matching is Phase 3).
 * @param {unknown} boundary
 * @returns {{ type: 'district', value: string } | undefined}
 */
function normalizeBoundary(boundary) {
  const b = /** @type {{ type?: string, value?: unknown }} */ (boundary);
  if (b?.type === 'district' && String(b.value ?? '').trim()) {
    return { type: 'district', value: String(b.value).trim() };
  }
  return undefined;
}
