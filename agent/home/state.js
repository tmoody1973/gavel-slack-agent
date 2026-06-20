import { matchSubscriptions } from '../alerts/match.js';
import { selectStoryLeads } from '../stories/leads.js';
import { selectSalient } from './salience.js';

/**
 * Assemble the HomeState for blockkit/home-view.js from injected boundaries.
 * Strip semantics: a detected row is "relevant" when it matches at least one
 * channel subscription (committee or keyword — alerts/match.js, the same rule
 * the poller uses). Watch hits are upcoming titles containing a watched entity.
 *
 * @param {{
 *   listSubscriptions: () => Promise<Array<object>>,
 *   listAllWatches: () => Promise<Array<{channelId: string, entity: string}>>,
 *   listUpcoming: () => Promise<Array<object>>,
 *   getChannelName: (channelId: string) => Promise<string>,
 * }} deps
 * @returns {Promise<object>} HomeState
 */
export async function buildHomeState(deps) {
  const [subscriptions, watches, upcoming] = await Promise.all([
    deps.listSubscriptions(),
    deps.listAllWatches(),
    deps.listUpcoming(),
  ]);

  const relevant = upcoming.filter((row) => matchSubscriptions(row, subscriptions).length > 0);
  const meetings = new Set(relevant.map((row) => row.eventId)).size;
  const lateAdds = relevant.filter((row) => row.walkOnFlag).length;
  const watchHits = upcoming.filter((row) =>
    watches.some((w) => row.title.toLowerCase().includes(w.entity.toLowerCase())),
  ).length;

  // MOO-123: salient items across the FULL agenda (not just subscription matches),
  // for the "🔎 Discover this week" feed. District boundaries come from subscriptions.
  const boundaries = subscriptions.map((s) => s.boundary?.value).filter(Boolean);
  const discover = selectSalient(upcoming, { boundaries });

  // MOO-127: the journalist lens. Only computed (and only shown) when a reporter-role
  // channel exists — the reporter persona is the switch. Tags-only / LLM-free here so
  // the Home stays fast; the grounded angles live behind `/gavel stories`.
  const hasReporter = subscriptions.some((s) => s.role === 'reporter');
  const storyLeads = hasReporter ? selectStoryLeads(upcoming, { boundaries }) : [];

  const names = await resolveNames(
    [...new Set([...subscriptions.map((s) => s.channelId), ...watches.map((w) => w.channelId)])],
    deps.getChannelName,
  );

  return {
    strip: { meetings, lateAdds, watchHits },
    // Onboarding-completed channels (configured === true). The Home routes to the
    // first-run intro only when there are no subscriptions at all — a poller-written
    // subscription without `configured` still belongs in the hub, not first-run.
    configuredCount: subscriptions.filter((s) => s.configured).length,
    discover,
    storyLeads,
    watches: watches.map((w) => ({ channelId: w.channelId, channelName: names.get(w.channelId), entity: w.entity })),
    channels: subscriptions.map((s) => ({
      channelId: s.channelId,
      channelName: names.get(s.channelId),
      committees: s.committees ?? [],
      keywords: s.keywords ?? [],
      language: s.language ?? 'en',
      role: s.role ?? null,
      configured: s.configured ?? false,
    })),
  };
}

/** Resolve channel names, degrading to the raw id — never let a name kill the Home. */
async function resolveNames(channelIds, getChannelName) {
  const names = new Map();
  await Promise.all(
    channelIds.map(async (id) => {
      try {
        names.set(id, await getChannelName(id));
      } catch {
        names.set(id, id);
      }
    }),
  );
  return names;
}
