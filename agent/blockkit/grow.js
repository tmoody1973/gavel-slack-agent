import { copyFor } from '../onboarding/copy.js';

// Adaptive-growth builders (MOO-120 FD-D · spec §2). Pure Block Kit. Gavel can't
// create channels (Grid has no channels:manage), so growth is a *proposal*: a
// nudge after the first watch, and a per-area checklist for multi-neighborhood
// organizers. Names + /invite steps; the human creates them.

const plain = (text) => ({ type: 'plain_text', text, emoji: true });
const mrkdwn = (text) => ({ type: 'mrkdwn', text });

/** After the first watch: "Want watch-hits in their own #gavel-watchlist? [How →]". */
export function growWatchlistPrompt(language) {
  const t = copyFor(language);
  return {
    blocks: [
      { type: 'section', text: mrkdwn(t.growPrompt) },
      {
        type: 'actions',
        elements: [{ type: 'button', text: plain(t.growHow), action_id: 'grow_watchlist_how', value: language }],
      },
    ],
  };
}

/** The revealed checklist: create #gavel-watchlist · /invite @Gavel · done. */
export function growWatchlistCard(language) {
  const t = copyFor(language);
  return { blocks: [{ type: 'section', text: mrkdwn(t.growChecklist) }] };
}

/** Per-area proposal blocks: suggested names + per-channel language + invite steps. */
export function growAreasBlocks(language) {
  const t = copyFor(language);
  return [{ type: 'section', text: mrkdwn(t.growAreasIntro) }];
}

/** The per-area proposal as a modal (the App Home button has no channel to post to). */
export function growAreasModal(language) {
  return {
    type: 'modal',
    callback_id: 'grow_areas_modal',
    title: plain('Cover more areas'),
    close: plain('Got it'),
    blocks: growAreasBlocks(language),
  };
}
