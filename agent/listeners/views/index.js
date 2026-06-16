import { createParcelClient } from '../../../mcp-server/src/parcel.js';
import { createHomeDeps } from '../../home/deps.js';
import { makeAddWatchSubmit, makeChannelConfigSubmit } from './home-modals.js';
import { makeParcelLookupSubmit } from './parcel-lookup.js';

/**
 * Register view listeners with the Bolt app.
 * @param {import('@slack/bolt').App} app
 * @returns {void}
 */
export function register(app) {
  const homeDeps = createHomeDeps(app.client);
  app.view('home_add_watch_modal', makeAddWatchSubmit(homeDeps));
  app.view('home_channel_config_modal', makeChannelConfigSubmit(homeDeps));

  const parcel = createParcelClient({
    fetch: globalThis.fetch,
    userAgent: 'gavel-slack-agent (tarik@radiomilwaukee.org)',
  });
  app.view('parcel_lookup_modal', makeParcelLookupSubmit({ lookupParcel: (a) => parcel.lookupParcel(a) }));
}
