import { createHomeDeps } from '../../home/deps.js';
import { makeCoverMultipleAreas, makeWatchlistHow } from './grow.js';
import { makeGoLiveSubmit, makeOpenConfirmModal, makeOpenRoleModal } from './setup.js';
import { makeAskGavel, makeMemberJoined, makeWhatCanYouDo } from './welcome.js';

/**
 * Register the Front Door onboarding listeners. FD-B (MOO-118): the role-modal
 * button, the role-pick → confirm push, the Go-live submit. FD-C (MOO-119): the
 * member-welcome on member_joined_channel + its two threaded-reply actions. FD-D
 * (MOO-120): the adaptive-growth proposals (watchlist How → checklist, App Home
 * "cover multiple areas" → modal). Shares the App Home dependency boundary (Convex
 * reads/writes + channel names) so every handler uses one injected deps object.
 * @param {import('@slack/bolt').App} app
 * @returns {void}
 */
export function register(app) {
  const deps = createHomeDeps(app.client);
  app.action('onboarding_open_role', makeOpenRoleModal(deps));
  app.action(/^onboarding_pick_role_/, makeOpenConfirmModal(deps));
  app.view('onboarding_confirm_modal', makeGoLiveSubmit(deps));

  app.event('member_joined_channel', makeMemberJoined(deps));
  app.action('member_ask_gavel', makeAskGavel());
  app.action('member_what_can_you_do', makeWhatCanYouDo());

  app.action('grow_watchlist_how', makeWatchlistHow());
  app.action('grow_areas', makeCoverMultipleAreas());
}
