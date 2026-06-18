import { createHomeDeps } from '../../home/deps.js';
import { makeGoLiveSubmit, makeOpenConfirmModal, makeOpenRoleModal } from './setup.js';

/**
 * Register the Front Door onboarding listeners (MOO-118 FD-B): the role-modal
 * button, the role-pick → confirm push, and the Go-live submit. Shares the App
 * Home dependency boundary (Convex reads/writes + channel names) so the Go-live
 * write and the Home republish use one injected deps object.
 * @param {import('@slack/bolt').App} app
 * @returns {void}
 */
export function register(app) {
  const deps = createHomeDeps(app.client);
  app.action('onboarding_open_role', makeOpenRoleModal(deps));
  app.action('onboarding_pick_role', makeOpenConfirmModal(deps));
  app.view('onboarding_confirm_modal', makeGoLiveSubmit(deps));
}
