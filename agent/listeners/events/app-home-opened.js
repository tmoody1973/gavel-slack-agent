import { publishHome } from '../../home/publish.js';

/**
 * Publish the Hybrid App Home when a user opens the Home tab (MOO-74).
 * Deps are injected by listeners/events/index.js (home/deps.js).
 */
export function makeAppHomeOpened(deps) {
  return async function handleAppHomeOpened({ client, context, logger }) {
    const userId = /** @type {string} */ (context.userId);
    await publishHome({ client, userId }, deps, logger);
  };
}
