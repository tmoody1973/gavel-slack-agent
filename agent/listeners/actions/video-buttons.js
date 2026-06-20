// Meeting-video discovery handlers (MOO-142). The App Home 📋 Browse videos button and
// the /gavel video command both open the same filterable modal; its committee dropdown
// re-renders via views.update. Mirrors story-buttons.js: the cheap pipeline (live Legistar
// + one Convex ingested-id query) is refetched on each interaction, so the filter is
// stateless. Boundaries are injected for testability.

import { tagSearchable, videoModal } from '../../blockkit/index.js';
import { decodeCommittee } from '../../blockkit/video-modal.js';

const safeParse = (json) => {
  try {
    return JSON.parse(json ?? '{}');
  } catch {
    return {};
  }
};

/**
 * Fetch recent meetings-with-video, tag each searchable, and resolve the Home's
 * English-default language. Always pulls the FULL set so the dropdown lists every
 * committee with video; the modal builder slices the visible rows by committee.
 */
export async function fetchVideoMeetings(deps) {
  const [meetings, ingested, subscriptions] = await Promise.all([
    deps.listRecentMeetingsWithVideo(),
    deps.listIngestedEventIds(),
    deps.listSubscriptions(),
  ]);
  const language = subscriptions.length > 0 && subscriptions.every((s) => s.language === 'es') ? 'es' : 'en';
  return { meetings: tagSearchable(meetings, ingested), language };
}

/** 📋 Browse videos → open the filterable meeting-video modal. */
export function makeVideoBrowse(deps) {
  return async ({ ack, body, client, logger }) => {
    await ack();
    try {
      const { meetings, language } = await fetchVideoMeetings(deps);
      await client.views.open({
        trigger_id: body.trigger_id,
        view: videoModal(meetings, { language, committee: null }),
      });
    } catch (e) {
      logger.error(`video browse open failed: ${e}`);
    }
  };
}

/** Committee dropdown changed → re-slice the meetings and re-render via views.update. */
export function makeVideoFilter(deps) {
  return async ({ ack, body, client, logger }) => {
    await ack();
    try {
      const committee = decodeCommittee(body.actions?.[0]?.selected_option?.value);
      const language = safeParse(body.view?.private_metadata).language ?? 'en';
      const { meetings } = await fetchVideoMeetings(deps);
      await client.views.update({ view_id: body.view.id, view: videoModal(meetings, { language, committee }) });
    } catch (e) {
      logger.error(`video filter update failed: ${e}`);
    }
  };
}
