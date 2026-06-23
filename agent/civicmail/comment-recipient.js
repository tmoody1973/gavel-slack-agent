// Decide WHERE a resident's public comment is sent (MOO-171). Pure + guardrail-critical:
// a demo/test inbox always wins so a recording can never reach a real city clerk, and an
// unresolved recipient degrades SAFE (no send) rather than guessing an official's address.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isEmail = (value) => typeof value === 'string' && EMAIL_PATTERN.test(value.trim());

const normalizeBodyName = (name) => (name ?? '').trim().toUpperCase().replace(/\s+/g, ' ');

/**
 * Resolve the recipient for a civic comment.
 * Precedence: test inbox (demo safety) > per-item contact > per-body directory > none (safe-degrade).
 *
 * @param {{
 *   testInbox?: string,            // CIVIC_COMMENT_TEST_INBOX — when set, ALWAYS used (demo mode)
 *   contactEmail?: string,         // contact extracted from the agenda / E-Notify body
 *   bodyName?: string,             // the committee/body name (e.g. "CITY PLAN COMMISSION")
 *   bodyDirectory?: Record<string,string>, // curated body → clerk email map
 * }} input
 * @returns {{ recipient: string|null, demoMode: boolean, canSend: boolean, source: string, reason: string }}
 */
export function resolveCommentRecipient({ testInbox, contactEmail, bodyName, bodyDirectory = {} } = {}) {
  if (isEmail(testInbox)) {
    return { recipient: testInbox.trim(), demoMode: true, canSend: true, source: 'test-inbox', reason: 'demo mode' };
  }

  if (isEmail(contactEmail)) {
    return {
      recipient: contactEmail.trim(),
      demoMode: false,
      canSend: true,
      source: 'item-contact',
      reason: 'contact from the item',
    };
  }

  const directoryMatch = findInDirectory(bodyName, bodyDirectory);
  if (directoryMatch) {
    return {
      recipient: directoryMatch,
      demoMode: false,
      canSend: true,
      source: 'body-directory',
      reason: 'body clerk',
    };
  }

  return {
    recipient: null,
    demoMode: false,
    canSend: false,
    source: 'none',
    reason: 'no recipient resolved — show the manual filing path instead of guessing an address',
  };
}

function findInDirectory(bodyName, bodyDirectory) {
  const target = normalizeBodyName(bodyName);
  if (!target) return null;
  for (const [key, email] of Object.entries(bodyDirectory)) {
    if (normalizeBodyName(key) === target && isEmail(email)) return email.trim();
  }
  return null;
}
