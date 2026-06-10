import { createHomeDeps } from '../../home/deps.js';
import { makeAddWatchSubmit, makeChannelConfigSubmit } from './home-modals.js';

/**
 * Register view listeners with the Bolt app.
 * @param {import('@slack/bolt').App} app
 * @returns {void}
 */
export function register(app) {
  const homeDeps = createHomeDeps(app.client);
  app.view('home_add_watch_modal', makeAddWatchSubmit(homeDeps));
  app.view('home_channel_config_modal', makeChannelConfigSubmit(homeDeps));
}
