import { SessionStore } from './store.js';

export const sessionStore = new SessionStore();

/**
 * Matter-context preambles for threads primed by the Ask Gavel button
 * (MOO-73). A prime only matters until the user's first reply, so 1h TTL.
 */
export const primeStore = new SessionStore(3600);
